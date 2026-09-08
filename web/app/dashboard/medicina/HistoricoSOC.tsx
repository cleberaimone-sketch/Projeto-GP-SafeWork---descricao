'use client'

// Série mensal do espelho local do SOC — a primeira visão de medicina que
// olha para trás. Até a carga do histórico, esta tela só sabia o mês corrente:
// lia o SOC ao vivo e não guardava nada, então "estamos atendendo mais ou
// menos que no ano passado" não tinha resposta.

import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  Tooltip, Legend, ReferenceLine, Cell,
} from 'recharts'

export type PontoSOC = { ano: number; mes: number; consultas: number; exames: number }

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

const VERDE = '#059669'
const VERDE_CLARO = '#6ee7b7'
const CINZA = '#94a3b8'

const num = (v: number) => v.toLocaleString('pt-BR')

export default function HistoricoSOC({ pontos, mesCorrente, anoCorrente }: {
  pontos: PontoSOC[]
  /** 1-12. O mês em curso está incompleto e não pode ser lido como queda. */
  mesCorrente: number
  anoCorrente: number
}) {
  if (!pontos.length) return null

  const anos = [...new Set(pontos.map(p => p.ano))].sort()
  const anoAnterior = anoCorrente - 1
  const doAno = (ano: number, mes: number) => pontos.find(p => p.ano === ano && p.mes === mes)

  const dados = MESES.map((m, i) => {
    const mes = i + 1
    const atual = doAno(anoCorrente, mes)
    const anterior = doAno(anoAnterior, mes)
    // O mês corrente tem dados só até hoje: entra no gráfico esmaecido, mas
    // fora de qualquer comparação — senão o mês em curso vira "queda".
    const parcial = mes >= mesCorrente
    return {
      mes: m,
      [String(anoCorrente)]: atual?.consultas ?? null,
      [String(anoAnterior)]: anterior?.consultas ?? null,
      parcial,
    }
  })

  // Acumulado só dos meses FECHADOS que existem nos dois anos — comparar
  // jan–ago com jan–dez diria qualquer coisa.
  const fechados = MESES.map((_, i) => i + 1)
    .filter(mes => mes < mesCorrente && doAno(anoCorrente, mes) && doAno(anoAnterior, mes))
  const somaAtual = fechados.reduce((s, mes) => s + (doAno(anoCorrente, mes)?.consultas ?? 0), 0)
  const somaAnterior = fechados.reduce((s, mes) => s + (doAno(anoAnterior, mes)?.consultas ?? 0), 0)
  const variacao = somaAnterior > 0 ? ((somaAtual - somaAnterior) / somaAnterior) * 100 : null
  const rotuloPeriodo = fechados.length
    ? `${MESES[fechados[0] - 1]}–${MESES[fechados[fechados.length - 1] - 1]}`
    : '—'

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="font-bold text-slate-800">Consultas ocupacionais — histórico</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Espelho local do SOC · {anos.join(' e ')} · atualizado todo dia às 4h30
          </p>
        </div>
        {variacao !== null && (
          <div className="text-right">
            <p className={`text-sm font-bold tabular-nums ${
              variacao >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              {variacao >= 0 ? '▲' : '▼'} {Math.abs(variacao).toFixed(1)}%
            </p>
            <p className="text-[10px] text-slate-400">
              {rotuloPeriodo}: {num(somaAtual)} contra {num(somaAnterior)} em {anoAnterior}
            </p>
          </div>
        )}
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={dados} margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
          <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={44} />
          <Tooltip
            contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}
            formatter={(v, n) => [num(Number(v)), String(n)]} />
          <Legend wrapperStyle={{ fontSize: 11 }} iconSize={9} />
          <ReferenceLine y={0} stroke="#cbd5e1" />
          <Bar dataKey={String(anoCorrente)} fill={VERDE} radius={[3, 3, 0, 0]}>
            {dados.map((d, i) => <Cell key={i} fillOpacity={d.parcial ? 0.3 : 1} />)}
          </Bar>
          <Line type="monotone" dataKey={String(anoAnterior)} stroke={CINZA}
                strokeWidth={2} strokeDasharray="4 3" dot={{ r: 2 }} connectNulls={false} />
        </ComposedChart>
      </ResponsiveContainer>

      <p className="text-[10px] text-slate-400 mt-1">
        Barra esmaecida é o mês em curso, ainda incompleto — fica fora da comparação acima.
        {' '}A linha tracejada é {anoAnterior}. Conta <strong>CONSULTA OCUPACIONAL</strong>;
        {' '}PACOTE ASO não entra porque acompanha a consulta e somar duplicaria.
      </p>

      <p className="text-[10px] text-amber-700 mt-2">
        Esta série discorda da planilha manual em alguns meses — outubro/2025 está zerado lá e
        tem {num(doAno(2025, 10)?.consultas ?? 0)} aqui. Enquanto a divergência não for
        resolvida, os dois números convivem: este vem do SOC, o painel de histórico abaixo vem
        da planilha.
      </p>
    </div>
  )
}
