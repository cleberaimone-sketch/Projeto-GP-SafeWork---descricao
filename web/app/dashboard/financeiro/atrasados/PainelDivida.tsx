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
export type Titulo = {
  id: string
  empresa: string
  descricao: string
  valor: number
  data_vencimento: string
  dias_atraso: number
  status: string
  data_negociada: string | null
  observacao: string | null
}

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
  ano, anoCorrente, empresaId, empresas, categorias, cronograma, serie, notaReversao,
  saldoTotal, atrasadoTotal, atrasadoTitulos, aVencerTotal,
}: {
  ano: number | null
  anoCorrente: number
  empresaId: string | null
  empresas: { id: string; nome_curto: string }[]
  categorias: ItemCategoria[]
  cronograma: PontoCronograma[]
  serie: PontoSerie[]
  notaReversao: { titulos: number; valor: number; data: string | null } | null
  saldoTotal: number
  atrasadoTotal: number
  atrasadoTitulos: number
  aVencerTotal: number
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [top, setTop] = useState<number>(10)
  // Drill-down: qual linha está aberta e os títulos dela, buscados sob demanda.
  const [aberta, setAberta] = useState<string | null>(null)
  const [titulos, setTitulos] = useState<Record<string, Titulo[]>>({})
  const [carregando, setCarregando] = useState<string | null>(null)

  async function alternar(categoria: string) {
    if (aberta === categoria) { setAberta(null); return }
    setAberta(categoria)
    if (titulos[categoria]) return          // já carregado

    setCarregando(categoria)
    try {
      const p = new URLSearchParams({ categoria })
      if (ano) p.set('ano', String(ano))
      if (empresaId) p.set('empresa', empresaId)
      const r = await fetch(`/api/financeiro/divida/titulos?${p}`)
      const j = await r.json()
      setTitulos(t => ({ ...t, [categoria]: j.titulos ?? [] }))
    } catch {
      setTitulos(t => ({ ...t, [categoria]: [] }))
    } finally {
      setCarregando(null)
    }
  }
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

  // Uma linha só, com a MESMA métrica do começo ao fim: o total devido e ainda
  // não pago. Antes ela mudava de significado no meio — no passado mostrava só
  // o atraso, e em "hoje" passava a somar o que ainda vai vencer, o que criava
  // um salto artificial de R$ 281 mil.
  //
  // No passado o "a vencer" daquele momento não é reconstruível: não há data de
  // lançamento confiável, então em janeiro/2024 contaríamos títulos de 2026 que
  // nem existiam. A solução é somar hoje o que já sabemos que estava por vencer
  // — o vencido histórico é o piso, e a diferença aparece só a partir de hoje,
  // sinalizada como projeção.
  const linhaDoTempo = useMemo(() => {
    const aVencerHoje = cronograma.reduce((s, c) => s + c.valor, 0)

    const passado = serie.map((p, i) => ({
      // O último ponto do histórico É hoje. Rotular como "hoje" evita o mês
      // corrente aparecer duas vezes no eixo — uma no histórico e outra na
      // projeção, que começa justamente pelo que ainda vence neste mês.
      rotulo: i === serie.length - 1 ? 'hoje' : rotuloMes(p.mes),
      // O último ponto do histórico é hoje: ali o total já inclui o a vencer.
      saldo: i === serie.length - 1 ? p.vencido + aVencerHoje : p.vencido,
      vencido: p.vencido,
      aVencer: i === serie.length - 1 ? aVencerHoje : 0,
      venceu: p.venceu,
      pago: p.pago,
      cancelado: p.cancelado,
      projecao: false,
    }))

    // Daqui pra frente é projeção: o saldo cai conforme cada mês vence, supondo
    // que seja pago em dia. Se não for, a linha volta a subir no mês seguinte.
    const futuro = cronograma.map(c => ({
      rotulo: rotuloMes(c.mes),
      saldo: c.saldoApos,
      vencido: 0,
      aVencer: 0,
      venceu: c.valor,
      pago: 0,
      cancelado: 0,
      projecao: true,
    }))
    return [...passado, ...futuro]
  }, [serie, cronograma])

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
  // Quanto do saldo devedor o recorte atual deixa de fora. O gráfico é sempre
  // o total; sem este aviso, filtrar um exercício escondia R$ 2,46 mi calado.
  const foraDoRecorte = saldoTotal - doFiltro.reduce((s, c) => s + c.emAberto, 0)

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
              A linha é o total devido e não pago. Até <strong>hoje</strong> é o que de fato
              existiu; daí em diante é projeção — o saldo cai conforme cada mês vence, supondo
              pagamento em dia. Se não pagar, a linha volta a subir.
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
            <ReferenceLine x="hoje" stroke="#0f172a" strokeDasharray="3 3" />
            <Bar dataKey="venceu"    name="Venceu / vence"  stackId="mov" fill="#f59e0b" radius={[2, 2, 0, 0]} />
            <Bar dataKey="pago"      name="Pago"            stackId="mov" fill="#059669" radius={[2, 2, 0, 0]} />
            <Bar dataKey="cancelado" name="Cancelado"       stackId="mov" fill="#94a3b8" radius={[0, 0, 0, 0]} />
            <Bar dataKey="aVencer"   name="Ainda vai vencer" stackId="mov" fill="#fbbf24" radius={[2, 2, 0, 0]} />
            <Line type="monotone" dataKey="saldo" name="Saldo devedor" stroke="#b91c1c" strokeWidth={2.5} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>

        {notaReversao && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
            <span className="text-amber-700 text-sm leading-none mt-0.5">⚠</span>
            <p className="text-[11px] text-amber-900 leading-relaxed">
              <strong>{notaReversao.titulos} títulos</strong> ({fmtBRL(notaReversao.valor)}) foram
              baixados por engano nesta plataforma em 23/07/2026 e <strong>devolvidos à dívida</strong>
              {notaReversao.data && ` em ${notaReversao.data.split('-').reverse().join('/')}`}.
              A curva acima já mostra o valor real. Os registros guardam os dois marcadores, da baixa e da reversão.
            </p>
          </div>
        )}

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
            {foraDoRecorte > 0.5 && (
              <p className="text-[11px] text-amber-700 mt-1">
                {fmtBRL(foraDoRecorte)} não aparecem neste recorte — venceram fora de {ano}
                {natureza !== 'todas' && ' ou são de outra natureza'}. O gráfico acima mostra o total.
              </p>
            )}
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
              onChange={e => navegar('dividaAno', e.target.value || null)}
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
              const estaAberta = aberta === c.categoria
              const lista = titulos[c.categoria]

              return (
                <div key={c.categoria}>
                  <button
                    onClick={() => alternar(c.categoria)}
                    className={`w-full text-left px-5 py-3 transition-colors ${
                      estaAberta ? 'bg-slate-50' : 'hover:bg-slate-50/60'}`}
                  >
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div className="min-w-0 flex items-start gap-2.5">
                        <span className={`text-[11px] tabular-nums mt-0.5 w-5 shrink-0 transition-transform ${
                          estaAberta ? 'text-slate-700 rotate-90' : 'text-slate-400'}`}>
                          {estaAberta ? '▸' : i + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">
                            {c.categoria}
                            {c.natureza === 'financeira' && (
                              <span className="ml-2 px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 text-[9px] font-semibold uppercase tracking-wide align-middle">
                                dívida
                              </span>
                            )}
                            {c.natureza === 'operacional' && (
                              <span className="ml-2 px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 text-[9px] font-semibold uppercase tracking-wide align-middle">
                                operação
                              </span>
                            )}
                            {c.aVencer === 0 && c.atrasado > 0 && (
                              <span className="ml-1.5 px-1.5 py-0.5 rounded bg-red-50 text-red-700 text-[9px] font-semibold uppercase tracking-wide align-middle">
                                tudo atrasado
                              </span>
                            )}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {c.titulos} {c.titulos === 1 ? 'título' : 'títulos'} em aberto ·
                            <span className="text-blue-700"> ver detalhe</span>
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

                    {/* Barra em largura fixa: as faixas mostram a composição
                        DESTA linha, e o texto ao lado dá a grandeza. Antes a
                        largura variava com o valor e as faixas ficavam
                        ilegíveis nas linhas menores. */}
                    <div className="flex items-center gap-3">
                      <div className="h-3 rounded-full bg-slate-100 overflow-hidden flex flex-1 min-w-0"
                           title={`${fmtBRL2(c.jaPago)} pago · ${fmtBRL2(c.atrasado)} vencido · ${fmtBRL2(c.aVencer)} a vencer`}>
                        {[
                          { v: c.jaPago,   cor: 'bg-emerald-500' },
                          { v: c.atrasado, cor: 'bg-red-500' },
                          { v: c.aVencer,  cor: 'bg-amber-400' },
                        ].map((faixa, j) => faixa.v > 0 && (
                          <div key={j} className={`${faixa.cor} h-full`}
                               style={{ width: `${(faixa.v / Math.max(c.total, 1)) * 100}%` }} />
                        ))}
                      </div>
                      <div className="flex gap-2.5 text-[10px] tabular-nums shrink-0">
                        {c.atrasado > 0 && <span className="text-red-700">{fmtBRL(c.atrasado)} vencido</span>}
                        {c.aVencer > 0 && <span className="text-amber-700">{fmtBRL(c.aVencer)} a vencer</span>}
                      </div>
                    </div>
                  </button>

                  {estaAberta && (
                    <div className="px-5 pb-4 bg-slate-50 border-t border-slate-100">
                      {carregando === c.categoria ? (
                        <p className="text-xs text-slate-500 py-3">Carregando títulos…</p>
                      ) : !lista || lista.length === 0 ? (
                        <p className="text-xs text-slate-500 py-3">Nenhum título encontrado.</p>
                      ) : (
                        <div className="overflow-x-auto -mx-1">
                          <table className="w-full text-[11px] mt-2">
                            <thead>
                              <tr className="text-slate-500">
                                <th className="text-left font-medium py-1.5 px-2">Empresa</th>
                                <th className="text-left font-medium py-1.5 px-2">Descrição</th>
                                <th className="text-right font-medium py-1.5 px-2">Vencimento</th>
                                <th className="text-right font-medium py-1.5 px-2">Atraso</th>
                                <th className="text-right font-medium py-1.5 px-2">Valor</th>
                              </tr>
                            </thead>
                            <tbody>
                              {lista.map(t => (
                                <tr key={t.id} className="border-t border-slate-200/70">
                                  <td className="py-1.5 px-2 text-slate-600 whitespace-nowrap">{t.empresa}</td>
                                  <td className="py-1.5 px-2 text-slate-700 max-w-[380px] truncate" title={t.descricao}>
                                    {t.descricao}
                                    {t.data_negociada && (
                                      <span className="ml-2 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[9px] font-semibold">
                                        negociado p/ {t.data_negociada.split('-').reverse().join('/')}
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-1.5 px-2 text-right text-slate-600 tabular-nums whitespace-nowrap">
                                    {t.data_vencimento.split('-').reverse().join('/')}
                                  </td>
                                  <td className={`py-1.5 px-2 text-right tabular-nums whitespace-nowrap ${
                                    t.dias_atraso > 365 ? 'text-red-700 font-semibold'
                                    : t.dias_atraso > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                                    {t.dias_atraso > 0 ? `${t.dias_atraso}d` : '—'}
                                  </td>
                                  <td className="py-1.5 px-2 text-right font-semibold text-slate-800 tabular-nums whitespace-nowrap">
                                    {fmtBRL2(t.valor)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="border-t-2 border-slate-300">
                                <td colSpan={4} className="py-1.5 px-2 text-right font-semibold text-slate-600">
                                  {lista.length} {lista.length === 1 ? 'título' : 'títulos'}
                                </td>
                                <td className="py-1.5 px-2 text-right font-bold text-slate-900 tabular-nums">
                                  {fmtBRL2(lista.reduce((s, t) => s + Number(t.valor), 0))}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
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
