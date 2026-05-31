import {
  getFuncionarios,
  getEntregasEpi,
  getRiscos,
  socConfigurado,
} from '@/lib/soc/client'

function hoje() { return new Date().toISOString().split('T')[0] }
function diasAtras(n: number) {
  return new Date(Date.now() - n * 86400000).toISOString().split('T')[0]
}

export async function buildDieguitorContext(foco?: string): Promise<string> {
  const ctx: Record<string, unknown> = {
    data_referencia: hoje(),
    soc_configurado: socConfigurado(),
  }

  if (!socConfigurado()) {
    ctx.aviso = 'SOC não configurado. Copiar máscaras em Menu → Relatórios → Relatório Exporta Dados e preencher SOC_MASK_* no Vercel.'
    if (foco) ctx.foco_pergunta = foco
    return JSON.stringify(ctx, null, 2)
  }

  const [funcionarios, entregas, riscos] = await Promise.all([
    getFuncionarios(),
    getEntregasEpi(),
    getRiscos(),
  ])

  // EPIs — máscara 193046 (campos uppercase com underscore)
  // Campos: EMPRESA, MATRICULA, NOME_EPI, CODIGO_EPI, CODIGO_CA, DATA_VENCIMENTO,
  //   REPOSICAO, TIPO_REPOSICAO (DATA_TROCA sempre vazio, QUANTIDADE_ENTREGUE sempre 1)
  type EntregaEpi = {
    EMPRESA?: string; MATRICULA?: string; NOME_EPI?: string
    CODIGO_EPI?: string; CODIGO_CA?: string; DATA_VENCIMENTO?: string
    REPOSICAO?: string; TIPO_REPOSICAO?: string
  }
  const dataHoje = hoje()
  const epiList = entregas as EntregaEpi[]

  const caCaVencido = epiList.filter(e => e.DATA_VENCIMENTO && e.DATA_VENCIMENTO < dataHoje)
  const caA30Dias   = epiList.filter(e => e.DATA_VENCIMENTO && e.DATA_VENCIMENTO >= dataHoje && e.DATA_VENCIMENTO <= diasAtras(-30))

  const nomeEpiMap: Record<string, number> = {}
  for (const e of epiList) {
    if (e.NOME_EPI) nomeEpiMap[e.NOME_EPI] = (nomeEpiMap[e.NOME_EPI] ?? 0) + 1
  }

  ctx.epis = {
    total: epiList.length,
    ca_vencido: {
      quantidade: caCaVencido.length,
      lista: caCaVencido.slice(0, 20).map(e => ({ matricula: e.MATRICULA, epi: e.NOME_EPI, ca: e.CODIGO_CA, vencimento: e.DATA_VENCIMENTO })),
    },
    ca_vencendo_30d: {
      quantidade: caA30Dias.length,
      lista: caA30Dias.slice(0, 20).map(e => ({ matricula: e.MATRICULA, epi: e.NOME_EPI, ca: e.CODIGO_CA, vencimento: e.DATA_VENCIMENTO })),
    },
    top_epis: Object.entries(nomeEpiMap).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([epi, qtd]) => ({ epi, quantidade: qtd })),
    nota: 'CA vencido = EPI irregular = passivo trabalhista. DATA_TROCA sempre vazio nesta máscara.',
  }

  // GHE — máscara 193691 (campos camelCase)
  type Ghe = {
    codigoGhe?: string; descricaoGhe?: string; codigoUnidadeCliente?: string
    maiorAdicionalInsalubridade?: string; existePericulosidade?: string
    existeAposentadoriaEspecial?: string; maiorPeriodoAposentadoria?: string
  }
  const gheList = riscos as Ghe[]
  const comInsalubridade = gheList.filter(g => g.maiorAdicionalInsalubridade && g.maiorAdicionalInsalubridade !== '0')
  const comPericulosidade = gheList.filter(g => g.existePericulosidade === 'S' || g.existePericulosidade === 'Sim')
  const comAposentEspecial = gheList.filter(g => g.existeAposentadoriaEspecial === 'S' || g.existeAposentadoriaEspecial === 'Sim')

  ctx.ghe_riscos = {
    total_ghe: gheList.length,
    com_insalubridade: comInsalubridade.length,
    com_periculosidade: comPericulosidade.length,
    com_aposentadoria_especial: comAposentEspecial.length,
    lista: gheList.slice(0, 30).map(g => ({
      codigo: g.codigoGhe,
      descricao: g.descricaoGhe,
      unidade: g.codigoUnidadeCliente,
      adicional_insalubridade: g.maiorAdicionalInsalubridade,
      periculosidade: g.existePericulosidade,
      aposentadoria_especial: g.existeAposentadoriaEspecial,
      periodo_aposentadoria: g.maiorPeriodoAposentadoria,
    })),
    nota: 'GHE = grupo com mesma exposição. Base para LTCAT e PPP. Adicional insalubridade em % sobre salário mínimo.',
  }

  // Headcount por empresa (campos uppercase da máscara 192399)
  const empMap: Record<string, number> = {}
  for (const f of funcionarios as Array<{ NOMEEMPRESA?: string; nomeEmpresa?: string }>) {
    const emp = f.NOMEEMPRESA ?? f.nomeEmpresa ?? 'Sem empresa'
    empMap[emp] = (empMap[emp] ?? 0) + 1
  }
  const ativos = (funcionarios as Array<{ SITUACAO?: string }>).filter(f => f.SITUACAO === 'Ativo').length
  ctx.headcount = { total: funcionarios.length, ativos, por_empresa: empMap }

  if (foco) ctx.foco_pergunta = foco
  return JSON.stringify(ctx, null, 2)
}
