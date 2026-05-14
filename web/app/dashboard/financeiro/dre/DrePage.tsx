'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'

interface Empresa { id: string; nome_curto: string; nome: string }

export interface DreCategoria {
  categoria: string
  valor: number
  pct?: number
}

export interface DreLinha {
  label: string
  valor: number
  destaque?: 'positivo' | 'negativo' | 'neutro' | 'total'
  indent?: number
  separador?: boolean
}

interface Props {
  empresas: Empresa[]
  linhas: DreLinha[]
  receitaBruta: number
  categorias: { receitas: DreCategoria[]; despesas: DreCategoria[] }
  periodo: string
  empresaNome: string
}

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const fmtPct = (v: number, base: number) =>
  base === 0 ? '—' : ((v / base) * 100).toFixed(1) + '%'

export default function DrePage({ empresas, linhas, receitaBruta, categorias, periodo, empresaNome }: Props) {
  const router   = useRouter()
  const pathname = usePathname()
  const params   = useSearchParams()

  const empresaId = params.get('empresa') ?? ''
  const ano       = params.get('ano')     ?? new Date().getFullYear().toString()
  const mes       = params.get('mes')     ?? ''

  function navegar(updates: Record<string, string>) {
    const p = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v) p.set(k, v); else p.delete(k)
    }
    router.push(`${pathname}?${p.toString()}`)
  }

  const anos = ['2020','2021','2022','2023','2024','2025','2026']
  const meses = [
    { v: '', l: 'Ano completo' },
    { v: '01', l: 'Janeiro' }, { v: '02', l: 'Fevereiro' }, { v: '03', l: 'Março' },
    { v: '04', l: 'Abril' },   { v: '05', l: 'Maio' },     { v: '06', l: 'Junho' },
    { v: '07', l: 'Julho' },   { v: '08', l: 'Agosto' },   { v: '09', l: 'Setembro' },
    { v: '10', l: 'Outubro' }, { v: '11', l: 'Novembro' }, { v: '12', l: 'Dezembro' },
  ]

  return (
    <div className="space-y-6">
      {/* Filtros DRE */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Empresa */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Empresa</label>
            <select value={empresaId} onChange={e => navegar({ empresa: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500">
              <option value="">Consolidado (Holding)</option>
              {empresas.map(e => <option key={e.id} value={e.id}>{e.nome_curto}</option>)}
            </select>
          </div>
          {/* Ano */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Ano</label>
            <select value={ano} onChange={e => navegar({ ano: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500">
              {anos.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          {/* Mês */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Mês</label>
            <select value={mes} onChange={e => navegar({ mes: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500">
              {meses.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
            </select>
          </div>
          {/* Info */}
          <div className="flex flex-col justify-end">
            <p className="text-xs text-amber-400 font-medium">{empresaNome}</p>
            <p className="text-xs text-gray-500">{periodo}</p>
          </div>
        </div>

        {/* Atalhos de empresa */}
        <div className="flex gap-1.5 flex-wrap mt-3">
          <button onClick={() => navegar({ empresa: '' })}
            className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${!empresaId ? 'bg-amber-700 border-amber-600 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'}`}>
            Consolidado
          </button>
          {empresas.map(e => (
            <button key={e.id} onClick={() => navegar({ empresa: e.id })}
              className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${empresaId === e.id ? 'bg-amber-700 border-amber-600 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'}`}>
              {e.nome_curto}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* DRE Table */}
        <div className="md:col-span-2 bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800">
            <h2 className="text-sm font-bold text-white">DRE — {empresaNome}</h2>
            <p className="text-xs text-gray-400">{periodo}</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-800">
                <th className="text-left px-5 py-2">Descrição</th>
                <th className="text-right px-5 py-2">Valor</th>
                <th className="text-right px-5 py-2">% Rec.</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => {
                if (l.separador) return (
                  <tr key={i}><td colSpan={3} className="border-t border-gray-800 pt-1" /></tr>
                )
                const cor = l.destaque === 'positivo' ? 'text-green-400'
                  : l.destaque === 'negativo' ? 'text-red-400'
                  : l.destaque === 'total' ? 'text-white font-bold'
                  : 'text-gray-300'
                const bg = l.destaque === 'total' ? 'bg-gray-800/60' : ''
                return (
                  <tr key={i} className={`border-b border-gray-800/40 hover:bg-gray-800/20 ${bg}`}>
                    <td className="px-5 py-2" style={{ paddingLeft: `${(l.indent ?? 0) * 16 + 20}px` }}>
                      <span className={l.destaque === 'total' ? 'text-white font-semibold' : 'text-gray-300'}>
                        {l.label}
                      </span>
                    </td>
                    <td className={`px-5 py-2 text-right font-mono ${cor}`}>
                      {fmt(l.valor)}
                    </td>
                    <td className="px-5 py-2 text-right text-xs text-gray-500">
                      {fmtPct(Math.abs(l.valor), receitaBruta)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Detalhamento por categoria */}
        <div className="space-y-4">
          {/* Top receitas */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Receitas por Categoria</h3>
            <div className="space-y-2">
              {categorias.receitas.slice(0, 8).map((c, i) => (
                <div key={i}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-300 truncate max-w-[60%]">{c.categoria}</span>
                    <span className="text-green-400">{fmt(c.valor)}</span>
                  </div>
                  <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-green-700 rounded-full" style={{ width: `${c.pct ?? 0}%` }} />
                  </div>
                </div>
              ))}
              {categorias.receitas.length === 0 && <p className="text-xs text-gray-500">Nenhuma receita no período</p>}
            </div>
          </div>

          {/* Top despesas */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Despesas por Categoria</h3>
            <div className="space-y-2">
              {categorias.despesas.slice(0, 8).map((c, i) => (
                <div key={i}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-300 truncate max-w-[60%]">{c.categoria}</span>
                    <span className="text-red-400">{fmt(c.valor)}</span>
                  </div>
                  <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-red-800 rounded-full" style={{ width: `${c.pct ?? 0}%` }} />
                  </div>
                </div>
              ))}
              {categorias.despesas.length === 0 && <p className="text-xs text-gray-500">Nenhuma despesa no período</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
