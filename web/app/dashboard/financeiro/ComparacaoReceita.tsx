// As três leituras da variação de receita, lado a lado.
//
// Ver lib/financeiro/extraordinarios.ts para o porquê. Em resumo: a leitura
// bruta mostrava −8,7% quando a operação recorrente tinha caído 4,4% e a
// comparação sem o contrato atípico de 2025 daria +6,1%. Uma tela que exibe só
// a primeira faz o Cleber ler queda de dois dígitos onde não houve.

import type { ComparacaoReceita as Dados } from '@/lib/financeiro/extraordinarios'

const MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']

function fmt(v: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
  }).format(v)
}

function pct(v: number | null) {
  if (v === null) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
}

export default function ComparacaoReceita({ dados }: { dados: Dados | null }) {
  if (!dados || !dados.relevante) return null

  const { bruta, recorrente, ano, anoBase, ateMes } = dados
  const todos = [...dados.extraordinariosAtual, ...dados.extraordinariosBase]
    .sort((a, b) => b.valor - a.valor)
  const periodo = `jan–${MESES[ateMes - 1]}`
  const cor = (v: number | null) => v === null ? 'text-slate-500'
    : v >= 0 ? 'text-emerald-700' : 'text-red-700'

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h3 className="text-sm font-bold text-slate-800">
          Receita {ano} contra {anoBase} — duas leituras
        </h3>
        <span className="text-[10px] text-slate-400">{periodo}, mesmo período nos dois anos</span>
      </div>

      {dados.inverteSinal && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 mb-3">
          As duas leituras apontam para lados opostos. A diferença inteira está nos
          lançamentos atípicos listados abaixo — não na operação.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Tudo que entrou</p>
          <p className={`text-2xl font-bold tabular-nums mt-1 ${cor(bruta.variacao)}`}>{pct(bruta.variacao)}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {fmt(bruta.atual)} contra {fmt(bruta.base)}
          </p>
        </div>
        <div className="rounded-lg border-2 border-slate-300 p-3">
          <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
            Só o recorrente
          </p>
          <p className={`text-2xl font-bold tabular-nums mt-1 ${cor(recorrente.variacao)}`}>{pct(recorrente.variacao)}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {fmt(recorrente.atual)} contra {fmt(recorrente.base)} · sem os atípicos dos dois anos
          </p>
        </div>
      </div>

      <details className="mt-3">
        <summary className="text-[11px] text-slate-500 cursor-pointer hover:text-slate-700">
          {todos.length} lançamento{todos.length > 1 ? 's' : ''} fora do padrão da própria empresa
        </summary>
        <div className="mt-2">
          {todos.map((e, i) => (
            <div key={i} className="flex items-baseline gap-2 py-1.5 border-b border-slate-100 text-[11px]">
              <span className="text-slate-400 tabular-nums shrink-0 w-[68px]">
                {e.data_vencimento.slice(8, 10)}/{e.data_vencimento.slice(5, 7)}/{e.data_vencimento.slice(0, 4)}
              </span>
              <span className="font-medium text-slate-700 shrink-0">{e.nome_empresa}</span>
              <span className="text-slate-500 truncate" title={e.descricao ?? ''}>
                {e.descricao ?? '(sem descrição)'}
              </span>
              <span className="ml-auto text-slate-400 shrink-0">
                {e.vezes_a_mediana.toLocaleString('pt-BR')}× a mediana
              </span>
              <span className="font-semibold text-slate-800 tabular-nums shrink-0 w-[92px] text-right">
                {fmt(e.valor)}
              </span>
            </div>
          ))}
          <p className="text-[10px] text-slate-400 mt-2">
            Entram aqui os lançamentos de receita que passam de 5× a mediana da própria
            empresa e categoria, pesam ao menos 5% da receita dela no ano e não se repetem
            três vezes ou mais — valor grande que se repete todo mês é rotina, não evento.
          </p>
        </div>
      </details>
    </div>
  )
}
