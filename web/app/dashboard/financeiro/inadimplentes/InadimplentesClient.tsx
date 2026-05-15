'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useState } from 'react'

interface Empresa { id: string; nome_curto: string }
interface Lancamento {
  id: string
  empresa_id: string | null
  empresa_nome: string
  descricao: string | null
  categoria: string | null
  valor: number | null
  data_vencimento: string | null
  status: string
  dias_atraso: number
}
interface ResumoPorEmpresa { nome: string; total: number; qtd: number; max_atraso: number }

interface Props {
  lancamentos: Lancamento[]
  empresas: Empresa[]
  resumoPorEmpresa: ResumoPorEmpresa[]
  totalGeral: number
  maisAntigo: number
}

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const fmtDate = (d: string | null) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—'

function riskColor(dias: number) {
  if (dias > 90) return 'text-red-400'
  if (dias > 30) return 'text-orange-400'
  return 'text-yellow-400'
}

function riskBg(dias: number) {
  if (dias > 90) return 'bg-red-900/30 border-red-800/50'
  if (dias > 30) return 'bg-orange-900/30 border-orange-800/50'
  return 'bg-yellow-900/20 border-yellow-800/30'
}

export default function InadimplentesClient({
  lancamentos, empresas, resumoPorEmpresa, totalGeral, maisAntigo,
}: Props) {
  const router   = useRouter()
  const pathname = usePathname()
  const params   = useSearchParams()
  const [busca, setBusca] = useState('')

  const empresaId = params.get('empresa') ?? ''
  const de        = params.get('de') ?? ''
  const ate       = params.get('ate') ?? ''

  function navegar(updates: Record<string, string>) {
    const p = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v) p.set(k, v); else p.delete(k)
    }
    router.push(`${pathname}?${p.toString()}`)
  }

  // Faixas de vencimento
  const ate30  = lancamentos.filter(l => l.dias_atraso <= 30)
  const ate90  = lancamentos.filter(l => l.dias_atraso > 30 && l.dias_atraso <= 90)
  const acima90 = lancamentos.filter(l => l.dias_atraso > 90)

  // Filtro de busca local
  const filtrados = busca
    ? lancamentos.filter(l =>
        (l.descricao ?? '').toLowerCase().includes(busca.toLowerCase()) ||
        l.empresa_nome.toLowerCase().includes(busca.toLowerCase()) ||
        (l.categoria ?? '').toLowerCase().includes(busca.toLowerCase())
      )
    : lancamentos

  const mediaValor = lancamentos.length > 0 ? totalGeral / lancamentos.length : 0

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Empresa</label>
            <select value={empresaId} onChange={e => navegar({ empresa: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-red-500">
              <option value="">Todas</option>
              {empresas.map(e => <option key={e.id} value={e.id}>{e.nome_curto}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Vencimento de</label>
            <input type="date" value={de} onChange={e => navegar({ de: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-red-500 [color-scheme:dark]" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Vencimento até</label>
            <input type="date" value={ate} onChange={e => navegar({ ate: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-red-500 [color-scheme:dark]" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Buscar</label>
            <input type="text" placeholder="Cliente, categoria..." value={busca} onChange={e => setBusca(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-red-500" />
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-red-950/40 rounded-xl p-4 border border-red-900/50">
          <p className="text-xs text-red-400 mb-1">Total Inadimplente</p>
          <p className="text-xl font-bold text-red-300">{fmt(totalGeral)}</p>
          <p className="text-xs text-red-500 mt-1">{lancamentos.length} títulos</p>
        </div>
        <div className={`rounded-xl p-4 border ${riskBg(30)}`}>
          <p className="text-xs text-yellow-400 mb-1">1–30 dias</p>
          <p className="text-lg font-bold text-yellow-300">{fmt(ate30.reduce((s, l) => s + (l.valor ?? 0), 0))}</p>
          <p className="text-xs text-yellow-600 mt-1">{ate30.length} títulos</p>
        </div>
        <div className={`rounded-xl p-4 border ${riskBg(60)}`}>
          <p className="text-xs text-orange-400 mb-1">31–90 dias</p>
          <p className="text-lg font-bold text-orange-300">{fmt(ate90.reduce((s, l) => s + (l.valor ?? 0), 0))}</p>
          <p className="text-xs text-orange-600 mt-1">{ate90.length} títulos</p>
        </div>
        <div className={`rounded-xl p-4 border ${riskBg(120)}`}>
          <p className="text-xs text-red-400 mb-1">+90 dias (crítico)</p>
          <p className="text-lg font-bold text-red-300">{fmt(acima90.reduce((s, l) => s + (l.valor ?? 0), 0))}</p>
          <p className="text-xs text-red-600 mt-1">{acima90.length} títulos · máx {maisAntigo}d</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Resumo por empresa */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Por Empresa</h3>
          <div className="space-y-3">
            {resumoPorEmpresa.map((e, i) => (
              <div key={i}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-200">{e.nome}</span>
                  <span className={riskColor(e.max_atraso)}>{fmt(e.total)}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{e.qtd} títulos</span>
                  <span>máx {e.max_atraso}d em atraso</span>
                </div>
                <div className="h-1 bg-gray-800 rounded-full mt-1 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${e.max_atraso > 90 ? 'bg-red-700' : e.max_atraso > 30 ? 'bg-orange-700' : 'bg-yellow-700'}`}
                    style={{ width: `${totalGeral > 0 ? Math.round((e.total / totalGeral) * 100) : 0}%` }}
                  />
                </div>
              </div>
            ))}
            {resumoPorEmpresa.length === 0 && <p className="text-xs text-gray-500">Sem inadimplência</p>}
          </div>

          <div className="mt-4 pt-3 border-t border-gray-800">
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Ticket médio</span>
              <span className="text-gray-300">{fmt(mediaValor)}</span>
            </div>
          </div>
        </div>

        {/* Tabela de títulos */}
        <div className="md:col-span-2 bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Títulos em Aberto {busca && `— "${busca}"`}
            </h3>
            <span className="text-xs text-gray-600">{filtrados.length} registros</span>
          </div>
          <div className="overflow-auto max-h-[500px]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-900">
                <tr className="text-gray-500 border-b border-gray-800">
                  <th className="text-left px-4 py-2">Empresa</th>
                  <th className="text-left px-4 py-2">Descrição / Cliente</th>
                  <th className="text-left px-4 py-2">Vencimento</th>
                  <th className="text-right px-3 py-2">Atraso</th>
                  <th className="text-right px-4 py-2">Valor</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((l, i) => (
                  <tr key={i} className="border-b border-gray-800/40 hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-2.5 text-gray-400 whitespace-nowrap">{l.empresa_nome}</td>
                    <td className="px-4 py-2.5 max-w-[200px]">
                      <p className="text-gray-200 truncate">{l.descricao ?? '—'}</p>
                      {l.categoria && <p className="text-gray-600 text-[10px]">{l.categoria}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-gray-400 whitespace-nowrap">{fmtDate(l.data_vencimento)}</td>
                    <td className={`px-3 py-2.5 text-right font-semibold whitespace-nowrap ${riskColor(l.dias_atraso)}`}>
                      {l.dias_atraso}d
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-red-300 whitespace-nowrap">
                      {fmt(l.valor ?? 0)}
                    </td>
                  </tr>
                ))}
                {filtrados.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                      Nenhum título encontrado
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Legenda de risco */}
      <div className="flex gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-600 inline-block" /> 1–30 dias (atenção)</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-600 inline-block" /> 31–90 dias (risco)</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-600 inline-block" /> +90 dias (crítico — avaliar cobrança jurídica)</span>
      </div>
    </div>
  )
}
