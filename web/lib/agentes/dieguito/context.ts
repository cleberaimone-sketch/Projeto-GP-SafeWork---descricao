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
    ctx.aviso = 'SOC ainda não configurado. Preencher SOC_CHAVE no painel SOC e no Vercel.'
    if (foco) ctx.foco_pergunta = foco
    return JSON.stringify(ctx, null, 2)
  }

  const [funcionarios, entregas, riscos] = await Promise.all([
    getFuncionarios(),
    getEntregasEpi(),
    getRiscos(),
  ])

  // Controle de EPIs — CA vencido ou entrega em atraso
  type EntregaEpi = {
    dataPrevistaEntrega?: string
    dataEntrega?: string
    nomeEpi?: string
    caCertificado?: string
    dataValidadeCa?: string
    nomeFuncionario?: string
    nomeEmpresa?: string
  }
  const dataHoje = hoje()
  const dataCorte = diasAtras(90)

  const episAtrasados = (entregas as EntregaEpi[]).filter(e =>
    e.dataPrevistaEntrega && !e.dataEntrega && e.dataPrevistaEntrega < dataHoje
  )
  const episCaVencido = (entregas as EntregaEpi[]).filter(e =>
    e.dataValidadeCa && e.dataValidadeCa < dataHoje
  )
  const entregasRecentes = (entregas as EntregaEpi[]).filter(e =>
    e.dataEntrega && e.dataEntrega >= dataCorte
  )

  ctx.epis = {
    entregas_atrasadas: { quantidade: episAtrasados.length, lista: episAtrasados.slice(0, 20) },
    ca_vencido: { quantidade: episCaVencido.length, lista: episCaVencido.slice(0, 20) },
    entregas_ultimos_90d: entregasRecentes.length,
    nota: 'CA vencido = EPI irregular = passivo trabalhista',
  }

  // Riscos por GHE
  type Risco = { nomeGhe?: string; nomeAgente?: string; nomeEmpresa?: string; tipoAgente?: string }
  const gheMap: Record<string, number> = {}
  const agentesMap: Record<string, number> = {}
  for (const r of riscos as Risco[]) {
    if (r.nomeGhe) gheMap[r.nomeGhe] = (gheMap[r.nomeGhe] ?? 0) + 1
    if (r.nomeAgente) agentesMap[r.nomeAgente] = (agentesMap[r.nomeAgente] ?? 0) + 1
  }

  ctx.ghe_riscos = {
    total_ghe: Object.keys(gheMap).length,
    total_riscos: riscos.length,
    top_ghe: Object.entries(gheMap).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([ghe, qtd]) => ({ ghe, riscos: qtd })),
    top_agentes: Object.entries(agentesMap).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([agente, qtd]) => ({ agente, quantidade: qtd })),
    nota: 'GHE = grupo de funcionários com mesma exposição. Base para LTCAT e PPP.',
  }

  // Headcount por empresa (base para dimensionar EPIs)
  const empMap: Record<string, number> = {}
  for (const f of funcionarios as Array<{ nomeEmpresa?: string }>) {
    const emp = f.nomeEmpresa ?? 'Sem empresa'
    empMap[emp] = (empMap[emp] ?? 0) + 1
  }
  ctx.headcount = { total: funcionarios.length, por_empresa: empMap }

  if (foco) ctx.foco_pergunta = foco
  return JSON.stringify(ctx, null, 2)
}
