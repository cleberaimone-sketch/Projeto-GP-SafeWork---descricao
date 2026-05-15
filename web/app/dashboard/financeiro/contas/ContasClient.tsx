'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useState, useMemo } from 'react'

interface Empresa { id: string; nome_curto: string }
interface Lancamento {
  id: string
  empresa_id: string | null
  empresa_nome: string
  tipo: string
  descricao: string | null
  categoria: string | null
  valor: number | null
  data_vencimento: string | null
  data_pagamento: string | null
  status: string
  dias: number
}
interface Kpi {
  totalARec: number; totalAPagar: number
  vencidoRec: number; vencidoDesp: number
  vencendo7d: number; qtdVencendo7d: number
  pagosRec: number; pagosDesp: number
  qtdTotal: number
}
interface Props {
  lancamentos: Lancamento[]
  empresas: Empresa[]
  categorias: string[]
  kpi: Kpi
  hoje: string
}

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
const fmtDate = (d: string | null) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—'

const STATUS_COR: Record<string, string> = {
  pago:     'bg-green-900/40 text-green-300 border-green-800/50',
  pendente: 'bg-yellow-900/40 text-yellow-300 border-yellow-800/50',
  vencido:  'bg-red-900/40 text-red-300 border-red-800/50',
  parcial:  'bg-orange-900/40 text-orange-300 border-orange-800/50',
  cancelado:'bg-gray-800 text-gray-500 border-gray-700',
}
const STATUS_LABEL: Record<string, string> = {
  pago: 'Pago', pendente: 'Pendente', vencido: 'Vencido', parcial: 'Parcial', cancelado: 'Cancelado',
}

function diasLabel(dias: number, status: string) {
  if (status === 'pago') return null
  if (dias < 0) return { txt: `vence em ${Math.abs(dias)}d`, cor: 'text-blue-400' }
  if (dias === 0) return { txt: 'vence hoje', cor: 'text-amber-400' }
  if (dias <= 7) return { txt: `${dias}d em atraso`, cor: 'text-orange-400' }
  if (dias <= 30) return { txt: `${dias}d em atraso`, cor: 'text-orange-500' }
  return { txt: `${dias}d em atraso`, cor: 'text-red-400' }
}

type TabTipo = 'todos' | 'receita' | 'despesa'
type Ordem   = 'vencimento' | 'valor' | 'empresa'

export default function ContasClient({ lancamentos, empresas, categorias, kpi, hoje }: Props) {
  const router   = useRouter()
  const pathname = usePathname()
  const params   = useSearchParams()

  const [tab,    setTab]    = useState<TabTipo>('todos')
  const [ordem,  setOrdem]  = useState<Ordem>('vencimento')
  const [busca,  setBusca]  = useState('')
  const [mostrarPagos, setMostrarPagos] = useState(false)

  const empresaId = params.get('empresa') ?? ''
  const de        = params.get('de')      ?? ''
  const ate       = params.get('ate')     ?? ''
  const statusF   = params.get('status')  ?? ''
  const catF      = params.get('cat')     ?? ''

  function nav(updates: Record<string, string>) {
    const p = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v) p.set(k, v); else p.delete(k)
    }
    router.push(`${pathname}?${p.toString()}`)
  }

  const filtrados = useMemo(() => {
    let list = lancamentos
    if (tab !== 'todos') list = list.filter(l => l.tipo === tab)
    if (!mostrarPagos)   list = list.filter(l => l.status !== 'pago')
    if (busca) {
      const q = busca.toLowerCase()
      list = list.filter(l =>
        (l.descricao ?? '').toLowerCase().includes(q) ||
        l.empresa_nome.toLowerCase().includes(q) ||
        (l.categoria ?? '').toLowerCase().includes(q)
      )
    }
    return [...list].sort((a, b) => {
      if (ordem === 'vencimento') return (a.data_vencimento ?? '').localeCompare(b.data_vencimento ?? '')
      if (ordem === 'valor')      return (b.valor ?? 0) - (a.valor ?? 0)
      return a.empresa_nome.localeCompare(b.empresa_nome)
    })
  }, [lancamentos, tab, mostrarPagos, busca, ordem])

  const totalFiltrado = filtrados.reduce((s, l) => {
    return s + (l.tipo === 'receita' ? (l.valor ?? 0) : -(l.valor ?? 0))
  }, 0)

  const saldoLiquido = kpi.totalARec - kpi.totalAPagar

  return (
    <div className="space-y-5">

      {/* ── KPI Cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-green-950/30 rounded-xl border border-green-900/40 p-4">
          <p className="text-xs text-gray-400 mb-1">A Receber</p>
          <p className="text-xl font-bold text-green-300">{fmt(kpi.totalARec)}</p>
          <p className="text-xs text-gray-500 mt-1">pendente + vencido</p>
        </div>
        <div className="bg-red-950/30 rounded-xl border border-red-900/40 p-4">
          <p className="text-xs text-gray-400 mb-1">A Pagar</p>
          <p className="text-xl font-bold text-red-300">{fmt(kpi.totalAPagar)}</p>
          <p className="text-xs text-gray-500 mt-1">pendente + vencido</p>
        </div>
        <div className={`rounded-xl border p-4 ${saldoLiquido >= 0 ? 'bg-blue-950/20 border-blue-900/40' : 'bg-red-950/20 border-red-900/40'}`}>
          <p className="text-xs text-gray-400 mb-1">Saldo Líquido</p>
          <p className={`text-xl font-bold ${saldoLiquido >= 0 ? 'text-blue-300' : 'text-red-300'}`}>
            {saldoLiquido >= 0 ? '+' : ''}{fmt(saldoLiquido)}
          </p>
          <p className="text-xs text-gray-500 mt-1">A receber − a pagar</p>
        </div>
        <div className="bg-red-950/20 rounded-xl border border-red-900/30 p-4">
          <p className="text-xs text-gray-400 mb-1">Vencidos</p>
          <p className="text-lg font-bold text-red-400">{fmt(kpi.vencidoRec + kpi.vencidoDesp)}</p>
          <p className="text-xs text-red-700 mt-1">
            rec: {fmt(kpi.vencidoRec)} · pag: {fmt(kpi.vencidoDesp)}
          </p>
        </div>
        <div className="bg-amber-950/20 rounded-xl border border-amber-900/30 p-4">
          <p className="text-xs text-gray-400 mb-1">Vencem em 7 dias</p>
          <p className="text-lg font-bold text-amber-300">{fmt(kpi.vencendo7d)}</p>
          <p className="text-xs text-gray-500 mt-1">{kpi.qtdVencendo7d} lançamentos</p>
        </div>
      </div>

      {/* ── Filtros ──────────────────────────────────────────────────────── */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Empresa</label>
            <select value={empresaId} onChange={e => nav({ empresa: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500">
              <option value="">Todas</option>
              {empresas.map(e => <option key={e.id} value={e.id}>{e.nome_curto}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Vencimento de</label>
            <input type="date" value={de} onChange={e => nav({ de: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none [color-scheme:dark]" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Vencimento até</label>
            <input type="date" value={ate} onChange={e => nav({ ate: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none [color-scheme:dark]" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Status</label>
            <select value={statusF} onChange={e => nav({ status: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500">
              <option value="">Todos</option>
              <option value="pendente">Pendente</option>
              <option value="vencido">Vencido</option>
              <option value="pago">Pago</option>
              <option value="parcial">Parcial</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Categoria</label>
            <select value={catF} onChange={e => nav({ cat: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500">
              <option value="">Todas</option>
              {categorias.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Buscar</label>
            <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Descrição, cliente..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none" />
          </div>
        </div>

        {/* Atalhos de período */}
        <div className="flex gap-1.5 flex-wrap">
          {[
            { l: 'Hoje',         de: hoje,       ate: hoje },
            { l: 'Esta semana',  de: (() => { const d = new Date(); const dia = d.getDay(); d.setDate(d.getDate() - (dia===0?6:dia-1)); return d.toISOString().split('T')[0] })(), ate: hoje },
            { l: 'Mês atual',    de: `${hoje.slice(0,7)}-01`, ate: hoje },
            { l: 'Próx. 7 dias', de: hoje,       ate: new Date(new Date().setDate(new Date().getDate()+7)).toISOString().split('T')[0] },
            { l: 'Próx. 30 dias',de: hoje,       ate: new Date(new Date().setDate(new Date().getDate()+30)).toISOString().split('T')[0] },
            { l: '2026',         de: '2026-01-01', ate: '2026-12-31' },
            { l: '2025',         de: '2025-01-01', ate: '2025-12-31' },
          ].map(a => (
            <button key={a.l} onClick={() => nav({ de: a.de, ate: a.ate })}
              className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${de === a.de && ate === a.ate ? 'bg-amber-700 border-amber-600 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'}`}>
              {a.l}
            </button>
          ))}
          {(de || ate || empresaId || statusF || catF) && (
            <button onClick={() => router.push(pathname)}
              className="text-xs px-2.5 py-1 rounded-lg border border-gray-700 bg-gray-800 text-amber-400 hover:bg-gray-700 ml-2">
              ✕ Limpar
            </button>
          )}
        </div>
      </div>

      {/* ── Tabela ───────────────────────────────────────────────────────── */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        {/* Toolbar */}
        <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between flex-wrap gap-3">
          {/* Tabs */}
          <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-0.5">
            {([['todos','Todos'], ['receita','A Receber'], ['despesa','A Pagar']] as [TabTipo, string][]).map(([v, l]) => (
              <button key={v} onClick={() => setTab(v)}
                className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${tab === v ? (v === 'receita' ? 'bg-green-800 text-white' : v === 'despesa' ? 'bg-red-800 text-white' : 'bg-gray-700 text-white') : 'text-gray-400 hover:text-white'}`}>
                {l}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {/* Toggle pagos */}
            <label className="flex items-center gap-1.5 cursor-pointer">
              <div
                onClick={() => setMostrarPagos(!mostrarPagos)}
                className={`w-8 h-4 rounded-full transition-colors relative ${mostrarPagos ? 'bg-green-700' : 'bg-gray-700'}`}
              >
                <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${mostrarPagos ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-xs text-gray-400">Mostrar pagos</span>
            </label>

            {/* Ordenação */}
            <select value={ordem} onChange={e => setOrdem(e.target.value as Ordem)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none">
              <option value="vencimento">Por vencimento</option>
              <option value="valor">Por valor</option>
              <option value="empresa">Por empresa</option>
            </select>

            {/* Contagem + total */}
            <div className="text-right">
              <p className="text-xs text-gray-500">{filtrados.length} lançamentos</p>
              <p className={`text-xs font-semibold font-mono ${totalFiltrado >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {totalFiltrado >= 0 ? '+' : ''}{fmt(totalFiltrado)}
              </p>
            </div>
          </div>
        </div>

        {/* Tabela */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-800 bg-gray-900/80">
                <th className="text-left px-4 py-2.5 w-8">Tipo</th>
                <th className="text-left px-4 py-2.5">Empresa</th>
                <th className="text-left px-4 py-2.5">Descrição</th>
                <th className="text-left px-3 py-2.5">Categoria</th>
                <th className="text-left px-3 py-2.5">Vencimento</th>
                <th className="text-left px-3 py-2.5">Pagamento</th>
                <th className="text-center px-3 py-2.5">Status</th>
                <th className="text-right px-4 py-2.5">Valor</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-500">
                    Nenhum lançamento encontrado
                  </td>
                </tr>
              ) : filtrados.map((l, i) => {
                const dl = diasLabel(l.dias, l.status)
                const isRec = l.tipo === 'receita'
                return (
                  <tr key={i} className={`border-b border-gray-800/40 hover:bg-gray-800/30 transition-colors ${l.status === 'vencido' ? 'bg-red-950/10' : l.status === 'pago' ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-2.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${isRec ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
                        {isRec ? 'R' : 'D'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-400 whitespace-nowrap">{l.empresa_nome}</td>
                    <td className="px-4 py-2.5 max-w-[200px]">
                      <p className="text-gray-200 truncate">{l.descricao ?? '—'}</p>
                      {dl && <p className={`text-[10px] ${dl.cor}`}>{dl.txt}</p>}
                    </td>
                    <td className="px-3 py-2.5 text-gray-500 max-w-[120px] truncate">{l.categoria ?? '—'}</td>
                    <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap">{fmtDate(l.data_vencimento)}</td>
                    <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{fmtDate(l.data_pagamento)}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${STATUS_COR[l.status] ?? 'text-gray-400'}`}>
                        {STATUS_LABEL[l.status] ?? l.status}
                      </span>
                    </td>
                    <td className={`px-4 py-2.5 text-right font-mono font-semibold whitespace-nowrap ${isRec ? 'text-green-300' : 'text-red-300'}`}>
                      {fmt(l.valor ?? 0)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {filtrados.length > 0 && (
              <tfoot>
                <tr className="border-t border-gray-700 bg-gray-800/50">
                  <td colSpan={6} className="px-4 py-2.5 text-xs text-gray-400">{filtrados.length} lançamentos</td>
                  <td className="px-3 py-2.5 text-right text-xs text-gray-500">Líquido</td>
                  <td className={`px-4 py-2.5 text-right font-mono font-bold text-sm ${totalFiltrado >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                    {totalFiltrado >= 0 ? '+' : ''}{fmt(totalFiltrado)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}
