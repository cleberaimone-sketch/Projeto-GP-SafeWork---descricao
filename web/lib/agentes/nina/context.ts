import { createClient } from '@supabase/supabase-js'
import {
  getEmpresasClientes,
  getRiscos,
  getDocumentosVencimentos,
} from '@/lib/soc/client'
import { lerRpcPaginado } from '@/lib/supabase/paginar'

export interface OportunidadeNina {
  empresa: string
  codigo: string
  tipo: 'upsell_exames' | 'servico_ausente' | 'churn_risk' | 'ticket_baixo' | 'novo_servico'
  descricao: string
  receita_potencial_ano: number
  prioridade: number  // 1 = mais alta
}

export interface SnapshotCarteira {
  total_empresas: number
  empresas_com_vidas: number
  total_vidas: number
  /** Quantas empresas foram analisadas para gerar oportunidades. */
  empresas_analisadas: number
}

export interface ContextoNina {
  data_analise: string
  snapshot: SnapshotCarteira
  /** Recorte: as maiores. A contagem cheia está em oportunidades_total. */
  oportunidades: OportunidadeNina[]
  oportunidades_total: number
  /** Receita potencial de TODAS, não só das listadas. */
  receita_potencial_total: number
  docs_vencendo: Array<{ empresa: string; documento: string; vencimento: string }>
  docs_vencendo_total: number
  resumo_texto: string
  /** O que o SOC não entregou nesta montagem. Vazio = tudo respondeu. */
  falhas_soc: string[]
}

// isSoBasico decide pela AUSÊNCIA de complementar, então a lista de básicos
// nunca foi consultada — ficava só descrevendo a intenção.
const EXAMES_COMPLEMENTARES = ['AUDIOMETRIA', 'ESPIROMETRIA', 'ACUIDADE', 'HEMOGRAMA', 'GLICEMIA', 'ECG', 'EEG', 'RAIO']

function normaliza(s: string): string {
  return s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function isSoBasico(tiposExame: Set<string>): boolean {
  for (const t of tiposExame) {
    const n = normaliza(t)
    if (EXAMES_COMPLEMENTARES.some(c => n.includes(c))) return false
  }
  return true
}

export async function buildContextoNina(): Promise<ContextoNina> {
  const hoje = new Date()
  const dataAnalise = hoje.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const d60 = new Date(Date.now() + 60 * 86_400_000)

  // As falhas do SOC precisam chegar à Nina como "não sei", não como zero.
  // Com `.catch(() => [])` a API fora do ar e a carteira vazia produziam o
  // mesmo contexto, e ela responderia "nenhuma empresa com risco" com a mesma
  // convicção nos dois casos.
  const falhasSOC: string[] = []
  const tentar = async <T,>(nome: string, buscar: () => Promise<T>, vazio: T): Promise<T> => {
    try {
      return await buscar()
    } catch (e) {
      falhasSOC.push(nome)
      console.error(`[SOC] ${nome} falhou:`, e)
      return vazio
    }
  }

  // Exames vêm do ESPELHO, não da máscara ao vivo.
  //
  // Aqui havia getExamesDetalhados(90), que exige o código de uma empresa
  // cliente e era chamada sem ele: falhava em toda montagem. E a consequência
  // não era campo em branco, era output fabricado — sem exames, `temExames` é
  // falso para todas, então TODA empresa com 5 vidas ou mais virava
  // 'churn_risk' ("nenhum exame nos últimos 90 dias") e nenhum upsell ou
  // ticket baixo jamais era gerado. A Nina mandava ligar para cliente ativo.
  //
  // O espelho tem os exames de todas as empresas sem exigir código. São 766
  // empresas com movimento em 90 dias, acima do teto do PostgREST — daí o
  // lerRpcPaginado.
  type ExamesEmpresa = {
    empresa_soc: string; nome_empresa: string | null
    exames: number; trabalhadores_estimados: number; tipos_de_exame: string[] | null
  }
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const [empresas, examesPorEmpresaRows, riscos, docsVencendo] = await Promise.all([
    tentar('empresas clientes', () => getEmpresasClientes(), [] as Array<Record<string,string>>),
    tentar('exames do espelho', () =>
      lerRpcPaginado<ExamesEmpresa>(db, 'fn_soc_exames_por_empresa', { p_dias: 90 }), [] as ExamesEmpresa[]),
    tentar('riscos (GHE)', () => getRiscos() as Promise<Array<Record<string,string>>>, []),
    tentar('documentos vencendo', () => getDocumentosVencimentos('', '') as Promise<Array<Record<string,string>>>, []),
  ])

  // Snapshot da carteira
  const empresasComVidas = empresas.filter(e => Number(e.NUMERO_VIDAS ?? 0) > 0)
  const totalVidas = empresasComVidas.reduce((s, e) => s + Number(e.NUMERO_VIDAS ?? 0), 0)

  // Já vem agrupado do banco: código da empresa → tipos de exame e contagem.
  const examesPorEmpresa: Record<string, Set<string>> = {}
  const examesCountPorEmpresa: Record<string, number> = {}
  for (const e of examesPorEmpresaRows) {
    const cod = String(e.empresa_soc)
    examesPorEmpresa[cod] = new Set((e.tipos_de_exame ?? []).map(normaliza))
    examesCountPorEmpresa[cod] = Number(e.exames ?? 0)
  }
  // Sem a fonte de exames não há como distinguir "cliente parado" de "não
  // consultei": toda empresa pareceria parada. Melhor não gerar oportunidade
  // nenhuma do que gerar churn para a carteira inteira.
  const examesConhecidos = !falhasSOC.includes('exames do espelho')

  // GHE por empresa (riscos)
  const riscosPorEmpresa: Record<string, { insalubre: boolean; perigoso: boolean; aposentEspecial: boolean }> = {}
  for (const r of riscos) {
    const cod = r.codigoUnidadeCliente ?? r.EMPRESA ?? ''
    if (!cod) continue
    if (!riscosPorEmpresa[cod]) riscosPorEmpresa[cod] = { insalubre: false, perigoso: false, aposentEspecial: false }
    if (r.maiorAdicionalInsalubridade && r.maiorAdicionalInsalubridade !== '0') riscosPorEmpresa[cod].insalubre = true
    if (r.existePericulosidade === 'true' || r.existePericulosidade === '1') riscosPorEmpresa[cod].perigoso = true
    if (r.existeAposentadoriaEspecial === 'true' || r.existeAposentadoriaEspecial === '1') riscosPorEmpresa[cod].aposentEspecial = true
  }

  const oportunidades: OportunidadeNina[] = []

  // A carteira inteira, não as 200 primeiras da ordem que a API devolveu.
  // O recorte antigo deixava a 201ª empresa em diante sem nenhuma avaliação, e
  // o snapshot ao lado contava a carteira toda — dois números da mesma tela
  // falando de conjuntos diferentes.
  for (const emp of empresasComVidas) {
    const vidas = Number(emp.NUMERO_VIDAS ?? 0)
    if (vidas < 3) continue

    const tiposExame = examesPorEmpresa[emp.CODIGO] ?? examesPorEmpresa[emp.NOME] ?? new Set<string>()
    const risco = riscosPorEmpresa[emp.CODIGO] ?? riscosPorEmpresa[emp.NOME]
    const temExames = tiposExame.size > 0

    // Upsell: tem vidas e só faz exame básico
    if (temExames && isSoBasico(tiposExame) && vidas >= 5) {
      const potencial = vidas * 40  // ~R$40/vida/ano em exames complementares
      oportunidades.push({
        empresa: emp.NOME,
        codigo: emp.CODIGO,
        tipo: 'upsell_exames',
        descricao: `${vidas} vidas — só exame básico/ASO, sem complementares (audiometria, espirometria, hemograma). Pacote de exames completo estimado.`,
        receita_potencial_ano: potencial,
        prioridade: vidas >= 20 ? 1 : vidas >= 10 ? 2 : 3,
      })
    }

    // Upsell: tem risco de insalubridade mas sem audiometria registrada
    if (risco?.insalubre) {
      const temAudiometria = [...tiposExame].some(t => t.includes('AUDIOMETRIA'))
      if (!temAudiometria) {
        oportunidades.push({
          empresa: emp.NOME,
          codigo: emp.CODIGO,
          tipo: 'upsell_exames',
          descricao: `GHE com insalubridade registrada mas sem audiometria nos últimos 90 dias — obrigatória pela NHO-01. ${vidas} vidas.`,
          receita_potencial_ano: vidas * 40,
          prioridade: 1,
        })
      }
    }

    // Ticket baixo: muitas vidas, poucos exames
    if (vidas >= 20 && temExames) {
      const examesPerVida = (examesCountPorEmpresa[emp.CODIGO] ?? 0) / vidas
      if (examesPerVida < 1.5) {
        oportunidades.push({
          empresa: emp.NOME,
          codigo: emp.CODIGO,
          tipo: 'ticket_baixo',
          descricao: `${vidas} vidas mas apenas ${(examesPerVida).toFixed(1)} exames/vida nos últimos 90 dias — ticket muito abaixo do potencial.`,
          receita_potencial_ano: vidas * (3 - examesPerVida) * 35,
          prioridade: 2,
        })
      }
    }

    // Sem exames nos últimos 90 dias — churn risk.
    // Só vale se a fonte de exames respondeu: ausência de dado não é ausência
    // de exame.
    if (examesConhecidos && !temExames && vidas >= 5) {
      oportunidades.push({
        empresa: emp.NOME,
        codigo: emp.CODIGO,
        tipo: 'churn_risk',
        descricao: `${vidas} vidas na carteira mas nenhum exame nos últimos 90 dias — possível churn ou pausa contratual.`,
        receita_potencial_ano: vidas * 100,
        prioridade: 1,
      })
    }
  }

  // Documentos vencendo em 60 dias
  const docsAlerta: Array<{ empresa: string; documento: string; vencimento: string }> = []
  for (const d of docsVencendo) {
    if (!d.DATA_VENCIMENTO || d.DATA_VENCIMENTO === '00/00/0000') continue
    const [dia, mes, ano] = (d.DATA_VENCIMENTO ?? '').split('/')
    if (!ano || ano === '0000') continue
    const venc = new Date(Number(ano), Number(mes) - 1, Number(dia))
    if (venc <= d60 && venc >= hoje) {
      docsAlerta.push({
        empresa: d.NOME_PRODUTO ? (d.LOCAL_TRABALHO ?? 'Empresa') : 'Empresa',
        documento: d.NOME_PRODUTO ?? 'Documento',
        vencimento: d.DATA_VENCIMENTO,
      })
    }
  }

  // O total é calculado ANTES do recorte. Antes a soma era feita sobre as 10
  // listadas e rotulada "Receita potencial total" — com 300 oportunidades, a
  // Nina anunciava o potencial de dez delas como se fosse o da carteira.
  oportunidades.sort((a, b) => b.receita_potencial_ano - a.receita_potencial_ano)
  const potencialTotal = oportunidades.reduce((s, o) => s + o.receita_potencial_ano, 0)
  const top10 = oportunidades.slice(0, 10)

  const snapshot: SnapshotCarteira = {
    total_empresas: empresas.length,
    empresas_com_vidas: empresasComVidas.length,
    total_vidas: totalVidas,
    empresas_analisadas: empresasComVidas.length,
  }

  const resumo = `Carteira: ${empresasComVidas.length} empresas ativas, ${totalVidas.toLocaleString('pt-BR')} vidas. ` +
    `${oportunidades.length} oportunidades identificadas` +
    (top10.length < oportunidades.length ? ` (as ${top10.length} maiores estão detalhadas)` : '') + '. ' +
    `Receita potencial total: R$${potencialTotal.toLocaleString('pt-BR')}/ano.` +
    (examesConhecidos ? '' : ' ATENÇÃO: a fonte de exames não respondeu — nenhuma análise de churn foi feita.')

  return {
    data_analise: dataAnalise,
    snapshot,
    oportunidades: top10,
    oportunidades_total: oportunidades.length,
    receita_potencial_total: potencialTotal,
    docs_vencendo: docsAlerta.slice(0, 20),
    docs_vencendo_total: docsAlerta.length,
    resumo_texto: resumo,
    falhas_soc: falhasSOC,
  }
}

export function contextoParaPrompt(ctx: ContextoNina): string {
  const linhas = [
    `## DADOS DA ANÁLISE — ${ctx.data_analise}`,
    '',
    // Sem este aviso, uma consulta que falhou vira "nenhuma oportunidade" no
    // relatório — e a Nina afirma isso com a mesma segurança de quando o SOC
    // respondeu e a carteira estava mesmo limpa.
    ...(ctx.falhas_soc.length > 0
      ? [`> ATENÇÃO: o SOC não respondeu sobre ${ctx.falhas_soc.join(', ')}.`,
         '> Os números abaixo estão INCOMPLETOS nessas frentes. Não conclua ausência',
         '> a partir delas — diga que o dado não veio.', '']
      : []),
    `### SNAPSHOT DA CARTEIRA`,
    `- Total de empresas no SOC: ${ctx.snapshot.total_empresas}`,
    `- Empresas com funcionários ativos (NUMERO_VIDAS > 0): ${ctx.snapshot.empresas_com_vidas}`,
    `- Total de vidas gerenciadas: ${ctx.snapshot.total_vidas.toLocaleString('pt-BR')}`,
    '',
    // O número no cabeçalho é o total, não o tamanho do recorte: era
    // ctx.oportunidades.length, sempre no máximo 10, e a Nina escrevia
    // "10 oportunidades" com 300 na carteira.
    `### OPORTUNIDADES IDENTIFICADAS (${ctx.oportunidades_total})`,
    ...(ctx.oportunidades_total > ctx.oportunidades.length
      ? [`> Detalhadas abaixo apenas as ${ctx.oportunidades.length} de maior receita potencial.`,
         `> Potencial de TODAS: R$${ctx.receita_potencial_total.toLocaleString('pt-BR')}/ano.`]
      : []),
  ]

  for (const [i, op] of ctx.oportunidades.entries()) {
    linhas.push(`${i + 1}. **${op.empresa}** [${op.tipo}]`)
    linhas.push(`   ${op.descricao}`)
    linhas.push(`   Receita potencial: R$${op.receita_potencial_ano.toLocaleString('pt-BR')}/ano`)
  }

  if (ctx.docs_vencendo.length > 0) {
    linhas.push('', `### DOCUMENTOS VENCENDO NOS PRÓXIMOS 60 DIAS (${ctx.docs_vencendo_total})`)
    for (const d of ctx.docs_vencendo.slice(0, 10)) {
      linhas.push(`- ${d.empresa} — ${d.documento} — ${d.vencimento}`)
    }
    if (ctx.docs_vencendo_total > 10) {
      linhas.push(`- ... e mais ${ctx.docs_vencendo_total - 10}. Peça a lista completa se precisar.`)
    }
  }

  return linhas.join('\n')
}
