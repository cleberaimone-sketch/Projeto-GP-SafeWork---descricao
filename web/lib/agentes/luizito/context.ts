// ============================================================
// Luizito — Contexto comercial para o agente
// Fontes: SOC (clientes + vidas) + Conta Azul (receita) + SOC Documentos (oportunidades)
// ============================================================

import { createClient } from '@supabase/supabase-js'
import {
  getEmpresasClientes,
  getDocumentosVencimentos,
  socConfigurado,
} from '@/lib/soc/client'
import {
  carregarCategoriasExcluidas,
  filtrarParaDRE,
} from '@/lib/financeiro/regras'
import {
  d4signConfigurado,
  listarDocumentos,
  STATUS_D4SIGN,
} from '@/lib/d4sign/client'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function hoje() { return new Date().toISOString().split('T')[0] }
function diasAtras(n: number) {
  return new Date(Date.now() - n * 86_400_000).toISOString().split('T')[0]
}
function diasAFrente(n: number) {
  return new Date(Date.now() + n * 86_400_000).toISOString().split('T')[0]
}

const DOCS_COMERCIAIS = ['PGR', 'LTCAT', 'PCMSO', 'PPP', 'PCMAT', 'NR-']

export async function buildLuizitoContext(pergunta?: string): Promise<string> {
  const supabase = getSupabase()
  const socOk = socConfigurado()
  const context: Record<string, unknown> = {
    data_consulta: hoje(),
    soc_configurado: socOk,
    pergunta: pergunta ?? null,
  }

  // ── Receita dos últimos 90 dias (Conta Azul) ──────────────────────────────
  const [lancamentosResult, excluidas] = await Promise.all([
    supabase
      .from('lancamentos_financeiros')
      .select('tipo, status, valor, categoria, empresa_id, data_vencimento')
      .eq('tipo', 'receita')
      .neq('status', 'cancelado')
      .gte('data_vencimento', diasAtras(90))
      .lte('data_vencimento', diasAFrente(30)),
    carregarCategoriasExcluidas(supabase),
  ])

  const receitas = filtrarParaDRE(lancamentosResult.data ?? [], excluidas)
    .filter(l => l.tipo === 'receita')

  const receitaTotal = receitas.reduce((s, l) => s + Number(l.valor ?? 0), 0)
  const receitaVencida = receitas.filter(l => l.status === 'vencido').reduce((s, l) => s + Number(l.valor ?? 0), 0)
  const receitaPendente = receitas.filter(l => l.status === 'pendente').reduce((s, l) => s + Number(l.valor ?? 0), 0)

  context.financeiro = {
    receita_90d: receitaTotal,
    inadimplencia: receitaVencida,
    a_receber_30d: receitaPendente,
    lancamentos_receita: receitas.length,
  }

  // ── Clientes SOC (empresas + vidas) ──────────────────────────────────────
  if (socOk) {
    try {
      const [empresas, documentos] = await Promise.all([
        getEmpresasClientes(),
        getDocumentosVencimentos().catch(() => []),
      ])

      const empresasComVidas = empresas
        .filter(e => Number(e.NUMERO_VIDAS ?? 0) > 0)
        .sort((a, b) => Number(b.NUMERO_VIDAS ?? 0) - Number(a.NUMERO_VIDAS ?? 0))

      const totalVidas = empresasComVidas.reduce((s, e) => s + Number(e.NUMERO_VIDAS ?? 0), 0)

      context.clientes_soc = {
        total_empresas: empresas.length,
        empresas_com_vidas: empresasComVidas.length,
        total_vidas: totalVidas,
        top_clientes: empresasComVidas.slice(0, 10).map(e => ({
          nome: e.NOME,
          codigo: e.CODIGO,
          vidas: Number(e.NUMERO_VIDAS ?? 0),
        })),
      }

      // Documentos comerciais vencendo (oportunidades de renovação)
      type DocSOC = { CODIGO_CLIENTE?: string; NOME_PRODUTO?: string; LOCAL_TRABALHO?: string; DATA_VENCIMENTO?: string }
      const docs = documentos as DocSOC[]
      const empMap: Record<string, string> = Object.fromEntries(empresas.map(e => [e.CODIGO, e.NOME]))

      const oportunidades = docs
        .filter(d => {
          if (!d.NOME_PRODUTO) return false
          const nome = d.NOME_PRODUTO.toUpperCase()
          return DOCS_COMERCIAIS.some(kw => nome.includes(kw))
        })
        .map(d => {
          const venc = d.DATA_VENCIMENTO ?? ''
          const [dia, mes, ano] = venc.split('/')
          const iso = ano && ano !== '0000'
            ? `${ano}-${mes?.padStart(2, '0')}-${dia?.padStart(2, '0')}`
            : ''
          let urgencia = 'ok'
          if (iso) {
            if (iso < hoje()) urgencia = 'vencido'
            else if (iso <= diasAFrente(30)) urgencia = 'urgente'
            else if (iso <= diasAFrente(60)) urgencia = 'atencao'
          }
          return {
            cliente: empMap[d.CODIGO_CLIENTE ?? ''] ?? d.CODIGO_CLIENTE ?? 'Desconhecido',
            documento: d.NOME_PRODUTO ?? '',
            vencimento: venc,
            urgencia,
          }
        })
        .filter(o => o.urgencia !== 'ok')
        .sort((a, b) => {
          const ord: Record<string, number> = { vencido: 0, urgente: 1, atencao: 2 }
          return (ord[a.urgencia] ?? 3) - (ord[b.urgencia] ?? 3)
        })
        .slice(0, 20)

      context.oportunidades_renovacao = {
        total: oportunidades.length,
        detalhes: oportunidades,
      }
    } catch {
      context.clientes_soc = { erro: 'Falha ao buscar dados do SOC' }
    }
  } else {
    context.clientes_soc = { aviso: 'SOC não configurado — sem dados de empresas clientes' }
  }

  // ── Contratos D4sign ─────────────────────────────────────────────────────
  if (d4signConfigurado()) {
    try {
      const docs = await listarDocumentos()
      const aguardando = docs.filter(d => d.statusId === '2')
      const assinados  = docs.filter(d => d.statusId === '3')
      const seteADias  = Date.now() - 7 * 86_400_000

      const parados = aguardando.filter(d =>
        d.created_at && new Date(d.created_at).getTime() < seteADias
      )

      const byStatus = docs.reduce<Record<string, number>>((acc, d) => {
        const label = STATUS_D4SIGN[d.statusId] ?? `status_${d.statusId}`
        acc[label] = (acc[label] ?? 0) + 1
        return acc
      }, {})

      context.contratos_d4sign = {
        total_documentos: docs.length,
        aguardando_assinatura: aguardando.length,
        assinados_total: assinados.length,
        parados_7dias: parados.length,
        por_status: byStatus,
        pendentes: aguardando.slice(0, 10).map(d => ({
          nome: d.nameDoc,
          criado: d.created_at ?? '',
          parado_dias: d.created_at
            ? Math.floor((Date.now() - new Date(d.created_at).getTime()) / 86_400_000)
            : null,
        })),
      }
    } catch {
      context.contratos_d4sign = { aviso: 'D4sign indisponível no momento' }
    }
  } else {
    context.contratos_d4sign = { aviso: 'D4sign não configurado — sem dados de contratos' }
  }

  return JSON.stringify(context, null, 2)
}
