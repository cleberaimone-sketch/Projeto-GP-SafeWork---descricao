'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback } from 'react'

interface Empresa { id: string; nome_curto: string }
interface Props { empresas: Empresa[] }

// Helpers de data
function hoje() { return new Date().toISOString().split('T')[0] }
function diasAtras(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0]
}
function inicioMes(offset = 0) {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + offset)
  return d.toISOString().split('T')[0]
}
function fimMes(offset = 0) {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + offset + 1); d.setDate(0)
  return d.toISOString().split('T')[0]
}
function inicioAno(ano: number) { return `${ano}-01-01` }
function fimAno(ano: number)    { return `${ano}-12-31` }
function inicioSemana() {
  const d = new Date(); const dia = d.getDay(); d.setDate(d.getDate() - (dia === 0 ? 6 : dia - 1))
  return d.toISOString().split('T')[0]
}

const ATALHOS = [
  { l: 'Hoje',          de: () => hoje(),           ate: () => hoje() },
  { l: 'Ontem',         de: () => diasAtras(1),      ate: () => diasAtras(1) },
  { l: 'Esta semana',   de: () => inicioSemana(),    ate: () => hoje() },
  { l: 'Últ. 7 dias',   de: () => diasAtras(7),      ate: () => hoje() },
  { l: 'Últ. 30 dias',  de: () => diasAtras(30),     ate: () => hoje() },
  { l: 'Últ. 90 dias',  de: () => diasAtras(90),     ate: () => hoje() },
  { l: 'Mês atual',     de: () => inicioMes(0),      ate: () => fimMes(0) },
  { l: 'Último mês',    de: () => inicioMes(-1),     ate: () => fimMes(-1) },
  { l: '2026',          de: () => inicioAno(2026),   ate: () => fimAno(2026) },
  { l: '2025',          de: () => inicioAno(2025),   ate: () => fimAno(2025) },
  { l: '2024',          de: () => inicioAno(2024),   ate: () => fimAno(2024) },
  { l: '2023',          de: () => inicioAno(2023),   ate: () => fimAno(2023) },
]

export default function FiltrosFinanceiro({ empresas }: Props) {
  const router   = useRouter()
  const pathname = usePathname()
  const params   = useSearchParams()

  const empresaId = params.get('empresa') ?? ''
  const de        = params.get('de')      ?? ''
  const ate       = params.get('ate')     ?? ''
  const tipo      = params.get('tipo')    ?? ''
  const status    = params.get('status')  ?? ''
  const categoria = params.get('cat')     ?? ''

  const set = useCallback((updates: Record<string, string>) => {
    const p = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v) p.set(k, v); else p.delete(k)
    }
    router.push(`${pathname}?${p.toString()}`)
  }, [params, pathname, router])

  const limpar = () => router.push(pathname)
  const temFiltro = !!(empresaId || de || ate || tipo || status || categoria)

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Filtros</h3>
        {temFiltro && (
          <button onClick={limpar} className="text-xs text-amber-400 hover:text-amber-300 transition-colors">
            ✕ Limpar filtros
          </button>
        )}
      </div>

      {/* Linha 1 — selects */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Empresa</label>
          <select value={empresaId} onChange={e => set({ empresa: e.target.value })}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500">
            <option value="">Todas</option>
            {empresas.map(e => <option key={e.id} value={e.id}>{e.nome_curto}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs text-gray-500 mb-1 block">Data início</label>
          <input type="date" value={de} onChange={e => set({ de: e.target.value })}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500 [color-scheme:dark]" />
        </div>

        <div>
          <label className="text-xs text-gray-500 mb-1 block">Data fim</label>
          <input type="date" value={ate} onChange={e => set({ ate: e.target.value })}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500 [color-scheme:dark]" />
        </div>

        <div>
          <label className="text-xs text-gray-500 mb-1 block">Tipo</label>
          <select value={tipo} onChange={e => set({ tipo: e.target.value })}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500">
            <option value="">Ambos</option>
            <option value="receita">Receitas</option>
            <option value="despesa">Despesas</option>
          </select>
        </div>

        <div>
          <label className="text-xs text-gray-500 mb-1 block">Status</label>
          <select value={status} onChange={e => set({ status: e.target.value })}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500">
            <option value="">Todos</option>
            <option value="pago">Pago</option>
            <option value="pendente">Pendente</option>
            <option value="vencido">Vencido</option>
            <option value="parcial">Parcial</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </div>
      </div>

      {/* Linha 2 — atalhos */}
      <div className="flex gap-1.5 flex-wrap items-center">
        <span className="text-xs text-gray-500 mr-1">Atalho:</span>
        {ATALHOS.map(a => {
          const ativo = de === a.de() && ate === a.ate()
          return (
            <button
              key={a.l}
              onClick={() => set({ de: a.de(), ate: a.ate() })}
              className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                ativo
                  ? 'bg-amber-700 border-amber-600 text-white'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-white'
              }`}
            >
              {a.l}
            </button>
          )
        })}
      </div>

      {/* Linha 3 — resumo do filtro ativo */}
      {temFiltro && (
        <div className="flex gap-3 flex-wrap text-xs">
          {empresaId && empresas.find(e => e.id === empresaId) && (
            <span className="bg-amber-900/40 text-amber-300 px-2 py-0.5 rounded-full">
              {empresas.find(e => e.id === empresaId)!.nome_curto}
            </span>
          )}
          {(de || ate) && (
            <span className="bg-blue-900/40 text-blue-300 px-2 py-0.5 rounded-full">
              {de || '...'} → {ate || 'hoje'}
            </span>
          )}
          {tipo && (
            <span className="bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full capitalize">{tipo}</span>
          )}
          {status && (
            <span className="bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full capitalize">{status}</span>
          )}
        </div>
      )}
    </div>
  )
}
