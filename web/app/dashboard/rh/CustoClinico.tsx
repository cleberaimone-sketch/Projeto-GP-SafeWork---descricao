'use client'

// Quanto custam os profissionais pagos por atendimento, mês a mês.
//
// Clínicas parceiras, médicos, fonoaudióloga/psicóloga, instrutores e o repasse
// Moha não são folha — entram por produção. Ficavam somados num total do ano,
// que responde "quanto foi" e não responde "está subindo?". Como acompanham o
// volume de atendimento, o que interessa é a tendência de cada um e o peso
// sobre a receita.

import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from 'recharts'

export type SerieRotulo = { rotulo: string; valores: number[] }

const CORES: Record<string, string> = {
  'Clínicas Parceiras': '#0ea5e9',
  'Médicos':            '#8b5cf6',
  'Fono / Psicologia':  '#ec4899',
  'Repasse Moha':       '#f59e0b',
  'Instrutores':        '#10b981',
}
const COR_RESERVA = ['#64748b', '#84cc16', '#06b6d4', '#a855f7']

const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)

const tooltipStyle = {
  backgroundColor: '#fff', border: '1px solid #e2e8f0',
  fontSize: 12, borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
}

/**
 * Variação dos últimos três meses fechados contra os três anteriores.
 *
 * Mês contra mês oscila demais nesta conta — um pagamento que atrasa uma semana
 * vira "queda de 30%". Trimestre móvel mostra a direção sem esse ruído.
 */
function tendencia(valores: number[], mesesFechados: number): { pct: number } | null {
  // Só meses FECHADOS. Incluir o mês em curso faz toda linha despencar: em
  // 11/09 as clínicas parceiras tinham R$ 10.604 contra os ~R$ 50 mil de um mês
  // inteiro, e a "queda de 39%" era só o calendário.
  const fechados = valores.slice(0, mesesFechados)
  if (fechados.length < 6) return null
  const ult3 = fechados.slice(-3).reduce((s, v) => s + v, 0)
  const ant3 = fechados.slice(-6, -3).reduce((s, v) => s + v, 0)
  if (ant3 <= 0) return null
  return { pct: ((ult3 - ant3) / ant3) * 100 }
}

export default function CustoClinico({ meses, series, receitaMensal, mesesFechados }: {
  meses: string[]
  series: SerieRotulo[]
  /** Receita do grupo por mês, para o custo aparecer como % dela. */
  receitaMensal?: number[]
  /** Quantos meses já fecharam — o último pode estar em curso. */
  mesesFechados: number
}) {
  if (series.length === 0) return null

  const dados = meses.map((mes, i) => {
    const linha: Record<string, string | number> = { mes }
    let total = 0
    for (const s of series) {
      linha[s.rotulo] = s.valores[i] ?? 0
      total += s.valores[i] ?? 0
    }
    linha.Total = total
    if (receitaMensal?.[i]) linha['% da receita'] = Number(((total / receitaMensal[i]) * 100).toFixed(1))
    return linha
  })

  const cor = (rotulo: string, i: number) => CORES[rotulo] ?? COR_RESERVA[i % COR_RESERVA.length]
  const temReceita = Boolean(receitaMensal?.some(v => v > 0))

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
        <h2 className="font-bold text-slate-800">Profissionais por atendimento — mês a mês</h2>
        <span className="text-[10px] text-slate-400">Conta Azul · não entra na folha</span>
      </div>
      <p className="text-[11px] text-slate-500 mb-4">
        Pagos por produção, então acompanham o volume de atendimento. O que importa é a
        direção de cada um{temReceita && ' e o peso sobre a receita'}.
        {mesesFechados < meses.length && (
          <> O último mês ({meses[meses.length - 1]}) ainda está em curso e fica fora das
          comparações.</>
        )}
      </p>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
        {series.map((s, i) => {
          const t = tendencia(s.valores, mesesFechados)
          const total = s.valores.reduce((a, b) => a + b, 0)
          return (
            <div key={s.rotulo} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: cor(s.rotulo, i) }} />
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider truncate"
                   title={s.rotulo}>{s.rotulo}</p>
              </div>
              <p className="text-lg font-bold text-slate-800 tabular-nums">{brl(total)}</p>
              {t ? (
                <p className={`text-[11px] font-medium mt-0.5 ${
                  t.pct > 5 ? 'text-red-700' : t.pct < -5 ? 'text-emerald-700' : 'text-slate-500'}`}>
                  {t.pct >= 0 ? '▲' : '▼'} {Math.abs(t.pct).toFixed(0)}% no trimestre
                </p>
              ) : (
                <p className="text-[11px] text-slate-400 mt-0.5">sem trimestre completo</p>
              )}
            </div>
          )
        })}
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={dados} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#64748b' }} />
          <YAxis yAxisId="r$" tick={{ fontSize: 10, fill: '#94a3b8' }}
                 tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
          {temReceita && (
            <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 10, fill: '#94a3b8' }}
                   tickFormatter={(v: number) => `${v}%`} />
          )}
          <Tooltip contentStyle={tooltipStyle}
                   formatter={(v, n) => String(n) === '% da receita'
                     ? [`${v}%`, String(n)] : [brl(Number(v)), String(n)]} />
          <Legend wrapperStyle={{ fontSize: 11 }} iconSize={9} />
          {series.map((s, i) => (
            <Bar key={s.rotulo} yAxisId="r$" dataKey={s.rotulo} stackId="a" fill={cor(s.rotulo, i)} />
          ))}
          {temReceita && (
            <Line yAxisId="pct" type="monotone" dataKey="% da receita" stroke="#1e293b"
                  strokeWidth={2} dot={{ r: 3 }} />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      <p className="text-[10px] text-slate-400 mt-2">
        A barra empilhada é o gasto por tipo de profissional
        {temReceita && '; a linha preta é o total como percentual da receita do grupo no mês'}.
        O percentual no card compara os três últimos meses com os três anteriores — mês contra
        mês, um pagamento que atrasa uma semana viraria queda de 30%.
      </p>
    </div>
  )
}
