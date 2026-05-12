import {
  getFuncionarios,
  getAgendamentos,
  getHistoricoFuncionarios,
  getLicencasMedicas,
  socConfigurado,
} from '@/lib/soc/client'

function hoje() { return new Date().toISOString().split('T')[0] }
function diasAFrente(n: number) {
  return new Date(Date.now() + n * 86400000).toISOString().split('T')[0]
}

export async function buildLariContext(foco?: string): Promise<string> {
  const ctx: Record<string, unknown> = {
    data_referencia: hoje(),
    soc_configurado: socConfigurado(),
  }

  if (!socConfigurado()) {
    ctx.aviso = 'SOC ainda não configurado. Preencher SOC_CHAVE no painel SOC e no Vercel.'
    if (foco) ctx.foco_pergunta = foco
    return JSON.stringify(ctx, null, 2)
  }

  const [funcionarios, agendamentos, historico, licencas] = await Promise.all([
    getFuncionarios(),
    getAgendamentos(),
    getHistoricoFuncionarios(),
    getLicencasMedicas(),
  ])

  // ASOs vencidos e a vencer
  const asoVencidos: unknown[] = []
  const asoA30d: unknown[] = []
  const asoA60d: unknown[] = []
  const dataHoje = hoje()
  const data30 = diasAFrente(30)
  const data60 = diasAFrente(60)

  for (const h of historico as Array<{ dataVencimentoAso?: string; nomeFuncionario?: string; empresa?: string }>) {
    if (!h.dataVencimentoAso) continue
    const venc = h.dataVencimentoAso
    if (venc < dataHoje) asoVencidos.push(h)
    else if (venc <= data30) asoA30d.push(h)
    else if (venc <= data60) asoA60d.push(h)
  }

  ctx.aso = {
    vencidos: { quantidade: asoVencidos.length, funcionarios: asoVencidos.slice(0, 20) },
    a_vencer_30d: { quantidade: asoA30d.length, funcionarios: asoA30d.slice(0, 20) },
    a_vencer_60d: { quantidade: asoA60d.length, funcionarios: asoA60d.slice(0, 20) },
    nota: 'ASO vencido = risco legal eSocial S-2220',
  }

  // Agendamentos próximos 30 dias
  ctx.agendamentos = {
    total: agendamentos.length,
    lista: (agendamentos as Array<{ dataAgendamento?: string }>)
      .filter(a => a.dataAgendamento && a.dataAgendamento <= data30)
      .slice(0, 30),
  }

  // Absenteísmo (últimos 90 dias)
  const cidMap: Record<string, number> = {}
  for (const l of licencas as Array<{ cid?: string }>) {
    if (l.cid) cidMap[l.cid] = (cidMap[l.cid] ?? 0) + 1
  }
  const topCids = Object.entries(cidMap).sort((a, b) => b[1] - a[1]).slice(0, 10)

  ctx.absenteismo_90d = {
    total_licencas: licencas.length,
    top_cids: topCids.map(([cid, qtd]) => ({ cid, quantidade: qtd })),
    lista: (licencas as unknown[]).slice(0, 20),
  }

  // Headcount por empresa
  const empMap: Record<string, number> = {}
  for (const f of funcionarios as Array<{ nomeEmpresa?: string }>) {
    const emp = f.nomeEmpresa ?? 'Sem empresa'
    empMap[emp] = (empMap[emp] ?? 0) + 1
  }
  ctx.headcount = {
    total: funcionarios.length,
    por_empresa: empMap,
  }

  if (foco) ctx.foco_pergunta = foco
  return JSON.stringify(ctx, null, 2)
}
