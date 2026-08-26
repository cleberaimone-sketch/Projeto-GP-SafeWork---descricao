'use client'

import { useState, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend,
  ReferenceLine, Cell,
} from 'recharts'

export type ItemCategoria = {
  categoria: string
  emAberto: number
  jaPago: number
  total: number
  atrasado: number
  aVencer: number
  titulos: number
}
export type PontoCronograma = { mes: string; valor: number; titulos: number; saldoApos: number }

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const fmtBRL2 = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
const fmtEixo = (v: number) => {
  const a = Math.abs(v)
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}mi`
  if (a >= 1_000)     return `${(v / 1_000).toFixed(0)}k`
  return String(Math.round(v))
}
const rotuloMes = (iso: string) => {
  const [a, m] = iso.split('-')
  return `${['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][Number(m) - 1]}/${a.slice(2)}`
}
const tooltipStyle = {
  backgroundColor: '#ffffff', border: '1px solid #e2e8f0',
  borderRadius: 8, fontSize: 12, color: '#1e293b',
}

const TOPS = [10, 20, 50, 0] as const   // 0 = todas

export default function DividaClient({
  ano, anoCorrente, empresaId, empresas, categorias, cronograma,
  saldoTotal, atrasadoTotal, atrasadoTitulos, aVencerTotal,
}: {
  ano: number | null
  anoCorrente: number
  empresaId: string | null
  empresas: { id: string; nome_curto: string }[]
  categorias: ItemCategoria[]
  cronograma: PontoCronograma[]
  saldoTotal: number
  atrasadoTotal: number
  atrasadoTitulos: number
  aVencerTotal: number
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [top, setTop] = useState<number>(10)

  const navegar = (chave: string, valor: string | null) => {
    const p = new URLSearchParams(params.toString())
    if (valor) p.set(chave, valor)
    else p.delete(chave)
    router.push(`/dashboard/financeiro/divida${p.toString() ? `?${p}` : ''}`)
  }

  const anos = Array.from({ length: anoCorrente - 2024 + 1 }, (_, i) => 2024 + i).reverse()
  const titulosAbertos = categorias.reduce((s, c) => s + c.titulos, 0)

  // A curva começa no total devido: o primeiro ponto é "hoje", antes de
  // qualquer vencimento do período.
  const pontos = useMemo(() => ([
    { rotulo: 'hoje', vence: 0, saldo: saldoTotal, titulos: 0 },
    ...cronograma.map(c => ({
      rotulo: rotuloMes(c.mes), vence: c.valor, saldo: c.saldoApos, titulos: c.titulos,
    })),
  ]), [cronograma, saldoTotal])

  const exibidas = top === 0 ? categorias : categorias.slice(0, top)
  const somaExibida = exibidas.reduce((s, c) => s + c.emAberto, 0)
  // Referência para a largura das barras: a maior linha da lista exibida.
  const maiorTotal = Math.max(1, ...exibidas.map(c => c.total))

  return (
    <div className="space-y-6">

      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Saldo devedor" valor={fmtBRL(saldoTotal)} cor="slate"
             sub={`${titulosAbertos} títulos em aberto`} />
        <Kpi label="Já venceu" valor={fmtBRL(atrasadoTotal)} cor="red"
             sub={`${atrasadoTitulos} títulos · ${saldoTotal > 0 ? Math.round(atrasadoTotal / saldoTotal * 100) : 0}% da dívida`} />
        <Kpi label="A vencer" valor={fmtBRL(aVencerTotal)} cor="amber"
             sub={cronograma.length > 0 ? `até ${rotuloMes(cronograma[cronograma.length - 1].mes)}` : 'nada lançado'} />
        <Kpi label="Vence no próximo mês" valor={fmtBRL(cronograma[0]?.valor ?? 0)} cor="blue"
             sub={cronograma[0] ? `${cronograma[0].titulos} títulos em ${rotuloMes(cronograma[0].mes)}` : '—'} />
      </div>

      {/* ── Curva do saldo devedor ───────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="mb-3">
          <h2 className="font-semibold text-slate-800">Amortização do saldo devedor</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Parte do total devido hoje e desce conforme cada mês vence. A linha não chega a zero
            porque o que já venceu não sai sozinho — some só quando for pago.
          </p>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={pontos} margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
            <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmtEixo} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={52} />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value, name) => [fmtBRL2(Number(value)), String(name)]}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} iconSize={9} />
            {atrasadoTotal > 0 && (
              <ReferenceLine
                y={atrasadoTotal}
                stroke="#b91c1c"
                strokeDasharray="4 3"
                label={{ value: 'já vencido', position: 'insideTopRight', fontSize: 10, fill: '#b91c1c' }}
              />
            )}
            <Bar dataKey="vence" name="Vence no mês" radius={[3, 3, 0, 0]}>
              {pontos.map((_, i) => <Cell key={i} fill="#f59e0b" />)}
            </Bar>
            <Line type="monotone" dataKey="saldo" name="Saldo devedor" stroke="#0f766e" strokeWidth={2.5} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ── Ranking por plano de contas ──────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-800">Dívida por plano de contas</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {exibidas.length} de {categorias.length} linhas · {fmtBRL(somaExibida)} dos {fmtBRL(saldoTotal)} em aberto
              {ano ? ` · vencimentos de ${ano}` : ' · todos os exercícios'}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="flex gap-1">
              {TOPS.map(t => (
                <button key={t} onClick={() => setTop(t)}
                  className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                    t === top ? 'bg-blue-900 text-white border-blue-900'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                  {t === 0 ? 'Todas' : `Top ${t}`}
                </button>
              ))}
            </div>
            <select
              value={ano ?? ''}
              onChange={e => navegar('ano', e.target.value || null)}
              className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 bg-white text-slate-600"
            >
              <option value="">Todos os exercícios</option>
              {anos.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <select
              value={empresaId ?? ''}
              onChange={e => navegar('empresa', e.target.value || null)}
              className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 bg-white text-slate-600"
            >
              <option value="">Todas as empresas</option>
              {empresas.map(e => <option key={e.id} value={e.id}>{e.nome_curto}</option>)}
            </select>
          </div>
        </div>

        {exibidas.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            Nada em aberto com esses filtros.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {exibidas.map((c, i) => {
              const pctQuitado = c.total > 0 ? (c.jaPago / c.total) * 100 : 0
              return (
                <div key={c.categoria} className="px-5 py-3 hover:bg-slate-50/60">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="min-w-0 flex items-start gap-2.5">
                      <span className="text-[11px] text-slate-400 tabular-nums mt-0.5 w-5 shrink-0">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{c.categoria}</p>
                        <p className="text-[11px] text-slate-500">
                          {c.titulos} {c.titulos === 1 ? 'título' : 'títulos'} em aberto
                          {c.atrasado > 0 && <span className="text-red-700"> · {fmtBRL(c.atrasado)} vencido</span>}
                          {c.aVencer > 0 && <span className="text-amber-700"> · {fmtBRL(c.aVencer)} a vencer</span>}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-slate-900 tabular-nums">{fmtBRL(c.emAberto)}</p>
                      <p className="text-[11px] text-slate-400">
                        de {fmtBRL(c.total)} · {pctQuitado.toFixed(0)}% quitado
                      </p>
                    </div>
                  </div>

                  {/* Barra de progresso: quanto já saiu contra o que falta.
                      A largura total é proporcional à maior dívida da lista,
                      para as linhas serem comparáveis entre si. */}
                  <div
                    className="h-2.5 rounded-full bg-slate-100 overflow-hidden flex"
                    style={{ width: `${Math.max(12, (c.total / maiorTotal) * 100)}%` }}
                    title={`${fmtBRL2(c.jaPago)} pago · ${fmtBRL2(c.emAberto)} em aberto`}
                  >
                    <div className="bg-emerald-500 h-full" style={{ width: `${pctQuitado}%` }} />
                    <div className="bg-red-500 h-full" style={{ width: `${c.total > 0 ? (c.atrasado / c.total) * 100 : 0}%` }} />
                    <div className="bg-amber-400 h-full" style={{ width: `${c.total > 0 ? (c.aVencer / c.total) * 100 : 0}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="px-5 py-2.5 border-t border-slate-200 bg-slate-50 flex flex-wrap gap-4 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> já pago</span>
          <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" /> vencido</span>
          <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block" /> a vencer</span>
        </div>
      </div>
    </div>
  )
}

function Kpi({ label, valor, sub, cor }: {
  label: string; valor: string; sub: string; cor: 'slate' | 'red' | 'amber' | 'blue'
}) {
  const cores = {
    slate: 'text-slate-900',
    red:   'text-red-700',
    amber: 'text-amber-700',
    blue:  'text-blue-800',
  }
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-xl font-bold tabular-nums mt-0.5 ${cores[cor]}`}>{valor}</p>
      <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>
    </div>
  )
}
