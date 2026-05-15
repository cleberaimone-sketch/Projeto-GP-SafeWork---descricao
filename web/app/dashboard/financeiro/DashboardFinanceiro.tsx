'use client'

import { Fragment, useState } from 'react'
import {
  ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, ReferenceLine, Area, AreaChart,
  LineChart, Legend,
} from 'recharts'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KpiData {
  receita: number; receitaDelta: number; receitaSpark: number[]
  despesa: number; despesaDelta: number; despesaSpark: number[]
  ebitda: number; ebitdaDelta: number; ebitdaSpark: number[]
  margemEbitda: number
  caixa: number
  inadimplencia: number; inadimplenciaPct: number
  dso: number | null
  runway: number | null
}

export interface WaterfallItem {
  name: string; spacer: number; value: number; tipo: string
}

export interface AgingItem {
  label: string; valor: number; qtd: number; diasMin: number
}

export interface TrendMes {
  mes: string; receita: number; despesa: number; ebitda: number
}

export interface EmpresaBar {
  empresa: string; receita: number; despesa: number; margem: number
}

export interface Props {
  kpi: KpiData
  waterfall: WaterfallItem[]
  aging: AgingItem[]
  trend12: TrendMes[]
  porEmpresa: EmpresaBar[]
  // cash flow (already typed in FluxoCaixaChart)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  porFluxoMes: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buckets90d: any[]
  saldoAtual: number
  empresas: { id: string; nome_curto: string }[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  saldosBancarios: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialMessages: any[]
  filtroAtivo: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt  = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
const fmtK = (v: number) => Math.abs(v) >= 1e6 ? `R$${(v/1e6).toFixed(1)}M` : Math.abs(v) >= 1e3 ? `R$${(v/1e3).toFixed(0)}k` : fmt(v)
const fmtPct = (v: number, decimals = 1) => (v >= 0 ? '+' : '') + v.toFixed(decimals) + '%'
const fmtDelta = (v: number) => (v >= 0 ? '▲' : '▼') + ' ' + Math.abs(v).toFixed(1) + '%'

// ─── Sparkline ────────────────────────────────────────────────────────────────

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data.length) return null
  const pts = data.map((v, i) => ({ i, v }))
  return (
    <ResponsiveContainer width="100%" height={36}>
      <AreaChart data={pts} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`sg-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5}
          fill={`url(#sg-${color.replace('#','')})`} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, valor, delta, spark, sparkColor, prefix = '', suffix = '',
  deltaInverted = false, href,
}: {
  label: string; valor: string; delta?: number; spark?: number[]
  sparkColor?: string; prefix?: string; suffix?: string
  deltaInverted?: boolean; href?: string
}) {
  const isPositive = delta !== undefined ? (deltaInverted ? delta <= 0 : delta >= 0) : null
  const content = (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 flex flex-col gap-1 hover:border-gray-700 transition-colors h-full">
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className="text-xl font-bold text-white tracking-tight">
        {prefix}{valor}{suffix}
      </p>
      {delta !== undefined && (
        <p className={`text-xs font-medium ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
          {fmtDelta(delta)} vs mês anterior
        </p>
      )}
      {spark && spark.length > 1 && (
        <div className="mt-auto pt-1">
          <Sparkline data={spark} color={sparkColor ?? '#6b7280'} />
        </div>
      )}
    </div>
  )
  return href ? <a href={href}>{content}</a> : content
}

// ─── Waterfall Tooltip ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function WaterfallTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const entry = payload.find((p: { dataKey: string }) => p.dataKey === 'value')
  if (!entry) return null
  const tipo = payload[0]?.payload?.tipo ?? ''
  const isNeg = tipo === 'negativo' || tipo === 'resultado_neg'
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs shadow-xl">
      <p className="font-semibold text-white mb-1">{label}</p>
      <p className={isNeg ? 'text-red-300' : 'text-green-300'}>
        {isNeg ? '-' : ''}{fmt(entry.value)}
      </p>
    </div>
  )
}

// ─── Trend Tooltip ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TrendTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs shadow-xl min-w-[180px]">
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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DashboardFinanceiro({
  kpi, waterfall, aging, trend12, porEmpresa,
  porFluxoMes, buckets90d, saldoAtual,
  saldosBancarios, initialMessages, filtroAtivo,
}: Props) {
  const [chatOpen, setChatOpen] = useState(false)

  // ── Lazy import de componentes externos ──
  // (evitar import circular — FluxoCaixaChart, PlataChat, SyncButton são importados no page.tsx)

  return (
    <div className="space-y-6">

      {/* ── KPI Scorecard ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          label="Receita do Período"
          valor={fmtK(kpi.receita)}
          delta={kpi.receitaDelta}
          spark={kpi.receitaSpark}
          sparkColor="#16a34a"
        />
        <KpiCard
          label="Despesas do Período"
          valor={fmtK(kpi.despesa)}
          delta={kpi.despesaDelta}
          spark={kpi.despesaSpark}
          sparkColor="#dc2626"
          deltaInverted
        />
        <KpiCard
          label="EBITDA"
          valor={fmtK(kpi.ebitda)}
          delta={kpi.ebitdaDelta}
          spark={kpi.ebitdaSpark}
          sparkColor={kpi.ebitda >= 0 ? '#f59e0b' : '#ef4444'}
        />
        <KpiCard
          label="Margem EBITDA"
          valor={kpi.margemEbitda.toFixed(1)}
          suffix="%"
          spark={kpi.ebitdaSpark.map((v, i) => {
            const r = kpi.receitaSpark[i] ?? 1
            return r > 0 ? (v / r) * 100 : 0
          })}
          sparkColor={kpi.margemEbitda >= 15 ? '#f59e0b' : '#ef4444'}
        />
        <KpiCard
          label="Inadimplência"
          valor={fmtK(kpi.inadimplencia)}
          suffix={kpi.inadimplenciaPct > 0 ? `  (${kpi.inadimplenciaPct.toFixed(1)}%)` : ''}
          sparkColor="#dc2626"
          href="/dashboard/financeiro/inadimplentes"
          deltaInverted
        />
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 flex flex-col gap-1">
          <p className="text-xs text-gray-500 font-medium">Caixa (Conta Azul)</p>
          <p className="text-xl font-bold text-blue-300 tracking-tight">{fmtK(kpi.caixa)}</p>
          {kpi.runway !== null && (
            <p className={`text-xs font-medium ${kpi.runway >= 3 ? 'text-green-400' : kpi.runway >= 1.5 ? 'text-amber-400' : 'text-red-400'}`}>
              {kpi.runway.toFixed(1)} meses de runway
            </p>
          )}
          {kpi.dso !== null && (
            <p className="text-xs text-gray-600 mt-auto">DSO: {kpi.dso}d prazo médio receb.</p>
          )}
        </div>
      </div>

      {/* ── Waterfall EBITDA + Trend 12 meses ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* Waterfall */}
        <div className="lg:col-span-2 bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-white">Composição do EBITDA</h2>
            <p className="text-xs text-gray-500 mt-0.5">Da receita bruta ao resultado operacional</p>
          </div>
          {waterfall.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={waterfall} barCategoryGap="20%" margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#9CA3AF', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmtK} tick={{ fill: '#9CA3AF', fontSize: 10 }} axisLine={false} tickLine={false} width={65} />
                <Tooltip content={<WaterfallTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <ReferenceLine y={0} stroke="#374151" strokeWidth={1} />
                {/* Spacer transparente — cria o "float" do waterfall */}
                <Bar dataKey="spacer" stackId="wf" fill="transparent" isAnimationActive={false} legendType="none" />
                {/* Barra colorida */}
                <Bar dataKey="value" stackId="wf" radius={[3, 3, 0, 0]} maxBarSize={48}>
                  {waterfall.map((e, i) => (
                    <Cell key={i} fill={
                      e.tipo === 'inicio'         ? '#16a34a'
                      : e.tipo === 'subtotal'     ? '#4b5563'
                      : e.tipo === 'negativo'     ? '#dc2626'
                      : e.tipo === 'resultado'    ? '#f59e0b'
                      : e.tipo === 'resultado_neg'? '#dc2626'
                      : '#6b7280'
                    } />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-500 text-sm">Sem dados</div>
          )}
          {/* Legenda */}
          <div className="flex gap-3 mt-2 flex-wrap">
            {[
              { color: '#16a34a', label: 'Receita' },
              { color: '#dc2626', label: 'Deduções' },
              { color: '#4b5563', label: 'Subtotais' },
              { color: '#f59e0b', label: 'EBITDA' },
            ].map(l => (
              <span key={l.label} className="flex items-center gap-1 text-[10px] text-gray-500">
                <span className="w-2 h-2 rounded-sm inline-block" style={{ background: l.color }} />
                {l.label}
              </span>
            ))}
          </div>
        </div>

        {/* Trend 12 meses */}
        <div className="lg:col-span-3 bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-white">Tendência 12 Meses</h2>
              <p className="text-xs text-gray-500 mt-0.5">Receita, Despesas e EBITDA</p>
            </div>
          </div>
          {trend12.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={trend12} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                <XAxis dataKey="mes" tick={{ fill: '#9CA3AF', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmtK} tick={{ fill: '#9CA3AF', fontSize: 10 }} axisLine={false} tickLine={false} width={65} />
                <Tooltip content={<TrendTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <ReferenceLine y={0} stroke="#374151" strokeWidth={1} />
                <Bar dataKey="receita"  name="Receita"  fill="#16a34a" fillOpacity={0.8} radius={[2,2,0,0]} maxBarSize={20} />
                <Bar dataKey="despesa"  name="Despesas" fill="#dc2626" fillOpacity={0.8} radius={[2,2,0,0]} maxBarSize={20} />
                <Line type="monotone" dataKey="ebitda" name="EBITDA" stroke="#f59e0b" strokeWidth={2.5}
                  dot={{ fill: '#f59e0b', r: 3, strokeWidth: 0 }} activeDot={{ r: 5 }} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-500 text-sm">Sem dados</div>
          )}
        </div>
      </div>

      {/* ── A/R Aging + Revenue por Empresa ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* A/R Aging */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-white">Aging de Recebíveis (A/R)</h2>
              <p className="text-xs text-gray-500 mt-0.5">Títulos em aberto por faixa de vencimento</p>
            </div>
            <a href="/dashboard/financeiro/inadimplentes"
              className="text-xs text-amber-400 hover:text-amber-300 transition-colors">
              Ver todos →
            </a>
          </div>
          <div className="space-y-3">
            {aging.map((b, i) => {
              const maxValor = Math.max(...aging.map(a => a.valor), 1)
              const pct = (b.valor / maxValor) * 100
              const cor = b.diasMin === 0 ? '#3b82f6'
                : b.diasMin <= 30 ? '#eab308'
                : b.diasMin <= 60 ? '#f97316'
                : '#ef4444'
              return (
                <div key={i}>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-gray-400">{b.label}</span>
                    <div className="flex gap-3 items-center">
                      <span className="text-gray-600">{b.qtd} títulos</span>
                      <span className="font-semibold text-white font-mono">{fmt(b.valor)}</span>
                    </div>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: cor }} />
                  </div>
                </div>
              )
            })}
            {aging.every(b => b.valor === 0) && (
              <p className="text-xs text-green-400 py-4 text-center">✅ Nenhum recebível em aberto</p>
            )}
          </div>
        </div>

        {/* Revenue por Empresa */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-white">Resultado por Empresa</h2>
            <p className="text-xs text-gray-500 mt-0.5">Receita vs Despesas — margem de contribuição</p>
          </div>
          {porEmpresa.length > 0 ? (
            <div className="space-y-3">
              {porEmpresa.slice(0, 8).map((e, i) => {
                const margemCor = e.margem >= 20 ? '#16a34a' : e.margem >= 0 ? '#f59e0b' : '#dc2626'
                const maxRec = Math.max(...porEmpresa.map(x => x.receita), 1)
                return (
                  <div key={i}>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-gray-300 font-medium truncate max-w-[120px]">{e.empresa}</span>
                      <div className="flex gap-3 items-center">
                        <span className="text-green-400 font-mono">{fmtK(e.receita)}</span>
                        <span className="font-semibold" style={{ color: margemCor }}>
                          {e.margem >= 0 ? '+' : ''}{e.margem.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <div className="relative h-2 bg-gray-800 rounded-full overflow-hidden">
                      {/* Barra de receita */}
                      <div className="absolute h-full bg-green-800 rounded-full" style={{ width: `${(e.receita / maxRec) * 100}%` }} />
                      {/* Barra de despesa */}
                      <div className="absolute h-full bg-red-900 rounded-full opacity-70" style={{ width: `${(e.despesa / maxRec) * 100}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center text-gray-500 text-sm">Sem dados</div>
          )}
          <div className="flex gap-3 mt-3 text-[10px] text-gray-600">
            <span className="flex items-center gap-1"><span className="w-2 h-1.5 rounded-sm bg-green-800 inline-block" /> Receita</span>
            <span className="flex items-center gap-1"><span className="w-2 h-1.5 rounded-sm bg-red-900 inline-block" /> Despesas</span>
          </div>
        </div>
      </div>

      {/* ── Saldos Bancários ────────────────────────────────────────────────── */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Saldos Bancários</h2>
            <p className="text-xs text-gray-500">Via Conta Azul — apenas contas cadastradas</p>
          </div>
          <span className="text-[10px] text-amber-600 bg-amber-900/20 px-2 py-0.5 rounded border border-amber-900/30">
            ⚠ Parcial — integração bancária direta (Pluggy) prevista na Fase 4
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {saldosBancarios.map((s: { banco: string; conta?: string; agencia?: string; saldo: number | null }, i: number) => (
            <div key={i} className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
              <p className="text-xs text-gray-400 truncate font-medium">{s.banco}</p>
              {s.conta && <p className="text-[10px] text-gray-600">Ag {s.agencia} · Cc {s.conta}</p>}
              <p className={`text-sm font-bold mt-1 font-mono ${(s.saldo ?? 0) >= 0 ? 'text-blue-300' : 'text-red-400'}`}>
                {s.saldo != null ? fmtK(s.saldo) : '—'}
              </p>
            </div>
          ))}
          {saldosBancarios.length === 0 && (
            <p className="col-span-full text-xs text-gray-500">Nenhum saldo sincronizado. Execute o sync para atualizar.</p>
          )}
        </div>
      </div>

    </div>
  )
}
