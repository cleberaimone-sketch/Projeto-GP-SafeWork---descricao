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

      {unidades.map(u => (
        <GraficoUnidade key={u.unidade} serie={u} visao={visao} mesesFechados={mesesFechados} />
      ))}
    </div>
  )
}

function GraficoUnidade({ serie, visao, mesesFechados }: {
  serie: SerieUnidade; visao: Visao; mesesFechados: number
}) {
  const destaque = serie.unidade === 'TOTAL DO GRUPO'

  // Média dos meses COM MOVIMENTO já fechados — mesma regra do resto do
  // sistema. É ela que vira a linha tracejada de referência.
  const media = (s: number[]) => {
    const c = s.slice(0, mesesFechados).filter(v => v !== 0)
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
    fechado: i < mesesFechados,
  })), [serie, mesesFechados])

  const temDado = principal.some(v => v !== 0)
  if (!temDado) return null

  // O acumulado tem outra ordem de grandeza — no mesmo eixo ele achataria as
  // barras do mês. Vai num eixo próprio, à direita.
  const totalPeriodo = principal.slice(0, mesesFechados).reduce((a, b) => a + b, 0)
  const ultimoFechado = mesesFechados > 0 ? principal[mesesFechados - 1] : 0
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
            <span className="text-slate-400"> (até o último mês fechado)</span>
          </p>
        </div>
        {mesesFechados > 0 && (
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
    </div>
  )
}
