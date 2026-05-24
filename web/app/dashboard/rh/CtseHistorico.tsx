'use client'

import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell,
} from 'recharts'

interface Props {
  meses: string[]                  // ['Jan','Fev',...,'Dez']
  ctse2025: number[]               // 11 meses (Nov pendente Dez)
  ctse2024: number[]               // 12 meses
}

const fmtMil  = (v: number) => `R$ ${(v / 1000).toFixed(0)}k`
const fmtReal = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const tooltipStyle = { backgroundColor: '#0f172a', border: '1px solid #334155', fontSize: 12, borderRadius: 8 }

export default function CtseHistorico({ meses, ctse2025, ctse2024 }: Props) {
  const dados = meses.map((m, i) => ({
    mes: m,
    '2025': ctse2025[i] ?? null,
    '2024': ctse2024[i] ?? null,
    Diferenca: (ctse2025[i] != null && ctse2024[i] != null) ? ctse2025[i] - ctse2024[i] : 0,
  }))

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Linha — comparativo CTSE 2024 vs 2025 */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm lg:col-span-2">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
          CTSE — Custo Total Salários + Encargos (Planilha RH)
        </h3>
        <p className="text-[10px] text-slate-400 mb-4">Comparativo mês a mês · 2024 vs 2025</p>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={dados} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="mes" tick={{ fontSize: 12, fill: '#64748b' }} />
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={fmtMil} />
            <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#cbd5e1' }} formatter={(v) => v == null ? '—' : fmtReal(Number(v))} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="2024" stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 3" dot={{ r: 3, fill: '#94a3b8' }} />
            <Line type="monotone" dataKey="2025" stroke="#0d9488" strokeWidth={3} dot={{ r: 4, fill: '#0d9488' }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Barras — diferença mensal */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
          Δ Variação 2025 − 2024
        </h3>
        <p className="text-[10px] text-slate-400 mb-4">Negativo = economia · Positivo = aumento</p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={dados} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#64748b' }} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={fmtMil} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmtReal(Number(v))} cursor={{ fill: '#f1f5f9' }} />
            <Bar dataKey="Diferenca" radius={[4, 4, 0, 0]}>
              {dados.map((d, i) => (
                <Cell key={i} fill={d.Diferenca >= 0 ? '#ef4444' : '#10b981'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
