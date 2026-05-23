'use client'

import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell,
} from 'recharts'

interface Serie { tipo?: string; depto?: string; valores: number[] }

interface Props {
  meses: string[]
  internoMensal: number[]
  externoMensal: number[]
  internoAnoAnterior?: number[]   // mesma janela do ano anterior (YoY)
  anoAtual: number
  porTipo: Serie[]
  porDepto: Serie[]
}

const fmtMil = (v: number) => `R$ ${(v / 1000).toFixed(0)}k`
const fmtReal = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const CORES = ['#0d9488', '#0891b2', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b', '#10b981', '#6366f1']
const tooltipStyle = { backgroundColor: '#0f172a', border: '1px solid #334155', fontSize: 12, borderRadius: 8 }

export default function RhCharts({ meses, internoMensal, externoMensal, internoAnoAnterior, anoAtual, porTipo, porDepto }: Props) {
  const ultimo = meses.length - 1

  // Evolução mensal: interno vs externo (+ YoY interno)
  const dadosEvolucao = meses.map((m, i) => ({
    mes: m,
    Interno: internoMensal[i] ?? 0,
    Externo: externoMensal[i] ?? 0,
    [`Interno ${anoAtual - 1}`]: internoAnoAnterior?.[i] ?? null,
  }))

  const dadosDepto = porDepto
    .map(d => ({ nome: d.depto ?? '', valor: d.valores[ultimo] ?? 0 }))
    .sort((a, b) => b.valor - a.valor)

  return (
    <div className="space-y-6">
      {/* Evolução mensal interno vs externo */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
          Custo de Pessoal — Evolução Mensal {anoAtual}
        </h3>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={dadosEvolucao} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="mes" tick={{ fontSize: 12, fill: '#64748b' }} />
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={fmtMil} />
            <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#cbd5e1' }} formatter={(v) => fmtReal(Number(v))} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="Interno" stroke="#0d9488" strokeWidth={3} dot={{ r: 4, fill: '#0d9488' }} />
            <Line type="monotone" dataKey="Externo" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 4, fill: '#f59e0b' }} />
            {internoAnoAnterior && internoAnoAnterior.some(v => v > 0) && (
              <Line type="monotone" dataKey={`Interno ${anoAtual - 1}`} stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 4" dot={false} />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Interno por tipo de contrato — empilhado por mês */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Folha Interna por Tipo de Contrato
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={meses.map((m, i) => {
                const row: Record<string, string | number> = { mes: m }
                for (const t of porTipo) row[t.tipo ?? ''] = t.valores[i] ?? 0
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
                <Bar key={t.tipo ?? i} dataKey={t.tipo ?? ''} stackId="a" fill={CORES[i % CORES.length]} radius={i === porTipo.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Interno por departamento — último mês */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Folha Interna por Departamento ({meses[ultimo]})
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={dadosDepto} layout="vertical" margin={{ top: 0, right: 16, left: 24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={fmtMil} />
              <YAxis type="category" dataKey="nome" tick={{ fontSize: 11, fill: '#64748b' }} width={96} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [fmtReal(Number(v)), 'Custo']} cursor={{ fill: '#f1f5f9' }} />
              <Bar dataKey="valor" radius={[0, 4, 4, 0]}>
                {dadosDepto.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
