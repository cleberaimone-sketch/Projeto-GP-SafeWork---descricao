import { createClient } from '@supabase/supabase-js'

function getDB() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function hoje() { return new Date().toISOString().split('T')[0] }
function diasAtras(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0]
}
function diasAFrente(n: number) {
  const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().split('T')[0]
}
function mesKey(dateStr: string) { return dateStr.slice(0, 7) }
function nomeMes(key: string) {
  const [ano, mes] = key.split('-')
  return new Date(Number(ano), Number(mes) - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
}
function fmt(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
}

export async function buildPlataContext(foco?: string): Promise<string> {
  const db = getDB()
  const hojeISO = hoje()
  const ctx: Record<string, unknown> = { data_referencia: hojeISO }

  // ── Lançamentos PAGINADOS — a janela 120d+90d passa de 1000 linhas e o
  // PostgREST corta silenciosamente; sem paginar, a Plata analisa dado truncado.
  type Lanc = { id: string; empresa_id: string | null; tipo: string; categoria: string | null; valor: number | null; data_vencimento: string; data_pagamento: string | null; status: string; descricao: string | null }
  async function carregarLancamentos(): Promise<Lanc[]> {
    const out: Lanc[] = []
    const LOTE = 1000
    for (let off = 0; ; off += LOTE) {
      const { data } = await db.from('lancamentos_financeiros')
        .select('id, empresa_id, tipo, categoria, valor, data_vencimento, data_pagamento, status, descricao')
        .neq('status', 'cancelado')
        .gte('data_vencimento', diasAtras(120))
        .lte('data_vencimento', diasAFrente(90))
        .order('id')
        .range(off, off + LOTE - 1)
      if (!data || data.length === 0) break
      out.push(...(data as Lanc[]))
      if (data.length < LOTE) break
    }
    return out
  }

  // ── Queries paralelas ────────────────────────────────────────────────────
  const [
    { data: saldosRaw },
    lancamentos,
    { data: empresas },
    { data: syncLog },
    { data: snapshotsDiarios },
  ] = await Promise.all([
    // v_saldos_ativos: só contas ativas, sem Conta Modelo, sem datas futuras —
    // a MESMA fonte de saldo do dashboard (saldos_bancarios cru tem lixo).
    db.from('v_saldos_ativos').select('nome_exibicao, saldo'),
    carregarLancamentos(),
    db.from('empresas').select('id, nome_curto').order('nome_curto'),
    db.from('sync_log').select('finalizado_em, status').eq('fonte', 'conta_azul').order('finalizado_em', { ascending: false }).limit(1),
    db.from('snapshots_financeiros_diarios')
      .select('data, receita_30d, despesa_30d, margem_30d, saldo_bancario, atrasados_pagar, atrasados_receber, analise')
      .is('empresa_id', null)
      .order('data', { ascending: false })
      .limit(8),
  ])

  // ── Mapa empresas ─────────────────────────────────────────────────────────
  const empMap: Record<string, string> = {}
  for (const e of empresas ?? []) empMap[e.id] = e.nome_curto

  // ── Saldos bancários (v_saldos_ativos: contas ativas, sem lixo) ──────────
  const saldos = (saldosRaw ?? []).map(s => ({ conta: String(s.nome_exibicao ?? '—'), saldo: Number(s.saldo ?? 0) }))
  const totalCaixa = saldos.reduce((s, b) => s + b.saldo, 0)
  ctx.caixa = {
    total: fmt(totalCaixa),
    total_num: totalCaixa,
    contas: saldos.map(s => ({ conta: s.conta, saldo: fmt(s.saldo) })),
    nota: 'Saldo real das contas ATIVAS (v_saldos_ativos) — não inclui A/R. Itaú/Cora só entram via Pluggy.',
  }

  // ── Lançamentos particionados ─────────────────────────────────────────────
  const all = lancamentos ?? []
  const receitas  = all.filter(l => l.tipo === 'receita')
  const despesas  = all.filter(l => l.tipo === 'despesa')

  // Por status
  const recVencidas  = receitas.filter(l => l.status === 'vencido')
  const recPendentes = receitas.filter(l => l.status === 'pendente')
  const recPagas     = receitas.filter(l => l.status === 'pago' || l.status === 'parcial')
  const despVencidas = despesas.filter(l => l.status === 'vencido')
  const despPendentes = despesas.filter(l => l.status === 'pendente')
  const despPagas    = despesas.filter(l => l.status === 'pago' || l.status === 'parcial')

  const totalRecVencidas  = recVencidas.reduce((s, l) => s + (l.valor ?? 0), 0)
  const totalDespVencidas = despVencidas.reduce((s, l) => s + (l.valor ?? 0), 0)

  // ── Inadimplência (receitas vencidas) ────────────────────────────────────
  // Por faixa de atraso
  const inad7  = recVencidas.filter(l => {
    const dias = Math.floor((new Date(hojeISO).getTime() - new Date(l.data_vencimento + 'T00:00:00').getTime()) / 86400000)
    return dias <= 30
  })
  const inad31 = recVencidas.filter(l => {
    const dias = Math.floor((new Date(hojeISO).getTime() - new Date(l.data_vencimento + 'T00:00:00').getTime()) / 86400000)
    return dias > 30 && dias <= 90
  })
  const inad90 = recVencidas.filter(l => {
    const dias = Math.floor((new Date(hojeISO).getTime() - new Date(l.data_vencimento + 'T00:00:00').getTime()) / 86400000)
    return dias > 90
  })

  // Inadimplência por empresa
  const inadEmpMap: Record<string, { empresa: string; total: number; qtd: number; mais_antigo: string }> = {}
  for (const l of recVencidas) {
    const emp = l.empresa_id ? (empMap[l.empresa_id] ?? l.empresa_id) : 'Sem empresa'
    if (!inadEmpMap[emp]) inadEmpMap[emp] = { empresa: emp, total: 0, qtd: 0, mais_antigo: l.data_vencimento }
    inadEmpMap[emp].total += l.valor ?? 0
    inadEmpMap[emp].qtd++
    if (l.data_vencimento < inadEmpMap[emp].mais_antigo) inadEmpMap[emp].mais_antigo = l.data_vencimento
  }

  const totalReceitas90d = receitas.reduce((s, l) => s + (l.valor ?? 0), 0)
  const inadimplenciaPct = totalReceitas90d > 0 ? (totalRecVencidas / totalReceitas90d) * 100 : 0

  ctx.inadimplencia = {
    total: fmt(totalRecVencidas),
    total_num: totalRecVencidas,
    percentual_receita: `${inadimplenciaPct.toFixed(1)}%`,
    benchmark: '< 5% saudável · 5–10% atenção · > 10% crítico',
    por_faixa: {
      '1_a_30d':  { total: fmt(inad7.reduce((s, l) => s + (l.valor ?? 0), 0)), qtd: inad7.length },
      '31_a_90d': { total: fmt(inad31.reduce((s, l) => s + (l.valor ?? 0), 0)), qtd: inad31.length },
      'acima_90d': { total: fmt(inad90.reduce((s, l) => s + (l.valor ?? 0), 0)), qtd: inad90.length },
    },
    por_empresa: Object.values(inadEmpMap)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
      .map(e => ({ ...e, total: fmt(e.total) })),
    top_titulos: recVencidas
      .sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0))
      .slice(0, 10)
      .map(l => ({
        empresa: l.empresa_id ? (empMap[l.empresa_id] ?? '—') : '—',
        descricao: l.descricao,
        valor: fmt(l.valor ?? 0),
        vencimento: l.data_vencimento,
        dias_atraso: Math.floor((new Date(hojeISO).getTime() - new Date(l.data_vencimento + 'T00:00:00').getTime()) / 86400000),
      })),
  }

  // ── A receber (pendentes) ─────────────────────────────────────────────────
  const aRec7d  = recPendentes.filter(l => l.data_vencimento >= hojeISO && l.data_vencimento <= diasAFrente(7))
  const aRec30d = recPendentes.filter(l => l.data_vencimento >= hojeISO && l.data_vencimento <= diasAFrente(30))
  ctx.a_receber = {
    proximos_7d:  { total: fmt(aRec7d.reduce((s, l) => s + (l.valor ?? 0), 0)), qtd: aRec7d.length },
    proximos_30d: { total: fmt(aRec30d.reduce((s, l) => s + (l.valor ?? 0), 0)), qtd: aRec30d.length },
    lista_30d: aRec30d.sort((a, b) => (a.data_vencimento ?? '').localeCompare(b.data_vencimento ?? '')).slice(0, 15).map(l => ({
      empresa: l.empresa_id ? (empMap[l.empresa_id] ?? '—') : '—',
      descricao: l.descricao,
      valor: fmt(l.valor ?? 0),
      vencimento: l.data_vencimento,
    })),
  }

  // ── A pagar (pendentes + vencidas) ───────────────────────────────────────
  const aPag7d  = despPendentes.filter(l => l.data_vencimento >= hojeISO && l.data_vencimento <= diasAFrente(7))
  const aPag30d = despPendentes.filter(l => l.data_vencimento >= hojeISO && l.data_vencimento <= diasAFrente(30))
  ctx.a_pagar = {
    vencidas:     { total: fmt(totalDespVencidas), qtd: despVencidas.length },
    proximos_7d:  { total: fmt(aPag7d.reduce((s, l) => s + (l.valor ?? 0), 0)), qtd: aPag7d.length },
    proximos_30d: { total: fmt(aPag30d.reduce((s, l) => s + (l.valor ?? 0), 0)), qtd: aPag30d.length },
    lista_vencidas: despVencidas.slice(0, 10).map(l => ({
      descricao: l.descricao, categoria: l.categoria, valor: fmt(l.valor ?? 0), vencimento: l.data_vencimento,
    })),
    lista_7d: aPag7d.sort((a, b) => (a.data_vencimento ?? '').localeCompare(b.data_vencimento ?? '')).slice(0, 15).map(l => ({
      descricao: l.descricao, categoria: l.categoria, valor: fmt(l.valor ?? 0), vencimento: l.data_vencimento,
    })),
    prioridade: 'Encargos > Impostos > Fornecedores estratégicos > Demais',
  }

  // ── DRE comparativo por mês (últimos 3 meses + atual) ────────────────────
  const dreMap: Record<string, { rec: number; desp: number; recPago: number; despPago: number }> = {}
  for (const l of all) {
    const key = mesKey(l.data_vencimento ?? hojeISO)
    if (!dreMap[key]) dreMap[key] = { rec: 0, desp: 0, recPago: 0, despPago: 0 }
    const isPago = l.status === 'pago' || l.status === 'parcial'
    if (l.tipo === 'receita') {
      dreMap[key].rec += l.valor ?? 0
      if (isPago) dreMap[key].recPago += l.valor ?? 0
    } else {
      dreMap[key].desp += l.valor ?? 0
      if (isPago) dreMap[key].despPago += l.valor ?? 0
    }
  }

  const mesesOrdenados = Object.entries(dreMap).sort(([a], [b]) => a.localeCompare(b)).slice(-4)
  ctx.dre_comparativo = mesesOrdenados.map(([key, v]) => ({
    mes: nomeMes(key),
    receita_competencia: fmt(v.rec),
    despesa_competencia: fmt(v.desp),
    resultado_competencia: fmt(v.rec - v.desp),
    receita_caixa: fmt(v.recPago),
    despesa_caixa: fmt(v.despPago),
    resultado_caixa: fmt(v.recPago - v.despPago),
    margem_pct: v.rec > 0 ? `${(((v.rec - v.desp) / v.rec) * 100).toFixed(1)}%` : '—',
  }))

  // ── Runway ────────────────────────────────────────────────────────────────
  const last3 = mesesOrdenados.slice(-3)
  const avgBurn = last3.length > 0
    ? last3.reduce((s, [, v]) => s + v.despPago, 0) / last3.length
    : 0
  const runway = avgBurn > 0 ? (totalCaixa / avgBurn).toFixed(1) : null
  ctx.runway = {
    meses: runway ? `${runway} meses` : 'indisponível',
    caixa_atual: fmt(totalCaixa),
    burn_mensal_medio: fmt(avgBurn),
    alerta: runway && Number(runway) < 1 ? 'CRÍTICO: menos de 1 mês de caixa'
      : runway && Number(runway) < 2 ? 'ATENÇÃO: menos de 2 meses de caixa'
      : 'ok',
  }

  // ── DSO ────────────────────────────────────────────────────────────────────
  const pagas90d = recPagas.filter(l => l.data_pagamento && l.data_vencimento)
  const dsoArr = pagas90d.map(l => {
    const days = Math.floor((new Date(l.data_pagamento!).getTime() - new Date(l.data_vencimento! + 'T00:00:00').getTime()) / 86400000)
    return days
  }).filter(d => d >= 0 && d < 365)
  const dso = dsoArr.length > 3 ? Math.round(dsoArr.reduce((s, d) => s + d, 0) / dsoArr.length) : null
  ctx.dso = dso ? { dias: dso, benchmark: '< 15d ok · 15-30d atenção · >30d problema de cobrança' } : { dias: 'indisponível' }

  // ── Top categorias de despesa ─────────────────────────────────────────────
  const catDespMap: Record<string, number> = {}
  for (const l of despesas) catDespMap[l.categoria ?? 'Sem categoria'] = (catDespMap[l.categoria ?? 'Sem categoria'] ?? 0) + (l.valor ?? 0)
  ctx.top_despesas_por_categoria = Object.entries(catDespMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([cat, val]) => ({ categoria: cat, total: fmt(val) }))

  // ── Alertas priorizados ───────────────────────────────────────────────────
  const alertas: string[] = []
  if (despVencidas.length > 0) alertas.push(`🔴 ${despVencidas.length} despesa(s) vencida(s) — ${fmt(totalDespVencidas)} em atraso`)
  if (totalRecVencidas > 0 && inadimplenciaPct > 10) alertas.push(`🔴 Inadimplência crítica: ${inadimplenciaPct.toFixed(1)}% da receita (${fmt(totalRecVencidas)})`)
  else if (totalRecVencidas > 0) alertas.push(`⚠️ Inadimplência: ${fmt(totalRecVencidas)} vencida (${inadimplenciaPct.toFixed(1)}%)`)
  if (runway && Number(runway) < 2) alertas.push(`🔴 Runway baixo: apenas ${runway} meses de caixa`)
  if (aPag7d.length > 0) alertas.push(`⚠️ ${aPag7d.length} pagamento(s) nos próximos 7 dias — ${fmt(aPag7d.reduce((s, l) => s + (l.valor ?? 0), 0))}`)
  ctx.alertas_prioritarios = alertas.length > 0 ? alertas : ['✅ Nenhum alerta crítico identificado']

  // ── Evolução diária (snapshots — a linha da saúde financeira) ─────────────
  if (snapshotsDiarios && snapshotsDiarios.length > 0) {
    ctx.evolucao_diaria = {
      nota: 'Snapshots diários em janela móvel de 30d — comparáveis dia a dia. Mais recente primeiro.',
      serie: snapshotsDiarios.map(s => ({
        data: s.data,
        receita_30d: fmt(Number(s.receita_30d ?? 0)),
        despesa_30d: fmt(Number(s.despesa_30d ?? 0)),
        margem_30d: `${Number(s.margem_30d ?? 0).toFixed(1)}%`,
        saldo: fmt(Number(s.saldo_bancario ?? 0)),
        atrasados_pagar: fmt(Number(s.atrasados_pagar ?? 0)),
        atrasados_receber: fmt(Number(s.atrasados_receber ?? 0)),
      })),
      analise_de_hoje: snapshotsDiarios[0]?.analise ?? null,
    }
  }

  // ── Metadata ──────────────────────────────────────────────────────────────
  ctx.ultimo_sync = syncLog?.[0]?.finalizado_em ?? null
  ctx.nota_estrutura = 'GP SafeWork é holding. Receitas = repasses/serviços das subsidiárias. Despesas = custos de matriz.'
  if (foco) ctx.foco_pergunta = foco

  return JSON.stringify(ctx, null, 2)
}
