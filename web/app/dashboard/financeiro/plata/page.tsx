import { createClient as sb } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import PlataChat from '../PlataChat'
import MemoriasPanel from '../../components/MemoriasPanel'

function fmt(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
}

function hoje() { return new Date().toISOString().split('T')[0] }
function diasAFrente(n: number) {
  return new Date(Date.now() + n * 86_400_000).toISOString().split('T')[0]
}
function diasAtras(n: number) {
  return new Date(Date.now() - n * 86_400_000).toISOString().split('T')[0]
}

const PERGUNTAS_RAPIDAS = [
  'Como está nosso caixa hoje?',
  'Quais as maiores inadimplências?',
  'O que vence nos próximos 7 dias?',
  'Como foi o resultado do mês?',
  'Qual o runway atual do grupo?',
  'Quais as maiores despesas?',
]

export default async function PlataPage() {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) redirect('/login')

  const supabase = sb(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const hojeISO = hoje()

  const [
    { data: convData },
    { data: saldosRaw },
    { data: lancamentos },
    { data: empresas },
    { data: syncLog },
  ] = await Promise.all([
    supabase.from('conversas_ia').select('mensagens').eq('agente', 'plata').eq('canal', 'dashboard').eq('contato_id', user.id).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('saldos_bancarios').select('banco, saldo, data_referencia').order('data_referencia', { ascending: false }),
    supabase.from('lancamentos_financeiros')
      .select('tipo, valor, data_vencimento, status, empresa_id, descricao, categoria, data_pagamento')
      .neq('status', 'cancelado')
      .gte('data_vencimento', diasAtras(90))
      .lte('data_vencimento', diasAFrente(30)),
    supabase.from('empresas').select('id, nome_curto').order('nome_curto'),
    supabase.from('sync_log').select('finalizado_em').eq('fonte', 'conta_azul').order('finalizado_em', { ascending: false }).limit(1),
  ])

  const initialMessages = ((convData?.mensagens ?? []) as { role: 'user' | 'assistant'; content: string }[]).slice(-30)
  const all = lancamentos ?? []
  const empNome: Record<string, string> = {}
  for (const e of empresas ?? []) empNome[e.id] = e.nome_curto

  // Saldo total
  const saldoMap: Record<string, number> = {}
  for (const s of saldosRaw ?? []) {
    if (!saldoMap[s.banco]) saldoMap[s.banco] = s.saldo ?? 0
  }
  const totalCaixa = Object.values(saldoMap).reduce((s, v) => s + v, 0)

  // Inadimplência
  const recVencidas = all.filter(l => l.tipo === 'receita' && l.status === 'vencido')
  const totalInadimplencia = recVencidas.reduce((s, l) => s + (l.valor ?? 0), 0)
  const totalReceitas = all.filter(l => l.tipo === 'receita').reduce((s, l) => s + (l.valor ?? 0), 0)
  const inadPct = totalReceitas > 0 ? (totalInadimplencia / totalReceitas) * 100 : 0

  // A receber próx. 30d
  const aRec30 = all.filter(l => l.tipo === 'receita' && l.status === 'pendente' && l.data_vencimento >= hojeISO && l.data_vencimento <= diasAFrente(30))
  const totalAReceber = aRec30.reduce((s, l) => s + (l.valor ?? 0), 0)

  // A pagar próx. 30d
  const aPag30 = all.filter(l => l.tipo === 'despesa' && l.status === 'pendente' && l.data_vencimento >= hojeISO && l.data_vencimento <= diasAFrente(30))
  const despVencidas = all.filter(l => l.tipo === 'despesa' && l.status === 'vencido')
  const totalAPagar = aPag30.reduce((s, l) => s + (l.valor ?? 0), 0)
  const totalDespVencidas = despVencidas.reduce((s, l) => s + (l.valor ?? 0), 0)

  // Urgentes (próx 7 dias)
  const urgRec = all.filter(l => l.tipo === 'receita' && l.status === 'pendente' && l.data_vencimento >= hojeISO && l.data_vencimento <= diasAFrente(7))
  const urgPag = all.filter(l => l.tipo === 'despesa' && l.status === 'pendente' && l.data_vencimento >= hojeISO && l.data_vencimento <= diasAFrente(7))

  // Runway
  const meses3Atras = [1, 2, 3].map(n => {
    const d = new Date(); d.setMonth(d.getMonth() - n)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const burnMeses = meses3Atras.map(m =>
    all.filter(l => l.tipo === 'despesa' && (l.status === 'pago' || l.status === 'parcial') && (l.data_pagamento ?? l.data_vencimento ?? '').startsWith(m))
      .reduce((s, l) => s + (l.valor ?? 0), 0)
  ).filter(v => v > 0)
  const avgBurn = burnMeses.length > 0 ? burnMeses.reduce((s, v) => s + v, 0) / burnMeses.length : 0
  const runway = avgBurn > 0 ? totalCaixa / avgBurn : null

  // Top inadimplentes por empresa
  const inadEmpMap: Record<string, number> = {}
  for (const l of recVencidas) {
    const emp = l.empresa_id ? (empNome[l.empresa_id] ?? '—') : 'Sem empresa'
    inadEmpMap[emp] = (inadEmpMap[emp] ?? 0) + (l.valor ?? 0)
  }
  const topInadEmp = Object.entries(inadEmpMap).sort((a, b) => b[1] - a[1]).slice(0, 5)

  // Alertas
  const alertas: { nivel: 'critico' | 'atencao'; msg: string }[] = []
  if (totalDespVencidas > 0)
    alertas.push({ nivel: 'critico', msg: `${despVencidas.length} despesa${despVencidas.length > 1 ? 's' : ''} vencida${despVencidas.length > 1 ? 's' : ''} — ${fmt(totalDespVencidas)} em atraso` })
  if (inadPct > 10)
    alertas.push({ nivel: 'critico', msg: `Inadimplência crítica: ${inadPct.toFixed(1)}% da receita — ${fmt(totalInadimplencia)}` })
  else if (inadPct > 5)
    alertas.push({ nivel: 'atencao', msg: `Inadimplência elevada: ${inadPct.toFixed(1)}% (${fmt(totalInadimplencia)}) — acionar cobrança` })
  if (runway !== null && runway < 1)
    alertas.push({ nivel: 'critico', msg: `Runway crítico: ${runway.toFixed(1)} meses — caixa insuficiente para o próximo mês` })
  else if (runway !== null && runway < 2)
    alertas.push({ nivel: 'atencao', msg: `Runway baixo: ${runway.toFixed(1)} meses — revisar fluxo de caixa` })
  if (urgPag.length > 0)
    alertas.push({ nivel: 'atencao', msg: `${urgPag.length} pagamento${urgPag.length > 1 ? 's' : ''} vence${urgPag.length === 1 ? '' : 'm'} nos próximos 7 dias — ${fmt(urgPag.reduce((s, l) => s + (l.valor ?? 0), 0))}` })

  const ultimoSync = syncLog?.[0]?.finalizado_em
    ? new Date(syncLog[0].finalizado_em).toLocaleString('pt-BR')
    : 'Nunca'

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      {/* Header — banner azul corporativo */}
      <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white">
        <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6">
          <div className="flex items-center gap-3 mb-2">
            <a href="/dashboard/financeiro" className="text-blue-200/80 text-sm hover:text-white">← Financeiro</a>
            <span className="text-blue-300">·</span>
            <a href="/dashboard" className="text-blue-200/80 text-sm hover:text-white">Centro de Comando</a>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-white flex items-center justify-center text-xl font-bold shadow-lg">Pl</div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Plata — CFO IA</h1>
              <p className="text-blue-100/90 text-sm">Fluxo de caixa · DRE · Inadimplência · Previsão · Sync: {ultimoSync}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6 md:py-8">

      {/* Alertas */}
      {alertas.length > 0 && (
        <div className="mb-6 space-y-2">
          {alertas.map((a, i) => (
            <div key={i} className={`rounded-xl px-4 py-3 flex items-start gap-3 border ${
              a.nivel === 'critico'
                ? 'bg-red-50 border-red-200'
                : 'bg-amber-50 border-amber-200'
            }`}>
              <span className="text-lg mt-0.5">{a.nivel === 'critico' ? '🔴' : '⚠️'}</span>
              <p className="text-sm text-slate-800">{a.msg}</p>
            </div>
          ))}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8">
        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <p className="text-xl font-bold text-slate-900">{fmt(totalCaixa)}</p>
          <p className="text-xs text-slate-500 mt-1">Caixa atual</p>
          {runway !== null && (
            <p className={`text-[10px] mt-0.5 ${runway < 1 ? 'text-red-700' : runway < 2 ? 'text-amber-700' : 'text-slate-500'}`}>
              runway {runway.toFixed(1)}m
            </p>
          )}
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <p className="text-xl font-bold text-emerald-700">{fmt(totalAReceber)}</p>
          <p className="text-xs text-slate-500 mt-1">A receber (30d)</p>
          <p className="text-[10px] text-slate-500 mt-0.5">{aRec30.length} títulos</p>
        </div>
        <div className={`rounded-xl p-4 border ${inadPct > 10 ? 'bg-red-50 border-red-200' : inadPct > 5 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
          <p className={`text-xl font-bold ${inadPct > 10 ? 'text-red-700' : inadPct > 5 ? 'text-amber-700' : 'text-slate-900'}`}>
            {fmt(totalInadimplencia)}
          </p>
          <p className="text-xs text-slate-500 mt-1">Inadimplência</p>
          <p className={`text-[10px] mt-0.5 ${inadPct > 5 ? 'text-amber-700' : 'text-slate-500'}`}>{inadPct.toFixed(1)}% da receita</p>
        </div>
        <div className={`rounded-xl p-4 border ${totalDespVencidas > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
          <p className={`text-xl font-bold ${totalDespVencidas > 0 ? 'text-red-700' : 'text-slate-900'}`}>
            {fmt(totalDespVencidas)}
          </p>
          <p className="text-xs text-slate-500 mt-1">Despesas vencidas</p>
          {despVencidas.length > 0 && <p className="text-[10px] text-red-700 mt-0.5">{despVencidas.length} em atraso</p>}
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <p className="text-xl font-bold text-red-800">{fmt(totalAPagar)}</p>
          <p className="text-xs text-slate-500 mt-1">A pagar (30d)</p>
          <p className="text-[10px] text-slate-500 mt-0.5">{aPag30.length} títulos</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <p className="text-xl font-bold text-blue-800">{fmt(totalAReceber - totalAPagar)}</p>
          <p className="text-xs text-slate-500 mt-1">Saldo líq. 30d</p>
          <p className={`text-[10px] mt-0.5 ${totalAReceber - totalAPagar >= 0 ? 'text-green-600' : 'text-red-700'}`}>
            {totalAReceber - totalAPagar >= 0 ? 'positivo' : 'negativo'}
          </p>
        </div>
      </div>

      {/* Layout principal */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Chat Plata — 2/3 */}
        <div className="md:col-span-2 space-y-6">
          <div>
            <h2 className="text-sm font-semibold text-slate-500 mb-3">Chat com Plata</h2>
            <Suspense>
              <PlataChat initialMessages={initialMessages} />
            </Suspense>
          </div>

          {/* Perguntas rápidas */}
          <div className="bg-white rounded-xl p-4 border border-slate-200">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Perguntas Rápidas</h3>
            <div className="flex flex-wrap gap-2">
              {PERGUNTAS_RAPIDAS.map((p, i) => (
                <button
                  key={i}
                  data-pergunta={p}
                  className="plata-quick text-xs px-3 py-1.5 bg-slate-100 hover:bg-amber-100 border border-slate-300 hover:border-amber-700/50 rounded-full text-slate-700 hover:text-amber-800 transition-colors cursor-pointer"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Top inadimplentes */}
          {topInadEmp.length > 0 && (
            <div className="bg-white rounded-xl p-5 border border-slate-200">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
                Inadimplência por Empresa — {fmt(totalInadimplencia)}
              </h3>
              <div className="space-y-3">
                {topInadEmp.map(([emp, val]) => (
                  <div key={emp}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs text-slate-700 flex-1 mr-2 truncate">{emp}</span>
                      <span className="text-xs font-medium text-red-700 shrink-0">{fmt(val)}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-red-700 rounded-full"
                        style={{ width: `${(val / topInadEmp[0][1]) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar — 1/3 */}
        <div className="space-y-4">
          {/* Urgente — próximos 7 dias */}
          <div className={`rounded-xl p-4 border ${urgRec.length > 0 || urgPag.length > 0 ? 'bg-yellow-950/20 border-amber-200' : 'bg-white border-slate-200'}`}>
            <h3 className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-3">Próximos 7 Dias</h3>
            <div className="space-y-2">
              {urgRec.length > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-emerald-700">A receber</span>
                  <div className="text-right">
                    <p className="text-xs font-semibold text-emerald-800">{fmt(urgRec.reduce((s, l) => s + (l.valor ?? 0), 0))}</p>
                    <p className="text-[10px] text-slate-500">{urgRec.length} títulos</p>
                  </div>
                </div>
              )}
              {urgPag.length > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-red-700">A pagar</span>
                  <div className="text-right">
                    <p className="text-xs font-semibold text-red-800">{fmt(urgPag.reduce((s, l) => s + (l.valor ?? 0), 0))}</p>
                    <p className="text-[10px] text-slate-500">{urgPag.length} títulos</p>
                  </div>
                </div>
              )}
              {urgRec.length === 0 && urgPag.length === 0 && (
                <p className="text-xs text-slate-500">Nenhum vencimento nos próximos 7 dias</p>
              )}
            </div>
            {urgPag.length > 0 && (
              <div className="mt-3 pt-3 border-t border-yellow-900/30 space-y-1">
                {urgPag.slice(0, 4).map((l, i) => (
                  <div key={i} className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-500 truncate flex-1 mr-2">{l.descricao ?? l.categoria ?? '—'}</span>
                    <span className="text-red-700 shrink-0">{fmt(l.valor ?? 0)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Despesas vencidas */}
          {despVencidas.length > 0 && (
            <div className="bg-red-50 rounded-xl p-4 border border-red-200">
              <h3 className="text-xs font-semibold text-red-700 uppercase tracking-wider mb-3">
                Despesas em Atraso — {despVencidas.length}
              </h3>
              <div className="space-y-1">
                {despVencidas.slice(0, 5).map((l, i) => (
                  <div key={i} className="flex justify-between text-[11px] items-center">
                    <span className="text-slate-500 truncate flex-1 mr-2">{l.descricao ?? l.categoria ?? '—'}</span>
                    <span className="text-red-700 shrink-0">{fmt(l.valor ?? 0)}</span>
                  </div>
                ))}
                {despVencidas.length > 5 && (
                  <p className="text-[10px] text-slate-500 mt-1">+{despVencidas.length - 5} outros</p>
                )}
              </div>
            </div>
          )}

          {/* Runway visual */}
          <div className="bg-white rounded-xl p-4 border border-slate-200">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Saúde do Caixa</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-xs text-slate-500">Caixa disponível</span>
                <span className="text-xs font-medium text-slate-900">{fmt(totalCaixa)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-slate-500">Burn mensal médio</span>
                <span className="text-xs font-medium text-slate-700">{avgBurn > 0 ? fmt(avgBurn) : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-slate-500">Runway</span>
                <span className={`text-xs font-bold ${
                  !runway ? 'text-slate-500'
                  : runway < 1 ? 'text-red-700'
                  : runway < 2 ? 'text-amber-700'
                  : 'text-emerald-700'
                }`}>
                  {runway !== null ? `${runway.toFixed(1)} meses` : '—'}
                </span>
              </div>
            </div>
            {runway !== null && (
              <div className="mt-3">
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${runway < 1 ? 'bg-red-600' : runway < 2 ? 'bg-yellow-600' : runway < 6 ? 'bg-blue-600' : 'bg-green-600'}`}
                    style={{ width: `${Math.min((runway / 12) * 100, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[9px] text-slate-500 mt-1">
                  <span>0</span><span>3m</span><span>6m</span><span>12m+</span>
                </div>
              </div>
            )}
          </div>

          {/* Memórias */}
          <MemoriasPanel agente="plata" />

          {/* Links */}
          <div className="bg-white rounded-xl p-4 border border-slate-200">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Módulos</h3>
            <div className="space-y-2">
              {[
                { label: 'Contas a Pagar/Receber', href: '/dashboard/financeiro/contas', color: 'text-slate-700' },
                { label: 'Inadimplentes', href: '/dashboard/financeiro/inadimplentes', color: 'text-red-700' },
                { label: 'DRE Gerencial', href: '/dashboard/financeiro/dre', color: 'text-amber-700' },
                { label: 'Dashboard Financeiro', href: '/dashboard/financeiro', color: 'text-blue-700' },
              ].map(link => (
                <a key={link.href} href={link.href} className={`block text-xs ${link.color} hover:underline`}>
                  {link.label} →
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
      </div>
    </main>
  )
}
