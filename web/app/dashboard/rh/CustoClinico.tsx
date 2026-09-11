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
  CartesianGrid, Tooltip, Legend, ReferenceLine, Cell,
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


/**
 * Um gráfico só para cada prestador.
 *
 * No empilhado, quem é pequeno some: instrutores ficam numa faixa de poucos
 * pixels sob clínicas parceiras, que são dez vezes maiores. Separado, cada um
 * ganha a própria escala e a variação aparece.
 */
function CardPrestador({ rotulo, valores, meses, mesesFechados, cor }: {
  rotulo: string; valores: number[]; meses: string[]; mesesFechados: number; cor: string
}) {
  const fechados = valores.slice(0, mesesFechados)
  const acumulado = fechados.reduce((s, v) => s + v, 0)
  const media = fechados.length > 0 ? acumulado / fechados.length : 0
  const t = tendencia(valores, mesesFechados)

  const dados = meses.map((mes, i) => ({
    mes,
    valor: valores[i] ?? 0,
    // Meses à frente do corte têm só o que já foi lançado. Vão para outra
    // série para sair esmaecidos — senão a queda do calendário parece queda de
    // gasto, que foi exatamente como o painel enganava antes.
    previsto: i >= mesesFechados ? (valores[i] ?? 0) : 0,
    fechado: i < mesesFechados ? (valores[i] ?? 0) : 0,
  }))

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: cor }} />
        <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider truncate"
           title={rotulo}>{rotulo}</p>
      </div>

      <div className="flex items-baseline gap-3 mb-0.5">
        <div>
          <p className="text-base font-bold text-slate-800 tabular-nums leading-none">{brl(acumulado)}</p>
          <p className="text-[9px] text-slate-400 mt-0.5">acumulado · {mesesFechados} {mesesFechados === 1 ? 'mês' : 'meses'}</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-600 tabular-nums leading-none">{brl(media)}</p>
          <p className="text-[9px] text-slate-400 mt-0.5">média/mês</p>
        </div>
      </div>

      {t && (
        <p className={`text-[10px] font-medium mb-1 ${
          t.pct > 5 ? 'text-red-700' : t.pct < -5 ? 'text-emerald-700' : 'text-slate-500'}`}>
          {t.pct >= 0 ? '▲' : '▼'} {Math.abs(t.pct).toFixed(0)}% no trimestre
        </p>
      )}

      <ResponsiveContainer width="100%" height={92}>
        <ComposedChart data={dados} margin={{ top: 4, right: 2, left: 2, bottom: 0 }}>
          <XAxis dataKey="mes" tick={{ fontSize: 8, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                 interval={0} />
          <YAxis hide />
          <Tooltip contentStyle={tooltipStyle}
                   formatter={(v) => [brl(Number(v)), rotulo]}
                   labelFormatter={(l) => `${l}${meses.indexOf(String(l)) >= mesesFechados ? ' (só o lançado)' : ''}`} />
          <ReferenceLine y={media} stroke="#94a3b8" strokeDasharray="3 3" />
          <Bar dataKey="fechado" stackId="s" fill={cor} radius={[2, 2, 0, 0]} />
          <Bar dataKey="previsto" stackId="s" fill={cor} fillOpacity={0.28} radius={[2, 2, 0, 0]} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
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
          <> Do mês {meses[mesesFechados]} em diante aparece <strong>só o que já está lançado</strong>
          {' '}— barra clara. Não é queda: é vencimento futuro, e fica fora de acumulado, média e
          tendência.</>
        )}
      </p>

      {(() => {
        const totalFechado = series.reduce((soma, s) =>
          soma + s.valores.slice(0, mesesFechados).reduce((a, b) => a + b, 0), 0)
        const mediaMes = mesesFechados > 0 ? totalFechado / mesesFechados : 0
        const projecao = mediaMes * 12
        return (
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 mb-4 pb-3 border-b border-slate-200">
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider">Acumulado</p>
              <p className="text-lg font-bold text-slate-800 tabular-nums">{brl(totalFechado)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider">Média por mês</p>
              <p className="text-lg font-bold text-slate-800 tabular-nums">{brl(mediaMes)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider">No ritmo atual, 12 meses</p>
              <p className="text-lg font-semibold text-slate-600 tabular-nums">{brl(projecao)}</p>
            </div>
            <p className="text-[10px] text-slate-400 ml-auto self-end">
              sobre {mesesFechados} {mesesFechados === 1 ? 'mês fechado' : 'meses fechados'}
            </p>
          </div>
        )
      })()}

      {/* Um gráfico por prestador: no empilhado abaixo, quem é pequeno
          desaparece sob clínicas parceiras. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 mb-5">
        {series.map((s, i) => (
          <CardPrestador key={s.rotulo} rotulo={s.rotulo} valores={s.valores}
                         meses={meses} mesesFechados={mesesFechados} cor={cor(s.rotulo, i)} />
        ))}
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
            <Bar key={s.rotulo} yAxisId="r$" dataKey={s.rotulo} stackId="a" fill={cor(s.rotulo, i)}>
              {dados.map((_, j) => (
                <Cell key={j} fillOpacity={j >= mesesFechados ? 0.28 : 1} />
              ))}
            </Bar>
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
