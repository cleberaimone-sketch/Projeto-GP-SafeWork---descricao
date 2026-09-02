'use client'

import { useState, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  Tooltip, Legend, ReferenceLine, Cell,
} from 'recharts'

export type SerieUnidade = {
  unidade: string
  receita: number[]
  despesa: number[]
  lucro: number[]
  acumulado: number[]
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

// As cores do modelo que o Cleber trouxe (Google Sheets), para o gráfico ser
// reconhecível: receita azul, despesa vermelha, lucro amarelo.
const AZUL = '#4285f4'
const VERMELHO = '#ea4335'
const AMARELO = '#f9ab00'
const VERDE = '#0f766e'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const eixo = (v: number) => {
  const a = Math.abs(v)
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}mi`
  if (a >= 1_000)     return `${(v / 1_000).toFixed(0)}k`
  return String(Math.round(v))
}
const tooltipStyle = {
  backgroundColor: '#fff', border: '1px solid #e2e8f0',
  borderRadius: 8, fontSize: 12, color: '#1e293b',
}

type Visao = 'completo' | 'lucro' | 'despesa' | 'receita'

const VISOES: { chave: Visao; rotulo: string; dica: string }[] = [
  { chave: 'completo', rotulo: 'Receita, despesa e lucro', dica: 'As três séries juntas, como na planilha' },
  { chave: 'lucro',    rotulo: 'Só lucro',                 dica: 'Isola o lucro para ver a tendência' },
  { chave: 'despesa',  rotulo: 'Só despesa',               dica: 'Isola a despesa: está subindo ou caindo?' },
  { chave: 'receita',  rotulo: 'Só receita',               dica: 'Isola o faturamento' },
]

export default function AcompanhamentoClient({
  ano, anoCorrente, unidades, mesesFechados,
}: {
  ano: number
  anoCorrente: number
  unidades: SerieUnidade[]
  mesesFechados: number
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [visao, setVisao] = useState<Visao>('completo')

  // Quais meses entram no acumulado e na média. Começa nos fechados, mas dá
  // para tirar um mês atípico — agosto/2026, por exemplo, tem o projeto
  // fechado da Safe+ e sozinho puxa a média do grupo para cima.
  const [selecionados, setSelecionados] = useState<Set<number>>(
    () => new Set(Array.from({ length: mesesFechados }, (_, i) => i)))

  const alternarMes = (i: number) => setSelecionados(atual => {
    const novo = new Set(atual)
    if (novo.has(i)) novo.delete(i); else novo.add(i)
    return novo
  })

  const trocarAno = (a: number) => {
    const p = new URLSearchParams(params.toString())
    p.set('ano', String(a))
    router.push(`/dashboard/financeiro/acompanhamento?${p}`)
  }

  const anos = Array.from({ length: anoCorrente - 2024 + 1 }, (_, i) => 2024 + i).reverse()

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-end gap-5">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5">Exercício</p>
          <div className="flex gap-1">
            {anos.map(a => (
              <button key={a} onClick={() => trocarAno(a)}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  a === ano ? 'bg-blue-900 text-white border-blue-900'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                {a}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5">O que mostrar</p>
          <div className="flex flex-wrap gap-1">
            {VISOES.map(v => (
              <button key={v.chave} onClick={() => setVisao(v.chave)} title={v.dica}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  v.chave === visao ? 'bg-blue-900 text-white border-blue-900'
                                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                {v.rotulo}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">
            Meses no acumulado e na média
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => setSelecionados(new Set(Array.from({ length: mesesFechados }, (_, i) => i)))}
              className="px-2.5 py-1 text-[11px] rounded-lg border border-slate-200 text-slate-600 hover:border-slate-300">
              Só meses fechados
            </button>
            <button
              onClick={() => setSelecionados(new Set(Array.from({ length: 12 }, (_, i) => i)))}
              className="px-2.5 py-1 text-[11px] rounded-lg border border-slate-200 text-slate-600 hover:border-slate-300">
              Ano todo
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {MESES.map((m, i) => {
            const ativo = selecionados.has(i)
            const fechado = i < mesesFechados
            return (
              <button key={m} onClick={() => alternarMes(i)}
                title={fechado ? undefined : 'mês ainda não fechado'}
                className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                  ativo ? 'bg-blue-900 text-white border-blue-900'
                        : `bg-white border-slate-200 hover:border-slate-300 ${
                            fechado ? 'text-slate-600' : 'text-slate-300'}`}`}>
                {m}
              </button>
            )
          })}
        </div>
        {selecionados.size === 0 && (
          <p className="text-[11px] text-amber-700 mt-2">
            Nenhum mês selecionado — o acumulado e a média ficam zerados.
          </p>
        )}
      </div>

      {unidades.map(u => (
        <GraficoUnidade key={u.unidade} serie={u} visao={visao}
                        mesesFechados={mesesFechados} selecionados={selecionados} />
      ))}
    </div>
  )
}

function GraficoUnidade({ serie, visao, mesesFechados, selecionados }: {
  serie: SerieUnidade; visao: Visao; mesesFechados: number; selecionados: Set<number>
}) {
  const destaque = serie.unidade === 'TOTAL DO GRUPO'

  // Média dos meses SELECIONADOS que tiveram movimento. Antes a janela era
  // fixa nos meses fechados; agora quem escolhe é o seletor, então dá para
  // tirar um mês atípico da conta sem tirá-lo do gráfico.
  const media = (s: number[]) => {
    const c = s.filter((v, i) => selecionados.has(i) && v !== 0)
    return c.length ? c.reduce((a, b) => a + b, 0) / c.length : 0
  }

  const principal = visao === 'despesa' ? serie.despesa
                  : visao === 'lucro'   ? serie.lucro
                  : serie.receita
  const mediaPrincipal = media(principal)

  const dados = useMemo(() => MESES.map((m, i) => ({
    mes: m,
    Receita: serie.receita[i],
    Despesa: serie.despesa[i],
    Lucro: serie.lucro[i],
    Acumulado: serie.acumulado[i],
    // "fechado" aqui é o que ENTRA na conta — o mês fora da seleção fica
    // esmaecido do mesmo jeito que um mês em curso.
    fechado: selecionados.has(i),
  })), [serie, selecionados])

  const temDado = principal.some(v => v !== 0)
  if (!temDado) return null

  // O acumulado tem outra ordem de grandeza — no mesmo eixo ele achataria as
  // barras do mês. Vai num eixo próprio, à direita.
  const totalPeriodo = principal.reduce((a, v, i) => selecionados.has(i) ? a + v : a, 0)
  // Compara com o último mês SELECIONADO, não com o último fechado: se agosto
  // saiu da conta, não faz sentido a variação ainda apontar para agosto.
  const indicesSel = [...selecionados].sort((a, b) => a - b)
  const ultimoFechado = indicesSel.length ? principal[indicesSel[indicesSel.length - 1]] : 0
  const variacao = mediaPrincipal !== 0
    ? ((ultimoFechado - mediaPrincipal) / Math.abs(mediaPrincipal)) * 100
    : 0
  // Em despesa, subir é ruim; nas outras, subir é bom.
  const bom = visao === 'despesa' ? variacao <= 0 : variacao >= 0

  return (
    <div className={`bg-white rounded-xl p-4 border ${
      destaque ? 'border-blue-300 shadow-sm' : 'border-slate-200'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h2 className={`font-bold ${destaque ? 'text-blue-900 text-lg' : 'text-slate-800'}`}>
            {serie.unidade}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Média {brl(mediaPrincipal)} · Acumulado {brl(totalPeriodo)}
            <span className="text-slate-400">
              {' '}({selecionados.size} {selecionados.size === 1 ? 'mês' : 'meses'} na conta)
            </span>
          </p>
        </div>
        {selecionados.size > 0 && (
          <div className="text-right">
            <p className={`text-sm font-bold tabular-nums ${bom ? 'text-emerald-700' : 'text-red-700'}`}>
              {variacao >= 0 ? '▲' : '▼'} {Math.abs(variacao).toFixed(0)}%
            </p>
            <p className="text-[10px] text-slate-400">último mês vs média</p>
          </div>
        )}
      </div>

      <ResponsiveContainer width="100%" height={destaque ? 300 : 240}>
        <ComposedChart data={dados} margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
          <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="mes" tickFormatter={eixo} tick={{ fontSize: 10, fill: '#94a3b8' }}
                 axisLine={false} tickLine={false} width={52} />
          <YAxis yAxisId="acum" orientation="right" tickFormatter={eixo}
                 tick={{ fontSize: 10, fill: '#0f766e' }} axisLine={false} tickLine={false} width={52} />
          <Tooltip contentStyle={tooltipStyle}
                   formatter={(value, name) => [brl(Number(value)), String(name)]} />
          <Legend wrapperStyle={{ fontSize: 11 }} iconSize={9} />
          <ReferenceLine yAxisId="mes" y={0} stroke="#cbd5e1" />
          {mediaPrincipal !== 0 && (
            <ReferenceLine yAxisId="mes" y={mediaPrincipal} stroke="#94a3b8" strokeDasharray="4 3"
              label={{ value: 'média', position: 'left', fontSize: 9, fill: '#64748b' }} />
          )}
          {mesesFechados > 0 && mesesFechados < 12 && (
            <ReferenceLine yAxisId="mes" x={MESES[mesesFechados - 1]} stroke="#0f172a" strokeDasharray="3 3"
              label={{ value: 'hoje', position: 'top', fontSize: 9, fill: '#0f172a' }} />
          )}

          {visao === 'completo' && (
            <>
              <Bar yAxisId="mes" dataKey="Receita" fill={AZUL} radius={[3, 3, 0, 0]}>
                {dados.map((d, i) => <Cell key={i} fillOpacity={d.fechado ? 1 : 0.3} />)}
              </Bar>
              <Line yAxisId="mes" type="monotone" dataKey="Despesa" stroke={VERMELHO} strokeWidth={2} dot={{ r: 2.5 }} />
              <Line yAxisId="mes" type="monotone" dataKey="Lucro" stroke={AMARELO} strokeWidth={2} dot={{ r: 2.5 }} />
            </>
          )}

          {visao !== 'completo' && (
            <Bar yAxisId="mes"
                 dataKey={visao === 'lucro' ? 'Lucro' : visao === 'despesa' ? 'Despesa' : 'Receita'}
                 radius={[3, 3, 0, 0]}>
              {dados.map((d, i) => (
                <Cell key={i}
                  fill={visao === 'despesa' ? VERMELHO : visao === 'lucro' ? AMARELO : AZUL}
                  fillOpacity={d.fechado ? 1 : 0.3} />
              ))}
            </Bar>
          )}

          <Line yAxisId="acum" type="monotone" dataKey="Acumulado"
                stroke={VERDE} strokeWidth={2} strokeDasharray="5 3" dot={false} />
        </ComposedChart>
      </ResponsiveContainer>

      <p className="text-[10px] text-slate-400 mt-1">
        Barras e linhas cheias no eixo da esquerda (valor do mês). O <strong>acumulado do lucro</strong>,
        tracejado em verde, tem eixo próprio à direita — no mesmo eixo ele achataria as barras.
      </p>

      <ResumoPeriodo serie={serie} selecionados={selecionados} />
    </div>
  )
}

/**
 * Fechamento do card: as três séries somadas e em média, até o último mês
 * fechado. É o retrato do que o gráfico mostra mês a mês.
 *
 * Acumulado e média vão em blocos separados, cada um com sua própria escala de
 * barra. Juntos não funcionaria: o acumulado é da ordem de milhões e a média
 * de centenas de milhares, então a barra da média sumiria.
 */
function ResumoPeriodo({ serie, selecionados }: {
  serie: SerieUnidade; selecionados: Set<number>
}) {
  if (selecionados.size === 0) return null

  const soma = (s: number[]) => s.reduce((a, v, i) => selecionados.has(i) ? a + v : a, 0)
  const media = (s: number[]) => {
    const c = s.filter((v, i) => selecionados.has(i) && v !== 0)
    return c.length ? c.reduce((a, b) => a + b, 0) / c.length : 0
  }

  const linhas = [
    { rotulo: 'Receita', cor: AZUL,     acum: soma(serie.receita), med: media(serie.receita) },
    { rotulo: 'Despesa', cor: VERMELHO, acum: soma(serie.despesa), med: media(serie.despesa) },
    { rotulo: 'Lucro',   cor: AMARELO,  acum: soma(serie.lucro),   med: media(serie.lucro) },
  ]

  // Rótulo do período: intervalo quando é contínuo, lista quando tem furo.
  const idx = [...selecionados].sort((a, b) => a - b)
  const contiguo = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1)
  const ateMes = contiguo
    ? (idx.length === 1 ? MESES[idx[0]] : `${MESES[idx[0]]}–${MESES[idx[idx.length - 1]]}`)
    : idx.map(i => MESES[i]).join(', ')
  const maiorAcum = Math.max(1, ...linhas.map(l => Math.abs(l.acum)))
  const maiorMed  = Math.max(1, ...linhas.map(l => Math.abs(l.med)))

  const bloco = (titulo: string, valor: (l: typeof linhas[number]) => number, maior: number) => (
    <div className="flex-1 min-w-[240px]">
      <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1.5">{titulo}</p>
      <div className="space-y-1.5">
        {linhas.map(l => {
          const v = valor(l)
          return (
            <div key={l.rotulo} className="flex items-center gap-2">
              <span className="text-[11px] text-slate-600 w-14 shrink-0">{l.rotulo}</span>
              <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden min-w-0">
                <div className="h-full rounded-full"
                     style={{
                       width: `${(Math.abs(v) / maior) * 100}%`,
                       backgroundColor: v < 0 ? VERMELHO : l.cor,
                     }} />
              </div>
              <span className={`text-[11px] font-semibold tabular-nums w-24 text-right shrink-0 ${
                v < 0 ? 'text-red-700' : 'text-slate-700'}`}>
                {brl(v)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-6">
      {bloco(`Acumulado · ${ateMes}`, l => l.acum, maiorAcum)}
      {bloco(`Média mensal · ${ateMes}`, l => l.med, maiorMed)}
    </div>
  )
}
