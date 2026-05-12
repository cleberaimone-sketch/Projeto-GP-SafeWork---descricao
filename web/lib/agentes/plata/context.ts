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

export async function buildPlataContext(foco?: string): Promise<string> {
  const db = getDB()
  const ctx: Record<string, unknown> = {}

  // Saldos bancários (mais recente por conta)
  const { data: saldosRaw } = await db
    .from('saldos_bancarios')
    .select('banco, conta, saldo, data_referencia')
    .order('data_referencia', { ascending: false })

  const saldoMap: Record<string, { banco: string; conta: string | null; saldo: number; data: string }> = {}
  for (const s of saldosRaw ?? []) {
    if (!saldoMap[s.banco]) saldoMap[s.banco] = { banco: s.banco, conta: s.conta, saldo: s.saldo ?? 0, data: s.data_referencia }
  }
  const saldos = Object.values(saldoMap)
  ctx.saldos_bancarios = {
    contas: saldos,
    total: saldos.reduce((a, s) => a + s.saldo, 0),
    nota: 'Saldo real em conta — não inclui contas a receber',
  }

  // Inadimplência — receitas vencidas
  const { data: inadimplentes } = await db
    .from('lancamentos_financeiros')
    .select('descricao, valor, data_vencimento, empresa_id')
    .eq('tipo', 'receita')
    .eq('status', 'vencido')
    .order('data_vencimento', { ascending: true })
    .limit(50)

  ctx.inadimplencia = {
    titulos: inadimplentes ?? [],
    total_reais: (inadimplentes ?? []).reduce((a, l) => a + Number(l.valor), 0),
    quantidade: (inadimplentes ?? []).length,
    nota: 'Receitas com status vencido — precisam de cobrança',
  }

  // A receber nos próximos 30 dias
  const { data: aReceber } = await db
    .from('lancamentos_financeiros')
    .select('descricao, valor, data_vencimento')
    .eq('tipo', 'receita')
    .eq('status', 'pendente')
    .gte('data_vencimento', hoje())
    .lte('data_vencimento', diasAFrente(30))
    .order('data_vencimento')

  ctx.a_receber_30d = {
    lancamentos: aReceber ?? [],
    total_reais: (aReceber ?? []).reduce((a, l) => a + Number(l.valor), 0),
    quantidade: (aReceber ?? []).length,
  }

  // A pagar nos próximos 30 dias
  const { data: aPagar } = await db
    .from('lancamentos_financeiros')
    .select('descricao, valor, data_vencimento, categoria')
    .eq('tipo', 'despesa')
    .eq('status', 'pendente')
    .gte('data_vencimento', hoje())
    .lte('data_vencimento', diasAFrente(30))
    .order('data_vencimento')

  ctx.a_pagar_30d = {
    lancamentos: aPagar ?? [],
    total_reais: (aPagar ?? []).reduce((a, l) => a + Number(l.valor), 0),
    quantidade: (aPagar ?? []).length,
  }

  // Despesas vencidas (em atraso)
  const { data: despVencidas } = await db
    .from('lancamentos_financeiros')
    .select('descricao, valor, data_vencimento, categoria')
    .eq('tipo', 'despesa')
    .eq('status', 'vencido')
    .order('data_vencimento', { ascending: true })
    .limit(30)

  ctx.despesas_vencidas = {
    lancamentos: despVencidas ?? [],
    total_reais: (despVencidas ?? []).reduce((a, l) => a + Number(l.valor), 0),
    quantidade: (despVencidas ?? []).length,
  }

  // DRE — últimos 3 meses
  const { data: dre } = await db
    .from('lancamentos_financeiros')
    .select('tipo, status, valor, data_vencimento, categoria')
    .gte('data_vencimento', diasAtras(90))
    .lte('data_vencimento', hoje())

  const receitasPagas = (dre ?? []).filter(l => l.tipo === 'receita' && l.status === 'pago').reduce((a, l) => a + Number(l.valor), 0)
  const despesasPagas = (dre ?? []).filter(l => l.tipo === 'despesa' && l.status === 'pago').reduce((a, l) => a + Number(l.valor), 0)
  const receitasPrevistas = (dre ?? []).filter(l => l.tipo === 'receita').reduce((a, l) => a + Number(l.valor), 0)
  const despesasPrevistas = (dre ?? []).filter(l => l.tipo === 'despesa').reduce((a, l) => a + Number(l.valor), 0)

  ctx.dre_90d = {
    periodo: `${diasAtras(90)} → ${hoje()}`,
    receitas_realizadas: receitasPagas,
    despesas_realizadas: despesasPagas,
    resultado_realizado: receitasPagas - despesasPagas,
    receitas_previstas: receitasPrevistas,
    despesas_previstas: despesasPrevistas,
    resultado_previsto: receitasPrevistas - despesasPrevistas,
    nota: 'GP SafeWork = holding. Despesas são custos de matriz (compartilhados). Receitas são repasses das subsidiárias.',
  }

  // Top categorias de despesa (últimos 90 dias)
  const catMap: Record<string, number> = {}
  for (const l of (dre ?? []).filter(l => l.tipo === 'despesa')) {
    const cat = l.categoria ?? 'Sem categoria'
    catMap[cat] = (catMap[cat] ?? 0) + Number(l.valor)
  }
  ctx.top_categorias_despesa = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([cat, valor]) => ({ categoria: cat, valor }))

  // Último sync
  const { data: sync } = await db
    .from('sync_log')
    .select('finalizado_em, status, registros_processados')
    .eq('fonte', 'conta_azul')
    .order('finalizado_em', { ascending: false })
    .limit(1)

  ctx.ultimo_sync = sync?.[0] ?? null
  ctx.data_referencia = hoje()
  ctx.nota_estrutura = 'GP SafeWork é a holding — não fatura diretamente. Receitas = repasses das subsidiárias. Despesas = custos de matriz.'

  if (foco) ctx.foco_pergunta = foco

  return JSON.stringify(ctx, null, 2)
}
