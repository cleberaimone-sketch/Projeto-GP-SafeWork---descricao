import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import RhCharts from './RhCharts'
import Organograma from './Organograma'
import {
  ANO_REFERENCIA, MESES,
  CUSTO_TOTAL_MENSAL, CUSTO_POR_UNIDADE, CUSTO_POR_TIPO, CUSTO_POR_DEPTO,
  INDICADORES_DP, TAXA_TURNOVER, ORGANOGRAMA, TOTAL_PESSOAS,
} from '@/lib/rh/dados'

const fmtReal = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

export default async function RhPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const ultimo = MESES.length - 1
  const custoAtual = CUSTO_TOTAL_MENSAL[ultimo]
  const custoAnt = CUSTO_TOTAL_MENSAL[ultimo - 1] ?? custoAtual
  const varCusto = custoAnt ? Math.round(((custoAtual - custoAnt) / custoAnt) * 100) : 0
  const custoMedio = Math.round(CUSTO_TOTAL_MENSAL.reduce((s, v) => s + v, 0) / CUSTO_TOTAL_MENSAL.length)
  const custoMedioPorPessoa = Math.round(custoAtual / INDICADORES_DP.headcountFinal)

  // Headcount por grupo do organograma
  const porGrupo = ORGANOGRAMA.reduce<Record<string, number>>((acc, s) => {
    acc[s.grupo] = (acc[s.grupo] ?? 0) + s.pessoas.length
    return acc
  }, {})

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white">
        <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6">
          <a href="/dashboard" className="text-blue-200/80 text-sm hover:text-white inline-block mb-2">← Centro de Comando</a>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-teal-400 to-teal-600 text-white flex items-center justify-center text-xl font-bold shadow-lg">Le</div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">RH — Gestão de Pessoas</h1>
              <p className="text-blue-100/90 text-sm">Custo de pessoal · Indicadores DP · Organograma · {ANO_REFERENCIA}</p>
            </div>
            <div className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-full border bg-teal-500/20 border-teal-300/40 text-teal-100">
              <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
              <span className="text-xs font-medium">{TOTAL_PESSOAS} pessoas</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6 md:py-8">

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
          <div className="relative bg-gradient-to-br from-teal-50 to-white rounded-xl p-4 border border-teal-200 ring-1 ring-teal-100 overflow-hidden">
            <div className="absolute inset-y-0 left-0 w-1 bg-teal-500/80" />
            <div className="flex items-baseline justify-between mb-1">
              <p className="text-2xl font-bold text-slate-900 tabular-nums">{fmtReal(custoAtual)}</p>
              <span className={`text-[11px] font-semibold tabular-nums ${varCusto <= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {varCusto >= 0 ? '↑' : '↓'}{Math.abs(varCusto)}%
              </span>
            </div>
            <p className="text-[11px] text-teal-700 uppercase tracking-wider font-medium">Custo de Pessoal</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{MESES[ultimo]}/{ANO_REFERENCIA} · vs mês ant.</p>
          </div>

          <div className="bg-white rounded-xl p-4 border border-slate-200">
            <p className="text-2xl font-bold text-slate-900 tabular-nums mb-1">{fmtReal(custoMedio)}</p>
            <p className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">Custo Médio/Mês</p>
            <p className="text-[10px] text-slate-400 mt-0.5">média {MESES.length} meses</p>
          </div>

          <div className="bg-white rounded-xl p-4 border border-slate-200">
            <p className="text-2xl font-bold text-slate-900 tabular-nums mb-1">{INDICADORES_DP.headcountFinal}</p>
            <p className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">Funcionários</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{fmtReal(custoMedioPorPessoa)}/pessoa</p>
          </div>

          <div className="bg-white rounded-xl p-4 border border-slate-200">
            <p className="text-2xl font-bold text-emerald-700 tabular-nums mb-1">{INDICADORES_DP.contratacoes}</p>
            <p className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">Contratações</p>
            <p className="text-[10px] text-slate-400 mt-0.5">no período</p>
          </div>

          <div className="bg-white rounded-xl p-4 border border-slate-200">
            <p className="text-2xl font-bold text-red-700 tabular-nums mb-1">{INDICADORES_DP.desligamentos}</p>
            <p className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">Desligamentos</p>
            <p className="text-[10px] text-slate-400 mt-0.5">no período</p>
          </div>

          <div className={`rounded-xl p-4 border ${TAXA_TURNOVER > 5 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
            <p className={`text-2xl font-bold tabular-nums mb-1 ${TAXA_TURNOVER > 5 ? 'text-amber-800' : 'text-slate-900'}`}>{TAXA_TURNOVER.toFixed(1)}%</p>
            <p className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">Turnover</p>
            <p className="text-[10px] text-slate-400 mt-0.5">ref: &lt;5% saudável</p>
          </div>
        </div>

        {/* Gráficos de custo */}
        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">Acompanhamento de Custo de Pessoal</h2>
        <RhCharts
          meses={[...MESES]}
          totalMensal={CUSTO_TOTAL_MENSAL}
          porUnidade={CUSTO_POR_UNIDADE}
          porTipo={CUSTO_POR_TIPO}
          porDepto={CUSTO_POR_DEPTO}
        />

        {/* Distribuição de headcount por grupo */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-8 mb-2">
          {Object.entries(porGrupo).map(([grupo, qtd]) => (
            <div key={grupo} className="bg-white rounded-xl p-4 border border-slate-200 text-center">
              <p className="text-2xl font-bold text-teal-700 tabular-nums">{qtd}</p>
              <p className="text-[11px] text-slate-500 uppercase tracking-wider font-medium mt-0.5">{grupo}</p>
            </div>
          ))}
        </div>

        {/* Organograma */}
        <div className="mt-10">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Organograma</h2>
              <p className="text-xs text-slate-500">{TOTAL_PESSOAS} colaboradores · estrutura por área e clínica</p>
            </div>
          </div>
          <Organograma setores={ORGANOGRAMA} />
        </div>

        <p className="text-[10px] text-slate-400 mt-8">
          Dados de custo: planilha de RH (Jan–{MESES[ultimo]}/{ANO_REFERENCIA}). Organograma: quadro físico capturado em 06/05/2026.
          Atualização mensal manual em <code className="bg-slate-100 px-1 rounded">lib/rh/dados.ts</code>.
        </p>
      </div>
    </main>
  )
}
