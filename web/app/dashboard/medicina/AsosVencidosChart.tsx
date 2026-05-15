'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell,
} from 'recharts'

export interface EmpresaAsosData {
  empresa: string
  expirados: number
  expirando: number
}

interface Props {
  dados: EmpresaAsosData[]
}

const shortName = (s: string) =>
  s.length > 22 ? s.slice(0, 20) + '…' : s

export default function AsosVencidosChart({ dados }: Props) {
  if (dados.length === 0) {
    return (
      <div className="bg-slate-900 rounded-xl p-5 border border-slate-800 text-center">
        <p className="text-xs text-slate-500 py-6">
          Nenhum ASO vencido ou a vencer encontrado
        </p>
      </div>
    )
  }

  const chartData = dados.map(d => ({
    ...d,
    empresaCurta: shortName(d.empresa),
  }))

  const total = dados.reduce((s, d) => s + d.expirados + d.expirando, 0)

  return (
    <div className="bg-slate-900 rounded-xl p-5 border border-slate-800">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          ASOs Vencidos / A Vencer por Empresa
        </h3>
        <span className="text-xs text-red-400 font-medium">{total} trabalhadores</span>
      </div>
      <p className="text-[10px] text-slate-600 mb-4">
        Vencido = sem ASO nos últimos 12 meses · A vencer = ASO entre 10–12 meses
      </p>

      <ResponsiveContainer width="100%" height={Math.max(180, dados.length * 36)}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }} allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="empresaCurta"
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            width={160}
          />
          <Tooltip
            contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', fontSize: 11, borderRadius: 8 }}
            labelStyle={{ color: '#d1d5db' }}
            formatter={(value: number, name: string) => [
              value,
              name === 'expirados' ? 'Vencidos' : 'A vencer (< 60 dias)',
            ]}
          />
          <Legend
            wrapperStyle={{ fontSize: 10, paddingTop: 8 }}
            formatter={(value) => value === 'expirados' ? 'Vencidos' : 'A vencer'}
          />
          <Bar dataKey="expirados" name="expirados" stackId="a" fill="#ef4444" radius={[0, 2, 2, 0]} />
          <Bar dataKey="expirando" name="expirando" stackId="a" fill="#f59e0b" radius={[0, 2, 2, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
