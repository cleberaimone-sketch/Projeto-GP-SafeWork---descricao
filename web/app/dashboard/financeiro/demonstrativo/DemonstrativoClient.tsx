'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, ReferenceLine, Cell,
} from 'recharts'

export type Tabela = {
  titulo: string
  subtitulo: string
  linhas: LinhaTabela[]
  /** Qual leitura o gráfico abaixo da tabela deve dar. */
  grafico: 'receita-despesa-lucro' | 'empilhado' | 'lucro-caixa-acumulado'
}

export type LinhaTabela = {
  rotulo: string
  tipo: 'receita' | 'saida' | 'subtotal' | 'total' | 'acumulado'
  valores: number[]
  total: number
  media: number
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
               'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

/**
 * Rótulos das colunas. No modo mensal são os meses do exercício; no modo anual,
 * os próprios anos. O resto da tabela não precisa saber a diferença — só quantas
 * colunas existem e quantas delas estão fechadas.
 */
export type Periodo = {
  rotulos: string[]
  /** Quantas colunas, da esquerda, já estão encerradas e entram na média. */
  fechadas: number
  modo: 'mensal' | 'anual'
  /** Rótulos das duas últimas colunas — elas somam janelas DIFERENTES e o
   *  cabeçalho precisa dizer qual é qual. O Total pega tudo que está lançado,
   *  inclusive períodos ainda abertos; a Média só o que já fechou. */
  rotuloTotal: string
  rotuloMedia: string
}

const fmt = (v: number) =>
  v === 0 ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const fmtCheio = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const fmtEixo = (v: number) => {
  const a = Math.abs(v)
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}mi`
  if (a >= 1_000)     return `${(v / 1_000).toFixed(0)}k`
  return String(Math.round(v))
}
const tooltipStyle = {
  backgroundColor: '#ffffff', border: '1px solid #e2e8f0',
  borderRadius: 8, fontSize: 12, color: '#1e293b',
}
// Paleta das faixas empilhadas de "fora da operação".
const CORES = ['#7c3aed', '#db2777', '#ea580c', '#ca8a04', '#0891b2']

// Cada tipo de linha tem um peso visual: as de movimento ficam discretas, os
// subtotais saltam. É como o demonstrativo em papel se lê.
const ESTILO: Record<LinhaTabela['tipo'], { linha: string; rotulo: string; valor: string }> = {
  receita:   { linha: 'bg-white',       rotulo: 'font-medium text-slate-800', valor: 'text-slate-800' },
  saida:     { linha: 'bg-white',       rotulo: 'text-slate-600',             valor: 'text-slate-600' },
  subtotal:  { linha: 'bg-slate-50',    rotulo: 'font-bold text-slate-900',   valor: 'font-semibold text-slate-900' },
  total:     { linha: 'bg-blue-50',     rotulo: 'font-bold text-blue-900',    valor: 'font-bold text-blue-900' },
  acumulado: { linha: 'bg-slate-900',   rotulo: 'font-bold text-white',       valor: 'font-bold text-white' },
}

export default function DemonstrativoClient({
  ano, anoCorrente, empresaId, empresas, tabelas, periodo, visao, anoTodos, avisoSerieParcial,
}: {
  ano: number
  anoCorrente: number
  empresaId: string | null
  empresas: { id: string; nome_curto: string }[]
  tabelas: Tabela[]
  periodo: Periodo
  anoTodos: boolean
  avisoSerieParcial: string | null
  visao: 'consolidado' | 'unidades'
}) {
  const router = useRouter()
  const params = useSearchParams()

  const navegar = (chave: string, valor: string | null) => {
    const p = new URLSearchParams(params.toString())
    if (valor) p.set(chave, valor)
    else p.delete(chave)
    router.push(`/dashboard/financeiro/demonstrativo${p.toString() ? `?${p}` : ''}`)
  }

  const anos = Array.from({ length: anoCorrente - 2024 + 1 }, (_, i) => 2024 + i).reverse()

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-end gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5">Visão</p>
          <div className="flex gap-1">
            {([['consolidado', 'Consolidado'], ['unidades', 'Por unidade']] as const).map(([k, r]) => (
              <button key={k} onClick={() => navegar('visao', k === 'consolidado' ? null : k)}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  visao === k ? 'bg-blue-900 text-white border-blue-900'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                {r}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5">Exercício</p>
          <div className="flex gap-1">
            {anos.map(a => (
              <button key={a} onClick={() => navegar('ano', String(a))}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  a === ano && !anoTodos ? 'bg-blue-900 text-white border-blue-900'
                                         : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                {a}
              </button>
            ))}
            {/* Troca as colunas de meses por anos, mantendo as mesmas linhas. */}
            <button onClick={() => navegar('ano', 'todos')}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                anoTodos ? 'bg-blue-900 text-white border-blue-900'
                         : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
              Todos os anos
            </button>
          </div>
        </div>
        <div className={visao === 'unidades' ? 'hidden' : ''}>
          <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5">Empresa</p>
          <select
            value={empresaId ?? ''}
            onChange={e => navegar('empresa', e.target.value || null)}
            className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white text-slate-700"
          >
            <option value="">Grupo consolidado</option>
            {empresas.map(e => <option key={e.id} value={e.id}>{e.nome_curto}</option>)}
          </select>
        </div>
      </div>

      {avisoSerieParcial && (
        <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
          <span className="text-amber-700 text-sm leading-none mt-0.5">⚠</span>
          <p className="text-xs text-amber-900 leading-relaxed">{avisoSerieParcial}</p>
        </div>
      )}

      {tabelas.map(t => (
        <TabelaMensal key={t.titulo} tabela={t} periodo={periodo} />
      ))}
    </div>
  )
}

function TabelaMensal({ tabela, periodo }: { tabela: Tabela; periodo: Periodo }) {
  const { rotulos, fechadas } = periodo
  return (
    <div className={`bg-white rounded-xl overflow-hidden border ${
      tabela.titulo === 'TOTAL GRUPO' ? 'border-blue-300 shadow-sm' : 'border-slate-200'}`}>
      <div className="px-4 py-3 border-b border-slate-200">
        <h2 className={`font-semibold ${
          tabela.titulo === 'TOTAL GRUPO' ? 'text-blue-900 text-lg' : 'text-slate-800'}`}>
          {tabela.titulo}
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">{tabela.subtitulo}</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100 text-slate-600">
              <th className="text-left font-semibold px-3 py-2.5 sticky left-0 bg-slate-100 z-10 min-w-[230px]">
                MÊS
              </th>
              {rotulos.map((r, i) => (
                <th key={r}
                  className={`text-right font-semibold px-2.5 py-2.5 whitespace-nowrap ${
                    periodo.modo === 'anual' ? 'min-w-[110px]' : 'min-w-[84px]'} ${
                    i >= fechadas ? 'text-slate-400' : ''}`}
                  title={i >= fechadas ? 'período ainda não encerrado' : undefined}>
                  {r}
                </th>
              ))}
              {/* Grudadas à direita: com 12 meses a tabela rola, e sem isto o
                  Total e a Média ficavam fora da tela. */}
              <th className="text-right font-semibold px-3 py-2 whitespace-nowrap bg-slate-200 min-w-[112px] sticky right-[112px] z-10 border-l border-slate-300">
                Total
                <span className="block text-[9px] font-normal text-slate-500 normal-case">{periodo.rotuloTotal}</span>
              </th>
              <th className="text-right font-semibold px-3 py-2 whitespace-nowrap bg-slate-200 min-w-[112px] sticky right-0 z-10">
                Média
                <span className="block text-[9px] font-normal text-slate-500 normal-case">{periodo.rotuloMedia}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {tabela.linhas.map(l => {
              const e = ESTILO[l.tipo]
              return (
                <tr key={l.rotulo} className={`border-t border-slate-100 ${e.linha}`}>
                  <td className={`px-3 py-2 sticky left-0 z-10 whitespace-nowrap ${e.linha} ${e.rotulo}`}>
                    {l.rotulo}
                  </td>
                  {l.valores.map((v, i) => (
                    <td key={i}
                      className={`px-2.5 py-2 text-right tabular-nums whitespace-nowrap ${
                        v < 0 && l.tipo !== 'saida' ? 'text-red-600'
                        : l.tipo === 'acumulado' ? e.valor
                        : v === 0 ? 'text-slate-300' : e.valor
                      } ${i >= fechadas && l.tipo !== 'acumulado' ? 'opacity-50' : ''}`}>
                      {fmt(v)}
                    </td>
                  ))}
                  <td className={`px-3 py-2 text-right tabular-nums whitespace-nowrap sticky right-[112px] z-10 border-l border-slate-200 ${
                    l.tipo === 'acumulado' ? 'bg-slate-800 text-white font-bold' : 'bg-slate-50 font-semibold'
                  } ${l.total < 0 && l.tipo !== 'saida' && l.tipo !== 'acumulado' ? 'text-red-600' : ''}`}>
                    {fmt(l.total)}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums whitespace-nowrap sticky right-0 z-10 ${
                    l.tipo === 'acumulado' ? 'bg-slate-800 text-slate-400' : 'bg-slate-50 text-slate-600'
                  }`}>
                    {l.tipo === 'acumulado' ? '—' : fmt(l.media)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <GraficoDaTabela tabela={tabela} periodo={periodo} />

      <div className="px-4 py-2.5 border-t border-slate-200 bg-slate-50 text-[11px] text-slate-500 leading-relaxed">
        As colunas <strong>Total</strong> e <strong>Média</strong> ficam fixas à direita — role a
        tabela para ver o meio. Despesas aparecem negativas, como no demonstrativo em papel.
        {periodo.modo === 'anual'
          ? ' O ano corrente aparece esmaecido e não entra na média, por ainda estar em curso.'
          : ' Meses ainda não fechados ficam esmaecidos e não entram na média — nem os meses sem movimento, que diluiriam o resultado de quem começou a operar no meio do ano.'}
        {' '}<strong>Total e Média somam janelas diferentes:</strong> o Total inclui tudo que já está
        lançado, mesmo em períodos abertos; a Média só considera o que fechou. É por isso que os
        dois rótulos trazem o alcance de cada um.
        {tabela.linhas.some(l => l.tipo === 'acumulado') && (
          <> Na linha de <strong>acumulado</strong>, a coluna Total é o saldo no último mês
          fechado, não a soma das colunas.</>
        )}
      </div>
    </div>
  )
}

/**
 * O gráfico que acompanha cada tabela. Mesma leitura da planilha: barras para o
 * movimento do mês, linha para o que se acumula.
 *
 * Meses ainda não fechados entram esmaecidos — aparecem porque já têm
 * lançamento, mas não devem ser lidos como queda.
 */
function GraficoDaTabela({ tabela, periodo }: { tabela: Tabela; periodo: Periodo }) {
  const linha = (rotuloParcial: string) =>
    tabela.linhas.find(l => l.rotulo.toLowerCase().includes(rotuloParcial))?.valores ?? Array(12).fill(0)

  const dados = periodo.rotulos.map((r, i) => {
    const base: Record<string, string | number> = {
      mes: periodo.modo === 'anual' ? r : r.slice(0, 3),
      fechado: i < periodo.fechadas ? 1 : 0,
    }

    if (tabela.grafico === 'receita-despesa-lucro') {
      const receita = linha('receita bruta')[i]
      // Tudo que sai na parte de cima do demonstrativo, somado.
      const despesa = ['deduções', 'custo dos serviços', 'despesas administrativas', 'despesas financ']
        .reduce((s, r) => s + linha(r)[i], 0)
      base.Receita = receita
      base.Despesa = despesa
      base.Lucro = linha('lucro liquido')[i]
    } else if (tabela.grafico === 'empilhado') {
      base.Investimento = linha('investimento')[i]
      base['Empréstimo sócios'] = linha('empréstimo — sócios')[i]
      base['Empréstimo terceiros'] = linha('empréstimo — terceiros')[i]
      base['Parc. antiga'] = linha('parcelamento conta antiga')[i]
      base['Parc. atual'] = linha('parcelamento conta atual')[i]
      base['Parc. lucro presumido'] = linha('parcelamento lucro presumido')[i]
    } else {
      base.Lucro = linha('lucro')[i]
      base.Outros = linha('outros')[i]
      base.Acumulado = linha('acumulado')[i]
    }
    return base
  })

  const series =
    tabela.grafico === 'receita-despesa-lucro' ? ['Receita', 'Despesa']
    : tabela.grafico === 'empilhado' ? ['Investimento', 'Empréstimo sócios', 'Empréstimo terceiros',
                                        'Parc. antiga', 'Parc. atual', 'Parc. lucro presumido']
    : ['Lucro', 'Outros']

  const temDado = dados.some(d => series.some(k => Number(d[k] ?? 0) !== 0))
  if (!temDado) return null

  return (
    <div className="px-4 pt-4 pb-2 border-t border-slate-100">
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={dados} margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
          <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={fmtEixo} tick={{ fontSize: 10, fill: '#94a3b8' }}
                 axisLine={false} tickLine={false} width={54} />
          <Tooltip contentStyle={tooltipStyle}
                   formatter={(value, name) => [fmtCheio(Number(value)), String(name)]} />
          <Legend wrapperStyle={{ fontSize: 11 }} iconSize={9} />
          <ReferenceLine y={0} stroke="#cbd5e1" />
          {/* Divisa entre o que já fechou e o que ainda está correndo. Fica na
              última coluna encerrada, então a área à direita dela é o aberto. */}
          {periodo.fechadas > 0 && periodo.fechadas < periodo.rotulos.length && (
            <ReferenceLine
              x={periodo.modo === 'anual'
                ? periodo.rotulos[periodo.fechadas - 1]
                : periodo.rotulos[periodo.fechadas - 1].slice(0, 3)}
              stroke="#0f172a"
              strokeDasharray="4 3"
              label={{ value: 'hoje', position: 'top', fontSize: 10, fill: '#0f172a' }}
            />
          )}

          {tabela.grafico === 'receita-despesa-lucro' && (
            <>
              <Bar dataKey="Receita" fill="#1d4ed8" radius={[3, 3, 0, 0]}>
                {dados.map((d, i) => <Cell key={i} fillOpacity={d.fechado ? 1 : 0.3} />)}
              </Bar>
              <Bar dataKey="Despesa" fill="#b91c1c" radius={[0, 0, 3, 3]}>
                {dados.map((d, i) => <Cell key={i} fillOpacity={d.fechado ? 1 : 0.3} />)}
              </Bar>
              <Line type="monotone" dataKey="Lucro" stroke="#0f766e" strokeWidth={2.5} dot={{ r: 3 }} />
            </>
          )}

          {tabela.grafico === 'empilhado' && series.map((k, i) => (
            <Bar key={k} dataKey={k} stackId="fora" fill={CORES[i % CORES.length]}
                 radius={i === series.length - 1 ? [0, 0, 3, 3] : undefined}>
              {dados.map((d, j) => <Cell key={j} fillOpacity={d.fechado ? 1 : 0.3} />)}
            </Bar>
          ))}

          {tabela.grafico === 'lucro-caixa-acumulado' && (
            <>
              <Bar dataKey="Lucro" fill="#1d4ed8" radius={[3, 3, 0, 0]}>
                {dados.map((d, i) => <Cell key={i} fillOpacity={d.fechado ? 1 : 0.3} />)}
              </Bar>
              <Bar dataKey="Outros" fill="#b91c1c" radius={[0, 0, 3, 3]}>
                {dados.map((d, i) => <Cell key={i} fillOpacity={d.fechado ? 1 : 0.3} />)}
              </Bar>
              <Line type="monotone" dataKey="Acumulado" stroke="#0f766e" strokeWidth={2.5} dot={{ r: 3 }} />
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
