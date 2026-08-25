'use client'

// Um gráfico por unidade, mês a mês, para a linha do DRE escolhida.
// A leitura que interessa é "subiu ou caiu contra a própria média", então cada
// gráfico traz sua linha de média e a variação do último mês fechado.

import { useState, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, Cell,
  ComposedChart, Line, Legend,
} from 'recharts'

export type LinhaDre = Record<string, number[]>
export type PontoUnidade = { unidade: string; series: LinhaDre }

// A ordem é a do demonstrativo em papel — receita no topo, caixa no fim.
const LINHAS = [
  { key: 'receita_bruta',        label: 'Receita Bruta',           curto: 'R.B.',   positiva: true },
  { key: 'deducoes',             label: 'Deduções da Receita',     curto: 'D.',     positiva: false },
  { key: 'custo_servicos',       label: 'Custo dos Serviços',      curto: 'C.S.',   positiva: false },
  { key: 'despesas_admin',       label: 'Despesas Administrativas', curto: 'D.A.',  positiva: false },
  { key: 'despesas_financeiras', label: 'Despesas Financeiras',    curto: 'D.F.',   positiva: false },
  { key: 'lucro_liquido',        label: 'Lucro Líquido',           curto: 'L.L.',   positiva: true },
  { key: 'investimentos',        label: 'Investimentos',           curto: 'I.I.',   positiva: false },
  { key: 'emprestimos_socios',   label: 'Empréstimos de Sócios',   curto: 'E.S.',   positiva: false },
  { key: 'parc_contas_antigas',  label: 'Parc. contas antigas',    curto: 'P.C.A.', positiva: false },
  { key: 'parc_contas_atuais',   label: 'Parc. contas atuais',     curto: 'P.C.',   positiva: false },
  { key: 'parc_lucro_presumido', label: 'Parc. Lucro Presumido',   curto: 'P.L.P.', positiva: false },
  { key: 'caixa',                label: 'Caixa',                   curto: 'CAIXA',  positiva: true },
] as const

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

const fmtEixo = (v: number) => {
  const a = Math.abs(v)
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}mi`
  if (a >= 1_000)     return `${(v / 1_000).toFixed(0)}k`
  return String(Math.round(v))
}
const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

const tooltipStyle = {
  backgroundColor: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  fontSize: 12,
  color: '#1e293b',
}

export default function UnidadesClient({
  ano, anoCorrente, mesesFechados, unidades, total,
}: {
  ano: number
  anoCorrente: number
  mesesFechados: number
  unidades: PontoUnidade[]
  total: LinhaDre
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [linhaKey, setLinhaKey] = useState<string>('receita_bruta')
  const [visao, setVisao] = useState<'linha' | 'fluxo'>('linha')

  const linha = LINHAS.find(l => l.key === linhaKey) ?? LINHAS[0]

  const trocarAno = (novo: number) => {
    const p = new URLSearchParams(params.toString())
    p.set('ano', String(novo))
    router.push(`/dashboard/financeiro/unidades?${p.toString()}`)
  }

  // Média só sobre meses fechados; ver o comentário no page.tsx.
  const resumo = useMemo(() => {
    const calc = (serie: number[] | undefined) => {
      const s = serie ?? Array(12).fill(0)
      const fechados = s.slice(0, mesesFechados)
      const media = mesesFechados > 0 ? fechados.reduce((a, b) => a + b, 0) / mesesFechados : 0
      const ultimo = mesesFechados > 0 ? s[mesesFechados - 1] : 0
      const variacao = media !== 0 ? ((ultimo - media) / Math.abs(media)) * 100 : 0
      return { serie: s, media, ultimo, variacao, totalAno: s.reduce((a, b) => a + b, 0) }
    }
    return {
      porUnidade: unidades.map(u => ({ unidade: u.unidade, ...calc(u.series[linha.key]) })),
      grupo: calc(total[linha.key]),
    }
  }, [unidades, total, linha.key, mesesFechados])

  const anos = Array.from({ length: anoCorrente - 2024 + 1 }, (_, i) => 2024 + i).reverse()

  return (
    <div className="space-y-6">

      {/* ── Controles ───────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5">Visão</p>
            <div className="flex gap-1">
              {([['linha', 'Linha do DRE'], ['fluxo', 'Do lucro ao caixa']] as const).map(([k, rotulo]) => (
                <button
                  key={k}
                  onClick={() => setVisao(k)}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                    visao === k
                      ? 'bg-blue-900 text-white border-blue-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {rotulo}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5">Exercício</p>
            <div className="flex gap-1">
              {anos.map(a => (
                <button
                  key={a}
                  onClick={() => trocarAno(a)}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                    a === ano
                      ? 'bg-blue-900 text-white border-blue-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          <div className={`flex-1 min-w-[280px] ${visao === 'fluxo' ? 'hidden' : ''}`}>
            <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5">Linha do DRE</p>
            <div className="flex flex-wrap gap-1">
              {LINHAS.map(l => (
                <button
                  key={l.key}
                  onClick={() => setLinhaKey(l.key)}
                  title={l.label}
                  className={`px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${
                    l.key === linhaKey
                      ? 'bg-blue-900 text-white border-blue-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {visao === 'linha' ? (
        <>
          {/* ── Consolidado do grupo ──────────────────────────────────────── */}
          <GraficoUnidade
            titulo={`Grupo — ${linha.label}`}
            destaque
            dados={resumo.grupo}
            positiva={linha.positiva}
            mesesFechados={mesesFechados}
          />

          {/* ── Um gráfico por unidade ────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {resumo.porUnidade.map(u => (
              <GraficoUnidade
                key={u.unidade}
                titulo={u.unidade}
                dados={u}
                positiva={linha.positiva}
                mesesFechados={mesesFechados}
              />
            ))}
          </div>
        </>
      ) : (
        <>
          <GraficoFluxo
            titulo="Grupo — do lucro ao caixa"
            destaque
            lucro={total.lucro_liquido ?? []}
            outros={total.outros ?? []}
            mesesFechados={mesesFechados}
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {unidades.map(u => (
              <GraficoFluxo
                key={u.unidade}
                titulo={u.unidade}
                lucro={u.series.lucro_liquido ?? []}
                outros={u.series.outros ?? []}
                mesesFechados={mesesFechados}
              />
            ))}
          </div>
        </>
      )}

      {/* ── Tabela resumo — o equivalente à aba "DRE R." ─────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h2 className="font-semibold text-slate-800">Resumo — média mensal por unidade</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Todas as linhas do DRE. Média sobre {mesesFechados} {mesesFechados === 1 ? 'mês fechado' : 'meses fechados'} de {ano}.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th className="text-left font-medium px-4 py-2.5 sticky left-0 bg-slate-50">Unidade</th>
                {LINHAS.map(l => (
                  <th key={l.key} className="text-right font-medium px-3 py-2.5 whitespace-nowrap" title={l.label}>
                    {l.curto}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {unidades.map(u => (
                <tr key={u.unidade} className="border-t border-slate-100 hover:bg-slate-50/60">
                  <td className="px-4 py-2 font-medium text-slate-700 sticky left-0 bg-white whitespace-nowrap">
                    {u.unidade}
                  </td>
                  {LINHAS.map(l => {
                    const s = u.series[l.key] ?? []
                    const m = mesesFechados > 0
                      ? s.slice(0, mesesFechados).reduce((a, b) => a + b, 0) / mesesFechados
                      : 0
                    return (
                      <td key={l.key} className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${
                        m < 0 ? 'text-red-700' : m > 0 ? 'text-slate-700' : 'text-slate-300'
                      }`}>
                        {m === 0 ? '—' : fmtBRL(m)}
                      </td>
                    )
                  })}
                </tr>
              ))}
              <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                <td className="px-4 py-2.5 text-slate-800 sticky left-0 bg-slate-50">Total do grupo</td>
                {LINHAS.map(l => {
                  const s = total[l.key] ?? []
                  const m = mesesFechados > 0
                    ? s.slice(0, mesesFechados).reduce((a, b) => a + b, 0) / mesesFechados
                    : 0
                  return (
                    <td key={l.key} className={`px-3 py-2.5 text-right tabular-nums whitespace-nowrap ${
                      m < 0 ? 'text-red-700' : 'text-slate-800'
                    }`}>
                      {m === 0 ? '—' : fmtBRL(m)}
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function GraficoUnidade({
  titulo, dados, positiva, mesesFechados, destaque = false,
}: {
  titulo: string
  dados: { serie: number[]; media: number; ultimo: number; variacao: number; totalAno: number }
  positiva: boolean
  mesesFechados: number
  destaque?: boolean
}) {
  const pontos = dados.serie.map((v, i) => ({
    mes: MESES[i],
    valor: v,
    fechado: i < mesesFechados,     // meses ainda em curso ficam esmaecidos
  }))

  const temDado = dados.serie.some(v => v !== 0)
  // "Melhorou" depende da linha: receita subir é bom, despesa subir não é.
  const bom = positiva ? dados.variacao >= 0 : dados.variacao <= 0
  const corBarra = positiva ? '#1d4ed8' : '#b91c1c'

  return (
    <div className={`bg-white border rounded-xl p-4 ${destaque ? 'border-blue-300 shadow-sm' : 'border-slate-200'}`}>
      <div className="flex items-start justify-between mb-3 gap-3">
        <div className="min-w-0">
          <h3 className={`font-semibold truncate ${destaque ? 'text-blue-900 text-lg' : 'text-slate-800'}`}>
            {titulo}
          </h3>
          <p className="text-xs text-slate-500">
            Média {fmtBRL(dados.media)} · Ano {fmtBRL(dados.totalAno)}
          </p>
        </div>
        {temDado && mesesFechados > 0 && (
          <div className="text-right shrink-0">
            <p className={`text-sm font-semibold tabular-nums ${bom ? 'text-emerald-700' : 'text-red-700'}`}>
              {dados.variacao >= 0 ? '▲' : '▼'} {Math.abs(dados.variacao).toFixed(1)}%
            </p>
            <p className="text-[10px] text-slate-400">último mês vs média</p>
          </div>
        )}
      </div>

      {temDado ? (
        <ResponsiveContainer width="100%" height={destaque ? 220 : 170}>
          <BarChart data={pontos} margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
            <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmtEixo} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={44} />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value) => [fmtBRL(Number(value)), 'Valor']}
              cursor={{ fill: '#f1f5f9' }}
            />
            <ReferenceLine y={0} stroke="#cbd5e1" />
            {dados.media !== 0 && (
              <ReferenceLine
                y={dados.media}
                stroke="#0f766e"
                strokeDasharray="4 3"
                label={{ value: 'média', position: 'right', fontSize: 9, fill: '#0f766e' }}
              />
            )}
            <Bar dataKey="valor" radius={[3, 3, 0, 0]}>
              {pontos.map((p, i) => (
                <Cell key={i} fill={corBarra} fillOpacity={p.fechado ? 1 : 0.28} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[170px] flex items-center justify-center text-sm text-slate-400">
          Sem movimento nesta linha
        </div>
      )}
    </div>
  )
}

/**
 * Do lucro ao caixa — o bloco final da aba "FLUXO DE CAIXA" da planilha.
 *
 * Barras: lucro do mês e o que saiu fora da operação (investimento, empréstimo
 * de sócio, parcelamentos). Linha: o caixa acumulado no ano, que é a leitura
 * que importa — mês isolado engana, o acumulado mostra se o ano está
 * construindo ou consumindo caixa.
 */
function GraficoFluxo({
  titulo, lucro, outros, mesesFechados, destaque = false,
}: {
  titulo: string
  lucro: number[]
  outros: number[]
  mesesFechados: number
  destaque?: boolean
}) {
  let acumulado = 0
  const pontos = MESES.map((mes, i) => {
    const l = lucro[i] ?? 0
    const o = outros[i] ?? 0
    acumulado += l + o
    return { mes, lucro: l, outros: o, caixa: l + o, acumulado, fechado: i < mesesFechados }
  })

  const temDado = pontos.some(p => p.lucro !== 0 || p.outros !== 0)
  const acumFechado = mesesFechados > 0 ? pontos[mesesFechados - 1].acumulado : 0
  const lucroFechado = lucro.slice(0, mesesFechados).reduce((a, b) => a + b, 0)
  // Quanto do lucro do período sobreviveu como caixa.
  const conversao = lucroFechado !== 0 ? (acumFechado / lucroFechado) * 100 : 0

  return (
    <div className={`bg-white border rounded-xl p-4 ${destaque ? 'border-blue-300 shadow-sm' : 'border-slate-200'}`}>
      <div className="flex items-start justify-between mb-3 gap-3">
        <div className="min-w-0">
          <h3 className={`font-semibold truncate ${destaque ? 'text-blue-900 text-lg' : 'text-slate-800'}`}>
            {titulo}
          </h3>
          <p className="text-xs text-slate-500">
            Lucro {fmtBRL(lucroFechado)} · Caixa acumulado {fmtBRL(acumFechado)}
          </p>
        </div>
        {temDado && mesesFechados > 0 && lucroFechado > 0 && (
          <div className="text-right shrink-0">
            <p className={`text-sm font-semibold tabular-nums ${
              conversao >= 60 ? 'text-emerald-700' : conversao >= 25 ? 'text-amber-700' : 'text-red-700'
            }`}>
              {conversao.toFixed(0)}%
            </p>
            <p className="text-[10px] text-slate-400">do lucro virou caixa</p>
          </div>
        )}
      </div>

      {temDado ? (
        <ResponsiveContainer width="100%" height={destaque ? 260 : 200}>
          <ComposedChart data={pontos} margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
            <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmtEixo} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={48} />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value, name) => [fmtBRL(Number(value)), String(name)]}
              cursor={{ fill: '#f1f5f9' }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} iconSize={9} />
            <ReferenceLine y={0} stroke="#cbd5e1" />
            <Bar dataKey="lucro" name="Lucro" radius={[3, 3, 0, 0]}>
              {pontos.map((p, i) => (
                <Cell key={i} fill="#1d4ed8" fillOpacity={p.fechado ? 1 : 0.28} />
              ))}
            </Bar>
            <Bar dataKey="outros" name="Fora da operação" radius={[0, 0, 3, 3]}>
              {pontos.map((p, i) => (
                <Cell key={i} fill="#b91c1c" fillOpacity={p.fechado ? 1 : 0.28} />
              ))}
            </Bar>
            <Line
              type="monotone"
              dataKey="acumulado"
              name="Caixa acumulado"
              stroke="#0f766e"
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[200px] flex items-center justify-center text-sm text-slate-400">
          Sem movimento no exercício
        </div>
      )}
    </div>
  )
}
