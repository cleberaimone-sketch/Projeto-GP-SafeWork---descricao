'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback } from 'react'

interface Empresa {
  id: string
  nome_curto: string
}

interface Props {
  empresas: Empresa[]
  mesesDisponiveis: string[] // ['2024-01', '2024-02', ...]
}

export default function FiltrosFinanceiro({ empresas, mesesDisponiveis }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const empresaId = params.get('empresa') ?? ''
  const mesInicio = params.get('de') ?? ''
  const mesFim = params.get('ate') ?? ''
  const tipo = params.get('tipo') ?? ''
  const status = params.get('status') ?? ''

  const set = useCallback((key: string, value: string) => {
    const p = new URLSearchParams(params.toString())
    if (value) p.set(key, value)
    else p.delete(key)
    router.push(`${pathname}?${p.toString()}`)
  }, [params, pathname, router])

  const limpar = () => router.push(pathname)

  const temFiltro = empresaId || mesInicio || mesFim || tipo || status

  const anos = [...new Set(mesesDisponiveis.map(m => m.slice(0, 4)))].sort().reverse()
  const meses = [
    { v: '01', l: 'Jan' }, { v: '02', l: 'Fev' }, { v: '03', l: 'Mar' },
    { v: '04', l: 'Abr' }, { v: '05', l: 'Mai' }, { v: '06', l: 'Jun' },
    { v: '07', l: 'Jul' }, { v: '08', l: 'Ago' }, { v: '09', l: 'Set' },
    { v: '10', l: 'Out' }, { v: '11', l: 'Nov' }, { v: '12', l: 'Dez' },
  ]

  const mesOpts = mesesDisponiveis.map(m => {
    const [ano, mes] = m.split('-')
    const nome = meses.find(x => x.v === mes)?.l ?? mes
    return { v: m, l: `${nome}/${ano.slice(2)}` }
  }).reverse()

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Filtros</h3>
        {temFiltro && (
          <button onClick={limpar} className="text-xs text-amber-400 hover:text-amber-300 transition-colors">
            ✕ Limpar filtros
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {/* Empresa */}
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Empresa</label>
          <select
            value={empresaId}
            onChange={e => set('empresa', e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            <option value="">Todas</option>
            {empresas.map(e => (
              <option key={e.id} value={e.id}>{e.nome_curto}</option>
            ))}
          </select>
        </div>

        {/* De */}
        <div>
          <label className="text-xs text-gray-500 mb-1 block">De</label>
          <select
            value={mesInicio}
            onChange={e => set('de', e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            <option value="">Início</option>
            {mesOpts.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
          </select>
        </div>

        {/* Até */}
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Até</label>
          <select
            value={mesFim}
            onChange={e => set('ate', e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            <option value="">Hoje</option>
            {mesOpts.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
          </select>
        </div>

        {/* Tipo */}
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Tipo</label>
          <select
            value={tipo}
            onChange={e => set('tipo', e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            <option value="">Ambos</option>
            <option value="receita">Receitas</option>
            <option value="despesa">Despesas</option>
          </select>
        </div>

        {/* Status */}
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Status</label>
          <select
            value={status}
            onChange={e => set('status', e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            <option value="">Todos</option>
            <option value="pago">Pago</option>
            <option value="pendente">Pendente</option>
            <option value="vencido">Vencido</option>
            <option value="parcial">Parcial</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </div>
      </div>

      {/* Atalhos de período */}
      <div className="flex gap-2 mt-3 flex-wrap">
        <span className="text-xs text-gray-500">Rápido:</span>
        {[
          { l: 'Jan–Dez 2026', de: '2026-01', ate: '2026-12' },
          { l: 'Jan–Dez 2025', de: '2025-01', ate: '2025-12' },
          { l: 'Jan–Dez 2024', de: '2024-01', ate: '2024-12' },
          { l: 'Últ. 3 meses', de: mesesDisponiveis[mesesDisponiveis.length - 3] ?? '', ate: '' },
          { l: 'Últ. 12 meses', de: mesesDisponiveis[mesesDisponiveis.length - 12] ?? '', ate: '' },
        ].map(a => (
          <button
            key={a.l}
            onClick={() => {
              const p = new URLSearchParams(params.toString())
              if (a.de) p.set('de', a.de); else p.delete('de')
              if (a.ate) p.set('ate', a.ate); else p.delete('ate')
              router.push(`${pathname}?${p.toString()}`)
            }}
            className="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
          >
            {a.l}
          </button>
        ))}
        {anos.map(ano => (
          <button
            key={ano}
            onClick={() => {
              const p = new URLSearchParams(params.toString())
              p.set('de', `${ano}-01`)
              p.set('ate', `${ano}-12`)
              router.push(`${pathname}?${p.toString()}`)
            }}
            className="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
          >
            {ano}
          </button>
        ))}
      </div>
    </div>
  )
}
