'use client'

import { useState } from 'react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts'

export interface MesData {
  mes: string
  receita: number
  despesa: number
  resultado: number
}

export interface EmpresaData {
  empresa: string
  receita: number
  despesa: number
  resultado: number
}

export interface CatData {
  categoria: string
  valor: number
}

interface Props {
  porMes: MesData[]
  porEmpresa: EmpresaData[]
  topCats: CatData[]
}

const BRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 }).format(v)

const BRLFull = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const PERIODOS = [
  { label: '3 meses', meses: 3 },
  { label: '6 meses', meses: 6 },
  { label: '12 meses', meses: 12 },
  { label: 'Tudo', meses: 0 },
]

const EMPRESA_COLORS = [
  '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6',
  '#ef4444', '#06b6d4', '#f97316', '#84cc16',
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TooltipBRL({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 text-xs shadow-xl">
      <p className="font-semibold text-gray-200 mb-2">{label}</p>
      {payload.map((p: { name: string; value: number; color: string }, i: number) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: {BRLFull(p.value)}
        </p>
      ))}
    </div>
  )
}

export default function FinanceiroCharts({ porMes, porEmpresa, topCats }: Props) {
  const [periodo, setPeriodo] = useState(12)

  const dadosMes = periodo === 0 ? porMes : porMes.slice(-periodo)

  return (
    <div className="space-y-6">
      {/* Filtro de período */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-300">Evolução Mensal</h2>
        <div className="flex gap-1">
          {PERIODOS.map(p => (
            <button
              key={p.meses}
              onClick={() => setPeriodo(p.meses)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                periodo === p.meses
                  ? 'bg-amber-700 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Gráfico de área — Receitas vs Despesas */}
      <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={dadosMes} margin={{ top: 5, right: 5, left: 10, bottom: 5 }}>
            <defs>
              <linearGradient id="gradReceita" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradDespesa" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="mes" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis tickFormatter={BRL} tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} width={70} />
            <Tooltip content={<TooltipBRL />} />
            <Legend
              wrapperStyle={{ fontSize: '12px', color: '#9ca3af', paddingTop: '12px' }}
              formatter={(v) => v === 'receita' ? 'Receitas' : 'Despesas'}
            />
            <Area type="monotone" dataKey="receita" name="receita" stroke="#10b981" fill="url(#gradReceita)" strokeWidth={2} dot={false} />
            <Area type="monotone" dataKey="despesa" name="despesa" stroke="#ef4444" fill="url(#gradDespesa)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Resultado por Empresa */}
      <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
        <h2 className="text-sm font-semibold text-gray-300 mb-4">Resultado por Empresa</h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={porEmpresa} margin={{ top: 5, right: 5, left: 10, bottom: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
            <XAxis
              dataKey="empresa"
              tick={{ fill: '#6b7280', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              angle={-30}
              textAnchor="end"
            />
            <YAxis tickFormatter={BRL} tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} width={70} />
            <Tooltip content={<TooltipBRL />} />
            <Bar dataKey="resultado" name="Resultado" radius={[4, 4, 0, 0]}>
              {porEmpresa.map((e, i) => (
                <Cell key={i} fill={e.resultado >= 0 ? '#10b981' : '#ef4444'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Receitas e Despesas por Empresa */}
      <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
        <h2 className="text-sm font-semibold text-gray-300 mb-4">Receitas × Despesas por Empresa</h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={porEmpresa} margin={{ top: 5, right: 5, left: 10, bottom: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
            <XAxis
              dataKey="empresa"
              tick={{ fill: '#6b7280', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              angle={-30}
              textAnchor="end"
            />
            <YAxis tickFormatter={BRL} tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} width={70} />
            <Tooltip content={<TooltipBRL />} />
            <Legend wrapperStyle={{ fontSize: '12px', color: '#9ca3af', paddingTop: '40px' }} />
            <Bar dataKey="receita" name="Receita" fill="#10b981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="despesa" name="Despesa" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Top Categorias */}
      <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
        <h2 className="text-sm font-semibold text-gray-300 mb-4">Top Categorias de Despesa</h2>
        <div className="space-y-2">
          {topCats.slice(0, 10).map((c, i) => {
            const pct = Math.round((c.valor / (topCats[0]?.valor ?? 1)) * 100)
            return (
              <div key={i}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-300 truncate max-w-[55%]">{c.categoria}</span>
                  <span className="text-gray-400">{BRLFull(c.valor)}</span>
                </div>
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, backgroundColor: EMPRESA_COLORS[i % EMPRESA_COLORS.length] }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
