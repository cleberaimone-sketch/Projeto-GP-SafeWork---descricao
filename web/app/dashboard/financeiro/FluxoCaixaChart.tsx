'use client'

import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'

export interface FluxoMes {
  mes: string
  entradas: number      // receitas pagas/recebidas
  saidas: number        // despesas pagas
  entradas_prev: number // receitas pendentes/a receber
  saidas_prev: number   // despesas a pagar
  saldo: number         // entradas - saidas (realizado)
  saldo_acum: number    // saldo acumulado realizado
}

export interface FluxoBucket {
  label: string         // "0–30d", "31–60d", "61–90d"
  a_receber: number
  a_pagar: number
  saldo_liquido: number
  qtd_receber: number
  qtd_pagar: number
}

interface Props {
  porMes: FluxoMes[]
  buckets90d: FluxoBucket[]
  saldoAtual: number     // saldo bancário atual (Conta Azul)
}

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)

const fmtK = (v: number) => {
  if (Math.abs(v) >= 1_000_000) return `R$${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000) return `R$${(v / 1_000).toFixed(0)}k`
  return fmt(v)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs shadow-xl min-w-[200px]">
      <p className="font-semibold text-white mb-2">{label}</p>
      {payload.map((p: { name: string; value: number; color: string }, i: number) => (
        <div key={i} className="flex justify-between gap-4 mb-1">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-mono text-gray-200">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

export default function FluxoCaixaChart({ porMes, buckets90d, saldoAtual }: Props) {
  const temDados = porMes.some(m => m.entradas > 0 || m.saidas > 0)

  return (
    <div className="space-y-6">
      {/* Gráfico principal — fluxo mensal */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-white">Fluxo de Caixa Mensal</h2>
            <p className="text-xs text-gray-500 mt-0.5">Realizado (sólido) · Projetado — pendente (transparente)</p>
          </div>
          {saldoAtual > 0 && (
            <div className="text-right">
              <p className="text-[10px] text-gray-500">Saldo atual (Conta Azul)</p>
              <p className="text-sm font-semibold text-blue-300">{fmt(saldoAtual)}</p>
            </div>
          )}
        </div>

        {temDados ? (
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={porMes} barGap={2} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
              <XAxis
                dataKey="mes"
                tick={{ fill: '#9CA3AF', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={fmtK}
                tick={{ fill: '#9CA3AF', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={70}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 11, color: '#9CA3AF', paddingTop: 12 }}
              />
              <ReferenceLine y={0} stroke="#4B5563" strokeWidth={1} />

              {/* Barras realizadas */}
              <Bar dataKey="entradas" name="Entradas recebidas" fill="#16a34a" radius={[3, 3, 0, 0]} maxBarSize={40} />
              <Bar dataKey="saidas"   name="Saídas pagas"       fill="#dc2626" radius={[3, 3, 0, 0]} maxBarSize={40} />

              {/* Barras projetadas (pendentes) — opacidade reduzida */}
              <Bar dataKey="entradas_prev" name="A receber (pendente)" fill="#16a34a" fillOpacity={0.25} radius={[3, 3, 0, 0]} maxBarSize={40} />
              <Bar dataKey="saidas_prev"   name="A pagar (pendente)"   fill="#dc2626" fillOpacity={0.25} radius={[3, 3, 0, 0]} maxBarSize={40} />

              {/* Linha do saldo acumulado */}
              <Line
                type="monotone"
                dataKey="saldo_acum"
                name="Saldo acumulado"
                stroke="#60a5fa"
                strokeWidth={2}
                dot={{ fill: '#60a5fa', r: 3, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-48 flex items-center justify-center text-gray-500 text-sm">
            Nenhum dado de fluxo para exibir no período selecionado
          </div>
        )}
      </div>

      {/* Previsão próximos 90 dias */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
        <h2 className="text-sm font-semibold text-white mb-1">Previsão — Próximos 90 Dias</h2>
        <p className="text-xs text-gray-500 mb-4">Lançamentos pendentes e vencidos agrupados por prazo</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {buckets90d.map((b, i) => (
            <div key={i} className={`rounded-xl border p-4 ${b.saldo_liquido >= 0 ? 'border-green-900/50 bg-green-950/20' : 'border-red-900/50 bg-red-950/20'}`}>
              <p className="text-xs font-semibold text-gray-400 mb-3">{b.label}</p>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-green-400">A receber</span>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-green-300">{fmt(b.a_receber)}</p>
                    <p className="text-[10px] text-gray-600">{b.qtd_receber} títulos</p>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-red-400">A pagar</span>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-red-300">{fmt(b.a_pagar)}</p>
                    <p className="text-[10px] text-gray-600">{b.qtd_pagar} títulos</p>
                  </div>
                </div>
                <div className="h-px bg-gray-700 my-1" />
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">Saldo líquido</span>
                  <p className={`text-sm font-bold ${b.saldo_liquido >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                    {b.saldo_liquido >= 0 ? '+' : ''}{fmt(b.saldo_liquido)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {buckets90d.length === 0 && (
          <p className="text-xs text-gray-500">Nenhum lançamento pendente nos próximos 90 dias</p>
        )}
      </div>
    </div>
  )
}
