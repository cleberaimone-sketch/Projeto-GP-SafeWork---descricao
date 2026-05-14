import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import PlataChat from './PlataChat'
import SyncButton from './SyncButton'
import FinanceiroCharts, { type MesData, type EmpresaData, type CatData } from './FinanceiroCharts'
import FiltrosFinanceiro from './FiltrosFinanceiro'

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const fmtDate = (d: string | null) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—'

const fmtPct = (v: number) =>
  (v >= 0 ? '+' : '') + v.toFixed(1) + '%'

interface SearchParams { empresa?: string; de?: string; ate?: string; tipo?: string; status?: string }

export default async function FinanceiroDashboard({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const filters = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const sb = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Dados base (sem filtro) para meses disponíveis e lista de empresas
  const [
    { data: saldos },
    { data: syncLog },
    { data: convData },
    { data: empresas },
    { data: mesesRaw },
  ] = await Promise.all([
    sb.from('saldos_bancarios').select('*').order('banco'),
    sb.from('sync_log').select('*').eq('fonte', 'conta_azul').order('finalizado_em', { ascending: false }).limit(1),
    sb.from('conversas_ia').select('mensagens').eq('agente', 'plata').eq('canal', 'dashboard').eq('contato_id', user.id).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    sb.from('empresas').select('id, nome_curto').order('nome_curto'),
    sb.from('lancamentos_financeiros').select('data_vencimento').order('data_vencimento', { ascending: true }),
  ])

  // Meses disponíveis no banco
  const mesesSet = new Set<string>()
  for (const l of mesesRaw ?? []) {
    if (l.data_vencimento) mesesSet.add(l.data_vencimento.slice(0, 7))
  }
  const mesesDisponiveis = [...mesesSet].sort()

  // Query filtrada de lançamentos
  let query = sb.from('lancamentos_financeiros').select('*')
  if (filters.empresa) query = query.eq('empresa_id', filters.empresa)
  if (filters.de) query = query.gte('data_vencimento', filters.de + '-01')
  if (filters.ate) query = query.lte('data_vencimento', filters.ate + '-31')
  if (filters.tipo) query = query.eq('tipo', filters.tipo)
  if (filters.status) query = query.eq('status', filters.status)
  query = query.order('data_vencimento', { ascending: false })

  const { data: lancamentos } = await query

  const initialMessages = ((convData?.mensagens ?? []) as { role: 'user' | 'assistant'; content: string }[]).slice(-30)
  const all = lancamentos ?? []
  const empresaMap: Record<string, string> = {}
  for (const e of empresas ?? []) empresaMap[e.id] = e.nome_curto

  // ── KPIs globais ──────────────────────────────────────────────────────────────
  const receitasList = all.filter(l => l.tipo === 'receita')
  const despesasList = all.filter(l => l.tipo === 'despesa')
  const totalReceitas = receitasList.reduce((s, l) => s + (l.valor ?? 0), 0)
  const totalDespesas = despesasList.reduce((s, l) => s + (l.valor ?? 0), 0)
  const resultado = totalReceitas - totalDespesas
  const totalSaldos = (saldos ?? []).reduce((s, b) => s + (b.saldo ?? 0), 0)
  const inadimplencia = receitasList.filter(l => l.status === 'vencido').reduce((s, l) => s + (l.valor ?? 0), 0)
  const pendente = despesasList.filter(l => l.status === 'pendente').reduce((s, l) => s + (l.valor ?? 0), 0)

  // ── Mês atual vs anterior ─────────────────────────────────────────────────────
  const hoje = new Date()
  const anoMesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
  const antMes = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
  const anoMesAnt = `${antMes.getFullYear()}-${String(antMes.getMonth() + 1).padStart(2, '0')}`
  const recMesAtual  = receitasList.filter(l => l.data_vencimento?.startsWith(anoMesAtual)).reduce((s, l) => s + (l.valor ?? 0), 0)
  const recMesAnt    = receitasList.filter(l => l.data_vencimento?.startsWith(anoMesAnt)).reduce((s, l) => s + (l.valor ?? 0), 0)
  const despMesAtual = despesasList.filter(l => l.data_vencimento?.startsWith(anoMesAtual)).reduce((s, l) => s + (l.valor ?? 0), 0)
  const despMesAnt   = despesasList.filter(l => l.data_vencimento?.startsWith(anoMesAnt)).reduce((s, l) => s + (l.valor ?? 0), 0)
  const pctRec  = recMesAnt  > 0 ? ((recMesAtual  - recMesAnt)  / recMesAnt)  * 100 : 0
  const pctDesp = despMesAnt > 0 ? ((despMesAtual - despMesAnt) / despMesAnt) * 100 : 0

  // ── Dados por mês ─────────────────────────────────────────────────────────────
  const mesMap: Record<string, { receita: number; despesa: number }> = {}
  for (const l of all) {
    const key = l.data_vencimento?.slice(0, 7)
    if (!key) continue
    if (!mesMap[key]) mesMap[key] = { receita: 0, despesa: 0 }
    if (l.tipo === 'receita') mesMap[key].receita += l.valor ?? 0
    else mesMap[key].despesa += l.valor ?? 0
  }
  const porMes: MesData[] = Object.entries(mesMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => {
      const [ano, mes] = key.split('-')
      const nomeMes = new Date(Number(ano), Number(mes) - 1, 1)
        .toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
      return { mes: nomeMes, receita: v.receita, despesa: v.despesa, resultado: v.receita - v.despesa }
    })

  // ── Dados por empresa ─────────────────────────────────────────────────────────
  const empMap: Record<string, { receita: number; despesa: number }> = {}
  for (const l of all) {
    const key = l.empresa_id ? (empresaMap[l.empresa_id] ?? l.empresa_id) : 'Sem empresa'
    if (!empMap[key]) empMap[key] = { receita: 0, despesa: 0 }
    if (l.tipo === 'receita') empMap[key].receita += l.valor ?? 0
    else empMap[key].despesa += l.valor ?? 0
  }
  const porEmpresa: EmpresaData[] = Object.entries(empMap)
    .map(([empresa, v]) => ({ empresa, receita: v.receita, despesa: v.despesa, resultado: v.receita - v.despesa }))
    .sort((a, b) => b.receita - a.receita)

  // ── Top categorias ────────────────────────────────────────────────────────────
  const catMap: Record<string, number> = {}
  for (const l of despesasList) {
    const cat = l.categoria ?? 'Sem categoria'
    catMap[cat] = (catMap[cat] ?? 0) + (l.valor ?? 0)
  }
  const topCats: CatData[] = Object.entries(catMap)
    .sort(([, a], [, b]) => b - a).slice(0, 10)
    .map(([categoria, valor]) => ({ categoria, valor }))

  // ── Status breakdown ──────────────────────────────────────────────────────────
  const statusColors: Record<string, string> = {
    pago: 'text-green-400', pendente: 'text-yellow-400',
    vencido: 'text-red-400', cancelado: 'text-gray-500', parcial: 'text-orange-400',
  }
  const statusCount: Record<string, number> = {}
  const statusValor: Record<string, number> = {}
  for (const l of all) {
    statusCount[l.status] = (statusCount[l.status] ?? 0) + 1
    statusValor[l.status] = (statusValor[l.status] ?? 0) + (l.valor ?? 0)
  }

  const ultimoSync = syncLog?.[0]?.finalizado_em
    ? new Date(syncLog[0].finalizado_em).toLocaleString('pt-BR')
    : 'Nunca'

  const filtroAtivo = !!(filters.empresa || filters.de || filters.ate || filters.tipo || filters.status)
  const recentes = all.slice(0, 30)

  return (
    <main className="min-h-screen bg-gray-950 text-white p-6 md:p-8">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <a href="/dashboard" className="text-gray-500 text-sm hover:text-gray-300">← Centro de Comando</a>
          <h1 className="text-2xl font-bold mt-1">Financeiro — Holding GP SafeWork</h1>
          <p className="text-gray-400 text-sm">
            Conta Azul Mais · {all.length.toLocaleString('pt-BR')} lançamentos{filtroAtivo ? ' (filtrado)' : ''} · Sync: {ultimoSync}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-xs text-amber-400">Live</span>
        </div>
      </div>

      {/* Filtros */}
      <Suspense>
        <FiltrosFinanceiro
          empresas={empresas ?? []}
          mesesDisponiveis={mesesDisponiveis}
        />
      </Suspense>

      {/* KPI Cards — linha 1 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
          <p className="text-xs text-gray-400 mb-1">Receitas</p>
          <p className="text-xl font-bold text-green-400">{fmt(totalReceitas)}</p>
          <p className="text-xs text-gray-500 mt-1">{receitasList.length.toLocaleString('pt-BR')} lançamentos</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
          <p className="text-xs text-gray-400 mb-1">Despesas</p>
          <p className="text-xl font-bold text-red-400">{fmt(totalDespesas)}</p>
          <p className="text-xs text-gray-500 mt-1">{despesasList.length.toLocaleString('pt-BR')} lançamentos</p>
        </div>
        <div className={`bg-gray-900 rounded-xl p-5 border ${resultado >= 0 ? 'border-green-800/50' : 'border-red-800/50'}`}>
          <p className="text-xs text-gray-400 mb-1">Resultado Líquido</p>
          <p className={`text-xl font-bold ${resultado >= 0 ? 'text-green-300' : 'text-red-300'}`}>{fmt(resultado)}</p>
          <p className="text-xs text-gray-500 mt-1">Receitas − Despesas</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-5 border border-blue-900/50">
          <p className="text-xs text-gray-400 mb-1">Saldo em Caixa</p>
          <p className="text-xl font-bold text-blue-300">{fmt(totalSaldos)}</p>
          <p className="text-xs text-gray-500 mt-1">{saldos?.length ?? 0} contas bancárias</p>
        </div>
      </div>

      {/* KPI Cards — linha 2 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
          <p className="text-xs text-gray-400 mb-1">Receitas (mês atual)</p>
          <p className="text-lg font-bold text-green-400">{fmt(recMesAtual)}</p>
          <p className={`text-xs mt-1 ${pctRec >= 0 ? 'text-green-500' : 'text-red-500'}`}>{fmtPct(pctRec)} vs mês anterior</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
          <p className="text-xs text-gray-400 mb-1">Despesas (mês atual)</p>
          <p className="text-lg font-bold text-red-400">{fmt(despMesAtual)}</p>
          <p className={`text-xs mt-1 ${pctDesp <= 0 ? 'text-green-500' : 'text-red-500'}`}>{fmtPct(pctDesp)} vs mês anterior</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-5 border border-red-900/50">
          <p className="text-xs text-gray-400 mb-1">Inadimplência</p>
          <p className="text-lg font-bold text-red-400">{fmt(inadimplencia)}</p>
          <p className="text-xs text-gray-500 mt-1">Receitas vencidas</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-5 border border-yellow-900/50">
          <p className="text-xs text-gray-400 mb-1">A Pagar (pendente)</p>
          <p className="text-lg font-bold text-yellow-400">{fmt(pendente)}</p>
          <p className="text-xs text-gray-500 mt-1">Despesas pendentes</p>
        </div>
      </div>

      {/* Gráficos */}
      <div className="mb-8">
        <FinanceiroCharts porMes={porMes} porEmpresa={porEmpresa} topCats={topCats} />
      </div>

      {/* Chat Plata + Status + Sync */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="md:col-span-2">
          <h2 className="text-sm font-semibold text-gray-400 mb-3">Chat com Plata</h2>
          <PlataChat initialMessages={initialMessages} />
        </div>
        <div className="space-y-4">
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Status dos Lançamentos</h3>
            <div className="space-y-2">
              {Object.entries(statusCount).sort((a, b) => b[1] - a[1]).map(([status, count]) => (
                <div key={status}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className={statusColors[status] ?? 'text-gray-400'}>{status}</span>
                    <span className="text-gray-400">{count.toLocaleString('pt-BR')} · {fmt(statusValor[status] ?? 0)}</span>
                  </div>
                  <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-gray-600" style={{ width: `${Math.round((count / all.length) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Saldos Bancários</h3>
            <div className="space-y-2">
              {(saldos ?? []).map((s, i) => (
                <div key={i} className="flex items-center justify-between py-1 border-b border-gray-800 last:border-0">
                  <div>
                    <p className="text-xs font-medium">{s.banco}</p>
                    {s.conta && <p className="text-xs text-gray-500">{s.conta}</p>}
                  </div>
                  <span className={`text-xs font-semibold ${(s.saldo ?? 0) >= 0 ? 'text-blue-300' : 'text-red-400'}`}>
                    {s.saldo != null ? fmt(s.saldo) : '—'}
                  </span>
                </div>
              ))}
              {(!saldos || saldos.length === 0) && <p className="text-xs text-gray-500">Nenhum saldo</p>}
            </div>
          </div>
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Sincronização</h3>
            <p className="text-xs text-gray-500 mb-3">8 empresas · Atualiza lançamentos e saldos</p>
            <SyncButton />
          </div>
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Pergunte ao Plata</h3>
            <div className="space-y-1 text-xs text-gray-400">
              <p>• "Resultado consolidado de 2026?"</p>
              <p>• "Quais contas estão vencidas?"</p>
              <p>• "Qual empresa tem maior despesa?"</p>
              <p>• "Compare receitas de Londrina vs Foz"</p>
            </div>
          </div>
        </div>
      </div>

      {/* Lançamentos */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-300">Lançamentos</h2>
          <span className="text-xs text-gray-500">
            {filtroAtivo ? `${all.length.toLocaleString('pt-BR')} filtrados` : 'últimos 30 por vencimento'}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-800">
                <th className="text-left px-5 py-2">Tipo</th>
                <th className="text-left px-4 py-2">Empresa</th>
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
                    <span className={`px-1.5 py-0.5 rounded ${l.tipo === 'receita' ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
                      {l.tipo === 'receita' ? 'R' : 'D'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-400">{l.empresa_id ? (empresaMap[l.empresa_id] ?? '—') : '—'}</td>
                  <td className="px-4 py-2.5 text-gray-200 max-w-[180px] truncate">{l.descricao ?? '—'}</td>
                  <td className="px-4 py-2.5 text-gray-400">{l.categoria ?? '—'}</td>
                  <td className="px-4 py-2.5 text-gray-400">{fmtDate(l.data_vencimento)}</td>
                  <td className="px-4 py-2.5"><span className={statusColors[l.status] ?? 'text-gray-400'}>{l.status}</span></td>
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
