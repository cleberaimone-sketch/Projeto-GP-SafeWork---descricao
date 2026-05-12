import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

function fmt(val: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')
}

export default async function FinanceiroDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Service role para garantir leitura dos dados (contorna RLS nas tabelas de sync)
  const sb = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Queries em paralelo
  const [
    { data: lancamentos },
    { data: saldos },
    { data: syncLog },
  ] = await Promise.all([
    sb.from('lancamentos_financeiros').select('*').order('data_vencimento', { ascending: false }),
    sb.from('saldos_bancarios').select('*').order('banco'),
    sb.from('sync_log').select('*').eq('fonte', 'conta_azul').order('finalizado_em', { ascending: false }).limit(1),
  ])

  const receitas = lancamentos?.filter(l => l.tipo === 'receita') ?? []
  const despesas = lancamentos?.filter(l => l.tipo === 'despesa') ?? []

  const totalReceitas = receitas.reduce((s, l) => s + (l.valor ?? 0), 0)
  const totalDespesas = despesas.reduce((s, l) => s + (l.valor ?? 0), 0)
  const resultado = totalReceitas - totalDespesas
  const totalSaldos = (saldos ?? []).reduce((s, b) => s + (b.saldo ?? 0), 0)

  // Status breakdown (receitas + despesas)
  const statusCount: Record<string, number> = {}
  const statusValor: Record<string, number> = {}
  for (const l of lancamentos ?? []) {
    statusCount[l.status] = (statusCount[l.status] ?? 0) + 1
    statusValor[l.status] = (statusValor[l.status] ?? 0) + (l.valor ?? 0)
  }

  // Top categorias de despesa
  const catMap: Record<string, number> = {}
  for (const l of despesas) {
    const cat = l.categoria ?? 'Sem categoria'
    catMap[cat] = (catMap[cat] ?? 0) + (l.valor ?? 0)
  }
  const topCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 8)
  const maxCat = topCats[0]?.[1] ?? 1

  // Lançamentos recentes (últimos 15)
  const recentes = (lancamentos ?? []).slice(0, 15)

  const statusColors: Record<string, string> = {
    pago: 'text-green-400',
    pendente: 'text-yellow-400',
    vencido: 'text-red-400',
    cancelado: 'text-gray-500',
    parcial: 'text-orange-400',
  }
  const statusBg: Record<string, string> = {
    pago: 'bg-green-900/40',
    pendente: 'bg-yellow-900/40',
    vencido: 'bg-red-900/40',
    cancelado: 'bg-gray-800/40',
    parcial: 'bg-orange-900/40',
  }

  const ultimoSync = syncLog?.[0]?.finalizado_em
    ? new Date(syncLog[0].finalizado_em).toLocaleString('pt-BR')
    : 'Nunca'

  return (
    <main className="min-h-screen bg-gray-950 text-white p-6 md:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <a href="/dashboard" className="text-gray-500 text-sm hover:text-gray-300">← Centro de Comando</a>
          <h1 className="text-2xl font-bold mt-1">Financeiro — Holding GP SafeWork</h1>
          <p className="text-gray-400 text-sm">Dados via Conta Azul Mais · Último sync: {ultimoSync}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">{(lancamentos?.length ?? 0)} lançamentos</p>
          <p className="text-xs text-gray-500">2020 → 2026</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
          <p className="text-xs text-gray-400 mb-1">Total Receitas</p>
          <p className="text-xl font-bold text-green-400">{fmt(totalReceitas)}</p>
          <p className="text-xs text-gray-500 mt-1">{receitas.length} lançamentos</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
          <p className="text-xs text-gray-400 mb-1">Total Despesas</p>
          <p className="text-xl font-bold text-red-400">{fmt(totalDespesas)}</p>
          <p className="text-xs text-gray-500 mt-1">{despesas.length} lançamentos</p>
        </div>
        <div className={`bg-gray-900 rounded-xl p-5 border ${resultado >= 0 ? 'border-green-800' : 'border-red-800'}`}>
          <p className="text-xs text-gray-400 mb-1">Resultado Líquido</p>
          <p className={`text-xl font-bold ${resultado >= 0 ? 'text-green-300' : 'text-red-300'}`}>{fmt(resultado)}</p>
          <p className="text-xs text-gray-500 mt-1">Receitas − Despesas</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-5 border border-blue-900">
          <p className="text-xs text-gray-400 mb-1">Saldo Bancário</p>
          <p className="text-xl font-bold text-blue-300">{fmt(totalSaldos)}</p>
          <p className="text-xs text-gray-500 mt-1">{saldos?.length ?? 0} contas</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Status Distribution */}
        <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Status dos Lançamentos</h2>
          <div className="space-y-3">
            {Object.entries(statusCount).sort((a, b) => b[1] - a[1]).map(([status, count]) => (
              <div key={status}>
                <div className="flex justify-between text-xs mb-1">
                  <span className={statusColors[status] ?? 'text-gray-400'}>{status}</span>
                  <span className="text-gray-400">{count} · {fmt(statusValor[status] ?? 0)}</span>
                </div>
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${statusBg[status] ?? 'bg-gray-700'}`}
                    style={{ width: `${Math.round((count / (lancamentos?.length ?? 1)) * 100)}%`, background: undefined }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Saldos Bancários */}
        <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Saldos Bancários</h2>
          <div className="space-y-2">
            {(saldos ?? []).map((s, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-800 last:border-0">
                <div>
                  <p className="text-xs font-medium">{s.banco}</p>
                  {s.conta && <p className="text-xs text-gray-500">{s.conta}</p>}
                </div>
                <span className={`text-sm font-semibold ${(s.saldo ?? 0) >= 0 ? 'text-blue-300' : 'text-red-400'}`}>
                  {s.saldo != null ? fmt(s.saldo) : '—'}
                </span>
              </div>
            ))}
            {(!saldos || saldos.length === 0) && (
              <p className="text-xs text-gray-500">Nenhum saldo disponível</p>
            )}
          </div>
        </div>

        {/* Top Categorias Despesa */}
        <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Top Categorias de Despesa</h2>
          <div className="space-y-2">
            {topCats.map(([cat, valor]) => (
              <div key={cat}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-300 truncate max-w-[60%]">{cat}</span>
                  <span className="text-gray-400">{fmt(valor)}</span>
                </div>
                <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-800 rounded-full"
                    style={{ width: `${Math.round((valor / maxCat) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
            {topCats.length === 0 && <p className="text-xs text-gray-500">Sem categorias</p>}
          </div>
        </div>
      </div>

      {/* Lançamentos Recentes */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-300">Lançamentos Recentes</h2>
          <span className="text-xs text-gray-500">últimos 15 por vencimento</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-800">
                <th className="text-left px-5 py-2">Tipo</th>
                <th className="text-left px-4 py-2">Descrição</th>
                <th className="text-left px-4 py-2">Categoria</th>
                <th className="text-left px-4 py-2">Vencimento</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-right px-5 py-2">Valor</th>
              </tr>
            </thead>
            <tbody>
              {recentes.map((l, i) => (
                <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                  <td className="px-5 py-2.5">
                    <span className={`px-1.5 py-0.5 rounded text-xs ${l.tipo === 'receita' ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
                      {l.tipo === 'receita' ? 'R' : 'D'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-200 max-w-[200px] truncate">{l.descricao ?? '—'}</td>
                  <td className="px-4 py-2.5 text-gray-400">{l.categoria ?? '—'}</td>
                  <td className="px-4 py-2.5 text-gray-400">{fmtDate(l.data_vencimento)}</td>
                  <td className="px-4 py-2.5">
                    <span className={statusColors[l.status] ?? 'text-gray-400'}>{l.status}</span>
                  </td>
                  <td className={`px-5 py-2.5 text-right font-mono ${l.tipo === 'receita' ? 'text-green-400' : 'text-red-400'}`}>
                    {fmt(l.valor ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}
