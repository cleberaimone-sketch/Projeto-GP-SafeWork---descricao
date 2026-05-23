'use client'

import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell,
} from 'recharts'

interface Serie { nome?: string; unidade?: string; tipo?: string; depto?: string; valores: number[] }

interface Props {
  meses: string[]
  totalMensal: number[]
  porUnidade: Serie[]
  porTipo: Serie[]
  porDepto: Serie[]
}

const fmtMil = (v: number) => `R$ ${(v / 1000).toFixed(0)}k`
const fmtReal = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

const CORES = ['#0d9488', '#0891b2', '#f59e0b', '#8b5cf6', '#ec4899', '#10b981', '#6366f1', '#ef4444', '#64748b']

export default function RhCharts({ meses, totalMensal, porUnidade, porTipo, porDepto }: Props) {
  // Custo total por mês
  const dadosTotal = meses.map((m, i) => ({ mes: m, custo: totalMensal[i] }))

  // Último mês — distribuições
  const ultimo = meses.length - 1
  const dadosUnidade = porUnidade
    .map(u => ({ nome: u.unidade ?? u.nome ?? '', valor: u.valores[ultimo] ?? 0 }))
    .sort((a, b) => b.valor - a.valor)
  const dadosDepto = porDepto.map(d => ({ nome: d.depto ?? d.nome ?? '', valor: d.valores[ultimo] ?? 0 }))

  const tooltipStyle = { backgroundColor: '#0f172a', border: '1px solid #334155', fontSize: 12, borderRadius: 8 }

  return (
    <div className="space-y-6">
      {/* Custo total mensal */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
          Custo de Pessoal — Evolução Mensal
        </h3>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={dadosTotal} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="mes" tick={{ fontSize: 12, fill: '#64748b' }} />
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={fmtMil} />
            <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#cbd5e1' }} formatter={(v) => [fmtReal(Number(v)), 'Custo']} />
            <Line type="monotone" dataKey="custo" stroke="#0d9488" strokeWidth={3} dot={{ r: 5, fill: '#0d9488' }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Por unidade */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Custo por Unidade ({meses[ultimo]})
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={dadosUnidade} layout="vertical" margin={{ top: 0, right: 16, left: 30, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={fmtMil} />
              <YAxis type="category" dataKey="nome" tick={{ fontSize: 11, fill: '#64748b' }} width={90} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [fmtReal(Number(v)), 'Custo']} cursor={{ fill: '#f1f5f9' }} />
              <Bar dataKey="valor" radius={[0, 4, 4, 0]}>
                {dadosUnidade.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Por departamento */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Custo por Departamento ({meses[ultimo]})
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={dadosDepto} margin={{ top: 0, right: 12, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="nome" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={fmtMil} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [fmtReal(Number(v)), 'Custo']} cursor={{ fill: '#f1f5f9' }} />
              <Bar dataKey="valor" radius={[4, 4, 0, 0]}>
                {dadosDepto.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Por tipo de contrato — barras empilhadas por mês */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
          Custo por Tipo de Contrato — por Mês
        </h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart
            data={meses.map((m, i) => {
              const row: Record<string, string | number> = { mes: m }
              for (const t of porTipo) row[t.tipo ?? t.nome ?? ''] = t.valores[i] ?? 0
              return row
            })}
            margin={{ top: 8, right: 12, left: 4, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="mes" tick={{ fontSize: 12, fill: '#64748b' }} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={fmtMil} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmtReal(Number(v))} cursor={{ fill: '#f1f5f9' }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {porTipo.map((t, i) => (
              <Bar key={t.tipo ?? t.nome ?? i} dataKey={t.tipo ?? t.nome ?? ''} stackId="a" fill={CORES[i % CORES.length]} radius={i === porTipo.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
