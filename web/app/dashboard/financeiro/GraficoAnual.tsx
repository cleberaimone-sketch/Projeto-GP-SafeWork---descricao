'use client'

import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

export interface GraficoAnualMes {
  mes: string        // 'jan', 'fev', ...
  total: number      // valor com vencimento no mês
  pago: number       // valor já pago referente ao mês
  acumulado: number  // total acumulado do ano até o mês
}

interface Props {
  titulo: string
  meses: GraficoAnualMes[]
  ano: number
  corTotal?: string
  corPago?: string
}

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)

const fmtK = (v: number) => {
  if (Math.abs(v) >= 1_000_000) return `R$${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000) return `R$${(v / 1_000).toFixed(0)}k`
  return `R$${v.toFixed(0)}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-300 rounded-lg p-3 text-xs shadow-xl min-w-[200px]">
      <p className="font-semibold text-slate-900 mb-2">{label}</p>
      {payload.map((p: { name: string; value: number; color: string }, i: number) => (
        <div key={i} className="flex justify-between gap-4 mb-1">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-mono text-slate-800">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

function Kpi({ label, value, sub, tone }: { label: string; value: number; sub?: string; tone: 'slate' | 'emerald' | 'blue' | 'amber' }) {
  const cor = {
    slate: 'text-slate-900', emerald: 'text-emerald-700', blue: 'text-blue-700', amber: 'text-amber-700',
  }[tone]
  return (
    <div className="px-4 py-3 bg-slate-50 rounded-lg border border-slate-200">
      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">{label}</p>
      <p className={`text-lg font-bold tabular-nums mt-0.5 ${cor}`}>{fmt(value)}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function GraficoAnual({ titulo, meses, ano, corTotal = '#3b82f6', corPago = '#10b981' }: Props) {
  const totalAno   = meses.reduce((s, m) => s + m.total, 0)
  const totalPago  = meses.reduce((s, m) => s + m.pago, 0)
  const comDados   = meses.filter(m => m.total > 0).length || 1
  const media      = totalAno / 12
  const mediaAtiva = totalAno / comDados
  const pctPago    = totalAno > 0 ? (totalPago / totalAno) * 100 : 0

  return (
    <div className="bg-white rounded-xl border border-slate-200 mb-6 shadow-sm">
      {/* Cabeçalho + KPIs */}
      <div className="p-5 border-b border-slate-200">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <h3 className="text-sm font-bold text-slate-800">{titulo}</h3>
          <span className="text-xs text-slate-500 font-medium">Ano {ano}</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
          <Kpi label="Valor total do ano" value={totalAno} tone="slate" sub={`${comDados} ${comDados === 1 ? 'mês' : 'meses'} com movimento`} />
          <Kpi label="Total pago" value={totalPago} tone="emerald" sub={`${pctPago.toFixed(0)}% do total`} />
          <Kpi label="A pagar / em aberto" value={totalAno - totalPago} tone="amber" sub={`${(100 - pctPago).toFixed(0)}% do total`} />
          <Kpi label="Média mensal" value={media} tone="blue" sub={`${fmt(mediaAtiva)} nos meses ativos`} />
        </div>
      </div>

      {/* Gráfico: barras por mês (total + pago) + linha do acumulado */}
      <div className="p-4" style={{ height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={meses} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} />
            <YAxis tickFormatter={fmtK} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={56} />
            <YAxis yAxisId="acum" orientation="right" tickFormatter={fmtK} tick={{ fontSize: 10, fill: '#f59e0b' }} axisLine={false} tickLine={false} width={56} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="total" name="Valor do mês" fill={corTotal} radius={[3, 3, 0, 0]} maxBarSize={34} />
            <Bar dataKey="pago"  name="Pago"          fill={corPago}  radius={[3, 3, 0, 0]} maxBarSize={34} />
            <Line yAxisId="acum" type="monotone" dataKey="acumulado" name="Saldo devedor (acum.)" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
