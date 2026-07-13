'use client'

import { useMemo, useState } from 'react'
import type { CobrancaItem, ResumoCobranca } from '@/lib/financeiro/conciliacao'

function fmt(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
}
function fmtData(iso: string): string {
  if (!iso) return '—'
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a.slice(2)}`
}

interface Props {
  tabelaPronta: boolean
  cobrancas: CobrancaItem[]
  resumo: ResumoCobranca
}

const LIMIARES = [
  { id: 0,   label: 'Todas' },
  { id: 10,  label: '> R$ 10' },
  { id: 50,  label: '> R$ 50' },
  { id: 200, label: '> R$ 200' },
]

export default function CobradoRecebido({ tabelaPronta, cobrancas, resumo }: Props) {
  const [limiar, setLimiar] = useState(0)
  const [conta, setConta] = useState('')
  const [busca, setBusca] = useState('')

  const contas = useMemo(() => Array.from(new Set(cobrancas.map(c => c.conta_nome))).sort(), [cobrancas])

  const lista = useMemo(() => {
    let arr = cobrancas
    if (limiar > 0) arr = arr.filter(c => Math.abs(c.diferenca) >= limiar)
    if (conta) arr = arr.filter(c => c.conta_nome === conta)
    if (busca.trim()) {
      const q = busca.toLowerCase()
      arr = arr.filter(c => c.descricao.toLowerCase().includes(q) || c.categoria.toLowerCase().includes(q))
    }
    return arr
  }, [cobrancas, limiar, conta, busca])

  if (!tabelaPronta) {
    return (
      <div className="bg-white rounded-xl border border-amber-200 p-6">
        <h2 className="text-sm font-semibold text-amber-800 mb-2">⚠️ Falta ativar o extrato</h2>
        <p className="text-sm text-slate-600">
          Aplique a migration <code className="text-xs bg-slate-100 px-1 rounded">20260713150000_extrato_bancario.sql</code> no SQL Editor e importe o XLS do Conta Azul acima.
        </p>
      </div>
    )
  }

  if (cobrancas.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-slate-800 mb-2">Nenhuma cobrança com diferença ainda</h2>
        <p className="text-sm text-slate-600">
          Importe o <strong>XLS do Conta Azul</strong> (botão “Importar extrato” acima). Ele traz o valor cobrado × o recebido, e aqui aparece cada boleto que entrou a menor (taxa, desconto ou rombo).
        </p>
      </div>
    )
  }

  const pctPerda = resumo.totalCobrado > 0 ? (resumo.totalDiferenca / resumo.totalCobrado) * 100 : 0

  return (
    <>
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Cobrado</p>
          <p className="text-lg font-bold text-slate-800 tabular-nums mt-1">{fmt(resumo.totalCobrado)}</p>
          <p className="text-[10px] text-slate-500 mt-1">{resumo.qtd} boletos com diferença</p>
        </div>
        <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4">
          <p className="text-[10px] text-emerald-800 uppercase tracking-wider font-semibold">Recebido</p>
          <p className="text-lg font-bold text-emerald-700 tabular-nums mt-1">{fmt(resumo.totalRecebido)}</p>
        </div>
        <div className="bg-red-50 rounded-xl border border-red-200 p-4">
          <p className="text-[10px] text-red-800 uppercase tracking-wider font-semibold">Diferença (entrou a menos)</p>
          <p className="text-lg font-bold text-red-700 tabular-nums mt-1">{fmt(resumo.totalDiferenca)}</p>
          <p className="text-[10px] text-slate-500 mt-1">{pctPerda.toFixed(1)}% do cobrado</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Sendo taxa / desconto</p>
          <p className="text-sm font-bold text-slate-700 tabular-nums mt-1">{fmt(resumo.totalTaxa)} <span className="text-[10px] font-normal text-slate-400">taxa</span></p>
          <p className="text-sm font-bold text-slate-700 tabular-nums">{fmt(resumo.totalDesconto)} <span className="text-[10px] font-normal text-slate-400">desconto</span></p>
        </div>
      </div>

      <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mb-3">
        Cada linha é um valor <strong>cobrado</strong> no boleto que entrou a <strong>menos</strong>. Diferença pequena e recorrente = tarifa/imposto normal; diferença grande ou sem taxa correspondente = <strong>rever</strong> (pode ser o rombo). Use os filtros para separar.
      </p>

      {/* Filtros */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="inline-flex bg-white border border-slate-200 rounded-lg overflow-hidden">
          {LIMIARES.map(l => (
            <button
              key={l.id}
              onClick={() => setLimiar(l.id)}
              className={`px-3 py-1.5 text-xs ${limiar === l.id ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {l.label}
            </button>
          ))}
        </div>
        {contas.length > 1 && (
          <select value={conta} onChange={e => setConta(e.target.value)} className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800">
            <option value="">Todas as contas</option>
            {contas.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <input
          type="text"
          placeholder="Buscar cliente/categoria…"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          className="flex-1 min-w-[180px] bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400"
        />
        <span className="text-[10px] text-slate-500">{lista.length} de {cobrancas.length}</span>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50/80">
              <tr>
                <th className="text-left  px-4 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Data</th>
                <th className="text-left  px-4 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Conta</th>
                <th className="text-left  px-4 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Cliente / descrição</th>
                <th className="text-right px-4 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Cobrado</th>
                <th className="text-right px-4 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Recebido</th>
                <th className="text-right px-4 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Diferença</th>
                <th className="text-right px-4 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Taxa/Desc.</th>
              </tr>
            </thead>
            <tbody>
              {lista.map(c => {
                const explicada = Math.abs(Math.abs(c.taxa) + Math.abs(c.desconto) - c.diferenca) < 0.01
                return (
                  <tr key={c.id} className="border-t border-slate-200/70 hover:bg-slate-100/30">
                    <td className="px-4 py-2 text-slate-600 tabular-nums whitespace-nowrap">{fmtData(c.data)}</td>
                    <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{c.conta_nome}</td>
                    <td className="px-4 py-2 text-slate-800 max-w-[280px] truncate" title={`${c.descricao}${c.categoria ? ' · ' + c.categoria : ''}`}>{c.descricao || '—'}</td>
                    <td className="px-4 py-2 text-right text-slate-700 tabular-nums whitespace-nowrap">{fmt(c.cobrado)}</td>
                    <td className="px-4 py-2 text-right text-emerald-700 tabular-nums whitespace-nowrap">{fmt(c.recebido)}</td>
                    <td className="px-4 py-2 text-right font-semibold text-red-700 tabular-nums whitespace-nowrap">−{fmt(c.diferenca)}</td>
                    <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">
                      {explicada
                        ? <span className="text-slate-500" title="Diferença explicada por taxa/desconto">{fmt(Math.abs(c.taxa) + Math.abs(c.desconto))}</span>
                        : <span className="text-amber-700 font-medium" title="Taxa/desconto não cobre a diferença — revisar">⚠ {fmt(Math.abs(c.taxa) + Math.abs(c.desconto))}</span>}
                    </td>
                  </tr>
                )
              })}
              {lista.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Nenhuma cobrança neste filtro</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
