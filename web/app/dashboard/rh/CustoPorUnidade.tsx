'use client'

// Gasto com um tipo de profissional, unidade por unidade.
//
// O painel acima mostra cada profissional no grupo inteiro, e a decisão é por
// unidade: em 2026 a Medianeira gasta ~R$ 10.500/mês com médico enquanto Santa
// Helena caiu de R$ 6.775 em março para R$ 1.525 em agosto. No consolidado as
// duas curvas se anulam e nenhuma aparece.

import { useState } from 'react'
import {
  ResponsiveContainer, ComposedChart, Bar, XAxis, YAxis,
  Tooltip, ReferenceLine, Cell,
} from 'recharts'

export type SerieUnidade = { unidade: string; valores: number[] }
export type TipoClinico = 'medicos' | 'clinicas' | 'fono' | 'instrutores'

export const ROTULO_TIPO: Record<TipoClinico, string> = {
  medicos: 'Médicos',
  clinicas: 'Clínicas parceiras',
  fono: 'Fono / Psicologia',
  instrutores: 'Instrutores',
}

const COR: Record<TipoClinico, string> = {
  medicos: '#8b5cf6',
  clinicas: '#0ea5e9',
  fono: '#ec4899',
  instrutores: '#10b981',
}

const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)

const tooltipStyle = {
  backgroundColor: '#fff', border: '1px solid #e2e8f0',
  fontSize: 12, borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
}

function tendencia(valores: number[], mesesFechados: number): number | null {
  const f = valores.slice(0, mesesFechados)
  if (f.length < 6) return null
  const ult3 = f.slice(-3).reduce((s, v) => s + v, 0)
  const ant3 = f.slice(-6, -3).reduce((s, v) => s + v, 0)
  if (ant3 <= 0) return null
  return ((ult3 - ant3) / ant3) * 100
}

export default function CustoPorUnidade({ meses, porTipo, mesesFechados }: {
  meses: string[]
  porTipo: Record<TipoClinico, SerieUnidade[]>
  mesesFechados: number
}) {
  const disponiveis = (Object.keys(porTipo) as TipoClinico[]).filter(t => porTipo[t]?.length)
  const [tipo, setTipo] = useState<TipoClinico>(disponiveis[0] ?? 'medicos')
  const series = porTipo[tipo] ?? []
  if (series.length === 0) return null

  const totalDe = (s: SerieUnidade) => s.valores.slice(0, mesesFechados).reduce((a, b) => a + b, 0)
  const ordenadas = [...series].sort((a, b) => totalDe(b) - totalDe(a))
  const totalGeral = ordenadas.reduce((s, u) => s + totalDe(u), 0)

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-1">
        <h2 className="font-bold text-slate-800">{ROTULO_TIPO[tipo]} — por unidade</h2>
        <div className="flex gap-1">
          {disponiveis.map(t => (
            <button key={t} onClick={() => setTipo(t)}
              className={`px-2.5 py-1 text-[11px] rounded-lg transition-colors ${
                t === tipo ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {ROTULO_TIPO[t]}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-slate-500 mb-4">
        {brl(totalGeral)} em {mesesFechados} {mesesFechados === 1 ? 'mês fechado' : 'meses fechados'} ·
        a linha tracejada é a média da unidade
        {mesesFechados < meses.length && ' · barra clara é vencimento futuro já lançado'}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {ordenadas.map(u => {
          const total = totalDe(u)
          const media = mesesFechados > 0 ? total / mesesFechados : 0
          const t = tendencia(u.valores, mesesFechados)
          const dados = meses.map((mes, i) => ({
            mes,
            fechado:  i < mesesFechados ? (u.valores[i] ?? 0) : 0,
            previsto: i >= mesesFechados ? (u.valores[i] ?? 0) : 0,
          }))
          return (
            <div key={u.unidade} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <p className="text-[11px] font-semibold text-slate-700 truncate" title={u.unidade}>
                  {u.unidade}
                </p>
                <span className="text-[10px] text-slate-400 shrink-0">
                  {totalGeral > 0 ? `${((total / totalGeral) * 100).toFixed(0)}%` : ''}
                </span>
              </div>
              <div className="flex items-baseline gap-3">
                <div>
                  <p className="text-base font-bold text-slate-800 tabular-nums leading-none">{brl(total)}</p>
                  <p className="text-[9px] text-slate-400 mt-0.5">acumulado</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-600 tabular-nums leading-none">{brl(media)}</p>
                  <p className="text-[9px] text-slate-400 mt-0.5">média/mês</p>
                </div>
              </div>
              {t !== null && (
                <p className={`text-[10px] font-medium mt-1 ${
                  t > 5 ? 'text-red-700' : t < -5 ? 'text-emerald-700' : 'text-slate-500'}`}>
                  {t >= 0 ? '▲' : '▼'} {Math.abs(t).toFixed(0)}% no trimestre
                </p>
              )}
              <ResponsiveContainer width="100%" height={80}>
                <ComposedChart data={dados} margin={{ top: 6, right: 2, left: 2, bottom: 0 }}>
                  <XAxis dataKey="mes" tick={{ fontSize: 8, fill: '#94a3b8' }}
                         axisLine={false} tickLine={false} interval={0} />
                  <YAxis hide />
                  <Tooltip contentStyle={tooltipStyle}
                           formatter={(v) => [brl(Number(v)), u.unidade]}
                           labelFormatter={(l) => `${l}${meses.indexOf(String(l)) >= mesesFechados ? ' (só o lançado)' : ''}`} />
                  <ReferenceLine y={media} stroke="#94a3b8" strokeDasharray="3 3" />
                  <Bar dataKey="fechado" stackId="s" fill={COR[tipo]} radius={[2, 2, 0, 0]} />
                  <Bar dataKey="previsto" stackId="s" fill={COR[tipo]} fillOpacity={0.28} radius={[2, 2, 0, 0]}>
                    {dados.map((_, j) => <Cell key={j} />)}
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )
        })}
      </div>
    </div>
  )
}
