'use client'

import { useState, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend,
  ReferenceLine, Cell,
} from 'recharts'

export type ItemCategoria = {
  categoria: string
  natureza: 'operacional' | 'financeira'
  emAberto: number
  jaPago: number
  total: number
  atrasado: number
  aVencer: number
  titulos: number
}
export type PontoCronograma = { mes: string; valor: number; titulos: number; saldoApos: number }
export type PontoSerie = { mes: string; vencido: number; venceu: number; pago: number; cancelado: number; titulos: number }

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

export default function PainelDivida({
  ano, anoCorrente, empresaId, empresas, categorias, cronograma, serie,
  saldoTotal, atrasadoTotal, atrasadoTitulos, aVencerTotal,
}: {
  ano: number | null
  anoCorrente: number
  empresaId: string | null
  empresas: { id: string; nome_curto: string }[]
  categorias: ItemCategoria[]
  cronograma: PontoCronograma[]
  serie: PontoSerie[]
  saldoTotal: number
  atrasadoTotal: number
  atrasadoTitulos: number
  aVencerTotal: number
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [top, setTop] = useState<number>(10)
  // Operacional (honorários, aluguel, impostos) e dívida financeira
  // (parcelamento, empréstimo, investimento) são coisas distintas; a página
  // mostra as duas, mas dá para isolar.
  const [natureza, setNatureza] = useState<'todas' | 'operacional' | 'financeira'>('todas')

  const navegar = (chave: string, valor: string | null) => {
    const p = new URLSearchParams(params.toString())
    if (valor) p.set(chave, valor)
    else p.delete(chave)
    router.push(`/dashboard/financeiro/atrasados${p.toString() ? `?${p}` : ''}`)
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

  // Passado e futuro na mesma linha do tempo: até "hoje" é o saldo que de fato
  // existiu; depois, o que sobra se cada vencimento for quitado em dia.
  const linhaDoTempo = useMemo(() => {
    const passado = serie.map(p => ({
      rotulo: rotuloMes(p.mes),
      saldo: p.vencido,
      venceu: p.venceu,
      pago: p.pago,
      cancelado: p.cancelado,
    }))
    const hoje = { rotulo: 'hoje', saldo: saldoTotal, venceu: 0, pago: 0, cancelado: 0 }
    const futuro = cronograma.map(c => ({
      rotulo: rotuloMes(c.mes),
      saldo: c.saldoApos,
      venceu: c.valor,
      pago: 0,
      cancelado: 0,
    }))
    return [...passado, hoje, ...futuro]
  }, [serie, cronograma, saldoTotal])

  const totalVenceu    = serie.reduce((s, p) => s + p.venceu, 0)
  const totalPago      = serie.reduce((s, p) => s + p.pago, 0)
  const totalCancelado = serie.reduce((s, p) => s + p.cancelado, 0)

  // Variação contra o mesmo mês do ano anterior — a leitura de tendência.
  const variacaoAno = useMemo(() => {
    if (serie.length < 13) return null
    const atual = serie[serie.length - 1]?.vencido ?? 0
    const anoAtras = serie[serie.length - 13]?.vencido ?? 0
    // (mantém a leitura de tendência do atraso, não do total devido)
    if (anoAtras === 0) return null
    return ((atual - anoAtras) / anoAtras) * 100
  }, [serie])

  const doFiltro = natureza === 'todas' ? categorias : categorias.filter(c => c.natureza === natureza)
  const exibidas = top === 0 ? doFiltro : doFiltro.slice(0, top)
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

      {/* ── Saldo devedor: de onde veio e para onde vai ─────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="font-semibold text-slate-800">Saldo devedor — histórico e amortização</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              À esquerda de <strong>hoje</strong>, quanto estava vencido e não pago no fim de cada mês.
              À direita, quanto sobra conforme cada vencimento futuro é quitado.
            </p>
          </div>
          {variacaoAno !== null && (
            <p className={`text-xs font-semibold ${variacaoAno <= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              {variacaoAno <= 0 ? '▼' : '▲'} {Math.abs(variacaoAno).toFixed(0)}% em 12 meses
            </p>
          )}
        </div>

        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={linhaDoTempo} margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
            <XAxis dataKey="rotulo" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false}
                   interval="preserveStartEnd" minTickGap={16} />
            <YAxis tickFormatter={fmtEixo} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={52} />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value, name) => [fmtBRL2(Number(value)), String(name)]}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} iconSize={9} />
            <ReferenceLine x="hoje" stroke="#0f172a" strokeDasharray="3 3"
              label={{ value: 'hoje', position: 'top', fontSize: 10, fill: '#0f172a' }} />
            <Bar dataKey="venceu"    name="Venceu / vence"  stackId="mov" fill="#f59e0b" radius={[2, 2, 0, 0]} />
            <Bar dataKey="pago"      name="Pago"            stackId="mov" fill="#059669" radius={[2, 2, 0, 0]} />
            <Bar dataKey="cancelado" name="Cancelado"       stackId="mov" fill="#94a3b8" radius={[2, 2, 0, 0]} />
            <Line type="monotone" dataKey="saldo" name="Saldo devedor" stroke="#b91c1c" strokeWidth={2.5} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>

        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-slate-100">
          <Mini rotulo="Venceu no período" valor={fmtBRL(totalVenceu)} cor="text-amber-700" />
          <Mini rotulo="Pago (amortizado)" valor={fmtBRL(totalPago)} cor="text-emerald-700" />
          <Mini rotulo="Cancelado sem pagar" valor={fmtBRL(totalCancelado)} cor="text-slate-500" />
          <Mini rotulo="Ainda em aberto" valor={fmtBRL(saldoTotal)} cor="text-red-700" />
        </div>
      </div>

      {/* ── Ranking por plano de contas ──────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-800">Dívida por plano de contas</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {exibidas.length} de {doFiltro.length} linhas · {fmtBRL(somaExibida)} dos {fmtBRL(saldoTotal)} em aberto
              {ano ? ` · vencimentos de ${ano}` : ' · todos os exercícios'}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="flex gap-1">
              {([['todas','Todas'],['operacional','Operação'],['financeira','Dívida']] as const).map(([k, r]) => (
                <button key={k} onClick={() => setNatureza(k)}
                  className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                    k === natureza ? 'bg-violet-700 text-white border-violet-700'
                                   : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                  {r}
                </button>
              ))}
            </div>
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
                        <p className="text-sm font-medium text-slate-800 truncate">
                          {c.categoria}
                          {c.natureza === 'financeira' && (
                            <span className="ml-2 px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 text-[9px] font-semibold uppercase tracking-wide align-middle">
                              dívida
                            </span>
                          )}
                        </p>
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

function Mini({ rotulo, valor, cor }: { rotulo: string; valor: string; cor: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{rotulo}</p>
      <p className={`text-sm font-bold tabular-nums ${cor}`}>{valor}</p>
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
