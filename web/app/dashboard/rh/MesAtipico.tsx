'use client'

// Por que este mês de folha saiu do padrão.
//
// Julho/2026 custou 11% acima da mediana, e o mês teve seis desligamentos — a
// leitura natural seria rescisão. Ela é a QUARTA causa, com R$ 2.799 de
// R$ 19.526. O que puxou foi honorário de PJ da engenharia, R$ 9.072 acima do
// normal. Por isso o painel decompõe a variação inteira em vez de procurar a
// explicação esperada: senão confirmaria o palpite em vez de explicar o número.

const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)

export type Atipico = {
  mes: number
  total: number
  mediana_dos_outros_meses: number
  excedente: number
  excedente_pct: number | null
  causas: { categoria: string; valor: number; mediana: number; excedente: number }[]
  rescisoes: { descricao: string; valor: number }[]
}

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

/** Abaixo disto o mês está dentro da variação normal e não pede explicação. */
export const DESVIO_QUE_PEDE_EXPLICACAO = 8

/** Tira o código do plano de contas: "4.01.06 FGTS – Administrativo" → "FGTS – Administrativo". */
const semCodigo = (c: string) => c.replace(/^[\d.]+\s*/, '')

export default function MesAtipico({ dados }: { dados: Atipico | null }) {
  if (!dados || dados.excedente_pct === null) return null
  const acima = dados.excedente_pct >= DESVIO_QUE_PEDE_EXPLICACAO
  const abaixo = dados.excedente_pct <= -DESVIO_QUE_PEDE_EXPLICACAO
  if (!acima && !abaixo) return null

  // Abaixo da mediana, a decomposição por excedente positivo não explica nada —
  // as causas listadas são de alta. Diz o fato e para por aí.
  if (abaixo) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 mb-6">
        <p className="text-xs text-slate-700">
          <strong>{MESES[dados.mes - 1]}</strong> ficou {Math.abs(dados.excedente_pct).toFixed(0)}% abaixo
          da mediana dos outros meses ({brl(dados.total)} contra {brl(dados.mediana_dos_outros_meses)}).
          Vale conferir se falta lançamento antes de ler como economia.
        </p>
      </div>
    )
  }

  const explicado = dados.causas.reduce((s, c) => s + c.excedente, 0)

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 mb-6">
      <p className="text-sm font-semibold text-amber-900 mb-1">
        {MESES[dados.mes - 1]} ficou {dados.excedente_pct.toFixed(0)}% acima do normal
      </p>
      <p className="text-[11px] text-amber-800 mb-3">
        {brl(dados.total)} contra {brl(dados.mediana_dos_outros_meses)} de mediana dos outros meses —
        {' '}{brl(dados.excedente)} a mais. O que puxou:
      </p>

      <div className="space-y-1">
        {dados.causas.map(c => (
          <div key={c.categoria} className="flex items-baseline gap-2 text-[11px]">
            <span className="text-slate-700 truncate flex-1" title={c.categoria}>{semCodigo(c.categoria)}</span>
            <span className="text-slate-500 tabular-nums shrink-0">
              {brl(c.valor)} <span className="text-slate-400">(normal {brl(c.mediana)})</span>
            </span>
            <span className="font-semibold text-amber-900 tabular-nums shrink-0 w-[76px] text-right">
              +{brl(c.excedente)}
            </span>
          </div>
        ))}
      </div>

      {dados.rescisoes.length > 0 && (
        <div className="mt-3 pt-2 border-t border-amber-200">
          <p className="text-[10px] font-semibold text-amber-900 uppercase tracking-wider mb-1">
            Rescisões no mês
          </p>
          {dados.rescisoes.map((r, i) => (
            <div key={i} className="flex items-baseline justify-between gap-2 text-[11px]">
              <span className="text-slate-700 truncate">{r.descricao}</span>
              <span className="font-medium text-slate-800 tabular-nums shrink-0">{brl(r.valor)}</span>
            </div>
          ))}
          <p className="text-[10px] text-amber-800 mt-1">
            {(() => {
              const totalResc = dados.rescisoes.reduce((s, r) => s + r.valor, 0)
              const peso = dados.excedente > 0 ? (totalResc / dados.excedente) * 100 : 0
              return peso >= 50
                ? `São ${peso.toFixed(0)}% do excedente do mês — a rescisão explica o pico.`
                : `São ${peso.toFixed(0)}% do excedente. O grosso da alta veio das linhas acima, não da rescisão.`
            })()}
          </p>
        </div>
      )}

      <p className="text-[10px] text-amber-700 mt-3">
        As causas listadas somam {brl(explicado)} dos {brl(dados.excedente)} de excedente.
        A régua é a mediana dos outros meses, não a média — média deixaria este mês puxar a
        própria referência.
      </p>
    </div>
  )
}
