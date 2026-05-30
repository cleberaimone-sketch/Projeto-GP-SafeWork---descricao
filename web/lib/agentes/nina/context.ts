import {
  getEmpresasClientes,
  getExamesDetalhados,
  getFaturamento,
  getRiscos,
  getDocumentosVencimentos,
  socConfigurado,
} from '@/lib/soc/client'

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
  ticket_medio_por_vida: number | null
}

export interface ContextoNina {
  data_analise: string
  snapshot: SnapshotCarteira
  oportunidades: OportunidadeNina[]
  docs_vencendo: Array<{ empresa: string; documento: string; vencimento: string }>
  resumo_texto: string
}

// Tipos de exame que indicam risco e exigem exames complementares
const EXAMES_BASICOS = ['CONSULTA', 'CLINICO', 'ASO']
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
  const d60str = `${String(d60.getDate()).padStart(2,'0')}/${String(d60.getMonth()+1).padStart(2,'0')}/${d60.getFullYear()}`

  const [empresas, examesDetalhados, riscos, docsVencendo] = await Promise.all([
    getEmpresasClientes().catch(() => []),
    getExamesDetalhados(90).catch(() => []) as Promise<Array<Record<string,string>>>,
    getRiscos().catch(() => []) as Promise<Array<Record<string,string>>>,
    getDocumentosVencimentos('', '').catch(() => []) as Promise<Array<Record<string,string>>>,
  ])

  // Snapshot da carteira
  const empresasComVidas = empresas.filter(e => Number(e.NUMERO_VIDAS ?? 0) > 0)
  const totalVidas = empresasComVidas.reduce((s, e) => s + Number(e.NUMERO_VIDAS ?? 0), 0)

  // Agrupa exames por empresa nos últimos 90 dias
  const examesPorEmpresa: Record<string, Set<string>> = {}
  const examesCountPorEmpresa: Record<string, number> = {}
  for (const e of examesDetalhados) {
    const cod = e.EMPRESA ?? e.NOMEEMPRESA ?? ''
    if (!cod) continue
    if (!examesPorEmpresa[cod]) examesPorEmpresa[cod] = new Set()
    if (e.NOMEEXAME) examesPorEmpresa[cod].add(normaliza(e.NOMEEXAME))
    examesCountPorEmpresa[cod] = (examesCountPorEmpresa[cod] ?? 0) + 1
  }

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

  for (const emp of empresasComVidas.slice(0, 200)) {
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

    // Sem exames nos últimos 90 dias — churn risk
    if (!temExames && vidas >= 5) {
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

  // Ordena oportunidades por receita potencial e limita a 10
  oportunidades.sort((a, b) => b.receita_potencial_ano - a.receita_potencial_ano)
  const top10 = oportunidades.slice(0, 10)

  const snapshot: SnapshotCarteira = {
    total_empresas: empresas.length,
    empresas_com_vidas: empresasComVidas.length,
    total_vidas: totalVidas,
    ticket_medio_por_vida: totalVidas > 0 ? null : null,
  }

  const resumo = `Carteira: ${empresasComVidas.length} empresas ativas, ${totalVidas.toLocaleString('pt-BR')} vidas. ` +
    `${top10.length} oportunidades identificadas. ` +
    `Receita potencial total: R$${top10.reduce((s, o) => s + o.receita_potencial_ano, 0).toLocaleString('pt-BR')}/ano.`

  return {
    data_analise: dataAnalise,
    snapshot,
    oportunidades: top10,
    docs_vencendo: docsAlerta.slice(0, 20),
    resumo_texto: resumo,
  }
}

export function contextoParaPrompt(ctx: ContextoNina): string {
  const linhas = [
    `## DADOS DA ANÁLISE — ${ctx.data_analise}`,
    '',
    `### SNAPSHOT DA CARTEIRA`,
    `- Total de empresas no SOC: ${ctx.snapshot.total_empresas}`,
    `- Empresas com funcionários ativos (NUMERO_VIDAS > 0): ${ctx.snapshot.empresas_com_vidas}`,
    `- Total de vidas gerenciadas: ${ctx.snapshot.total_vidas.toLocaleString('pt-BR')}`,
    '',
    `### OPORTUNIDADES IDENTIFICADAS (${ctx.oportunidades.length})`,
  ]

  for (const [i, op] of ctx.oportunidades.entries()) {
    linhas.push(`${i + 1}. **${op.empresa}** [${op.tipo}]`)
    linhas.push(`   ${op.descricao}`)
    linhas.push(`   Receita potencial: R$${op.receita_potencial_ano.toLocaleString('pt-BR')}/ano`)
  }

  if (ctx.docs_vencendo.length > 0) {
    linhas.push('', `### DOCUMENTOS VENCENDO NOS PRÓXIMOS 60 DIAS`)
    for (const d of ctx.docs_vencendo.slice(0, 10)) {
      linhas.push(`- ${d.empresa} — ${d.documento} — ${d.vencimento}`)
    }
  }

  return linhas.join('\n')
}
