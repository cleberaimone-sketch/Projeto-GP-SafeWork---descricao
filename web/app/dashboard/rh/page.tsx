import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import RhCharts from './RhCharts'
import CtseHistorico from './CtseHistorico'
import Organograma from './Organograma'
import {
  ANO_REFERENCIA, INDICADORES_DP, INDICADORES_DP_2024, TAXA_TURNOVER, ORGANOGRAMA, TOTAL_PESSOAS,
  COLABORADORES_POR_TIPO_2025,
  CUSTO_2025_PLANILHA_MENSAL, CUSTO_2024_PLANILHA_MENSAL,
  CUSTO_2025_PLANILHA_TOTAL, CUSTO_2024_PLANILHA_TOTAL,
  CUSTO_2025_POR_UNIDADE, CUSTO_2025_POR_UNIDADE_TOTAL,
  CUSTO_2025_POR_VINCULO,
  MEDIA_SALARIAL_2025, MEDIA_SALARIAL_2024,
} from '@/lib/rh/dados'
import { carregarCustoPessoal } from '@/lib/rh/custo-pessoal'

const MESES_RH = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

const fmtReal = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

export default async function RhPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const sb = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Custo de pessoal real (Conta Azul) — ano atual + anterior p/ YoY
  const [custo, custoAnt] = await Promise.all([
    carregarCustoPessoal(sb, ANO_REFERENCIA),
    carregarCustoPessoal(sb, ANO_REFERENCIA - 1),
  ])

  const ultimo = custo.meses.length - 1
  const internoAtual = custo.internoMensal[ultimo] ?? 0
  const internoAntMes = custo.internoMensal[ultimo - 1] ?? internoAtual
  const varInterno = internoAntMes ? Math.round(((internoAtual - internoAntMes) / internoAntMes) * 100) : 0
  const externoAtual = custo.externoMensal[ultimo] ?? 0
  const totalAtual = internoAtual + externoAtual
  const custoMedioPorPessoa = Math.round(internoAtual / INDICADORES_DP.headcountFinal)

  // Headcount por grupo do organograma
  const porGrupo = ORGANOGRAMA.reduce<Record<string, number>>((acc, s) => {
    acc[s.grupo] = (acc[s.grupo] ?? 0) + s.pessoas.length
    return acc
  }, {})

  const mesLabel = custo.meses[ultimo] ?? '—'

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
              <p className="text-blue-100/90 text-sm">Custo de pessoal (Conta Azul) · Indicadores DP · Organograma · {ANO_REFERENCIA}</p>
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
              <p className="text-xl font-bold text-slate-900 tabular-nums">{fmtReal(internoAtual)}</p>
              <span className={`text-[11px] font-semibold tabular-nums ${varInterno <= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {varInterno >= 0 ? '↑' : '↓'}{Math.abs(varInterno)}%
              </span>
            </div>
            <p className="text-[11px] text-teal-700 uppercase tracking-wider font-medium">Folha Interna</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{mesLabel}/{ANO_REFERENCIA} · vs mês ant.</p>
          </div>

          <div className="relative bg-gradient-to-br from-amber-50 to-white rounded-xl p-4 border border-amber-200 overflow-hidden">
            <div className="absolute inset-y-0 left-0 w-1 bg-amber-500/80" />
            <p className="text-xl font-bold text-slate-900 tabular-nums mb-1">{fmtReal(externoAtual)}</p>
            <p className="text-[11px] text-amber-700 uppercase tracking-wider font-medium">Prestadores Externos</p>
            <p className="text-[10px] text-slate-500 mt-0.5">clínicas · Moha · instrutores</p>
          </div>

          <div className="bg-white rounded-xl p-4 border border-slate-200">
            <p className="text-xl font-bold text-slate-900 tabular-nums mb-1">{fmtReal(totalAtual)}</p>
            <p className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">Custo Total Gente</p>
            <p className="text-[10px] text-slate-400 mt-0.5">interno + externo</p>
          </div>

          <div className="bg-white rounded-xl p-4 border border-slate-200">
            <p className="text-xl font-bold text-slate-900 tabular-nums mb-1">{INDICADORES_DP.headcountFinal}</p>
            <p className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">Funcionários</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{fmtReal(custoMedioPorPessoa)}/pessoa</p>
          </div>

          <div className="bg-white rounded-xl p-4 border border-slate-200">
            <div className="flex items-baseline gap-2 mb-1">
              <p className="text-xl font-bold text-emerald-700 tabular-nums">{INDICADORES_DP.contratacoes}</p>
              <p className="text-xl font-bold text-red-700 tabular-nums">{INDICADORES_DP.desligamentos}</p>
            </div>
            <p className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">Admissões / Deslig.</p>
            <p className="text-[10px] text-slate-400 mt-0.5">no período</p>
          </div>

          <div className={`rounded-xl p-4 border ${TAXA_TURNOVER > 5 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
            <p className={`text-xl font-bold tabular-nums mb-1 ${TAXA_TURNOVER > 5 ? 'text-amber-800' : 'text-slate-900'}`}>{TAXA_TURNOVER.toFixed(1)}%</p>
            <p className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">Turnover</p>
            <p className="text-[10px] text-slate-400 mt-0.5">ref: &lt;5% saudável</p>
          </div>
        </div>

        {/* Quadro por tipo de contrato + Comparativo anual */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Quadro por Tipo de Contrato</h3>
              <span className="text-[10px] text-slate-400">planilha RH · {ANO_REFERENCIA}</span>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div className="bg-teal-50 rounded-lg p-3 border border-teal-200 text-center">
                <p className="text-2xl font-bold text-teal-800 tabular-nums">{COLABORADORES_POR_TIPO_2025.CLT}</p>
                <p className="text-[10px] text-teal-700 uppercase tracking-wider font-medium mt-1">CLT</p>
              </div>
              <div className="bg-sky-50 rounded-lg p-3 border border-sky-200 text-center">
                <p className="text-2xl font-bold text-sky-800 tabular-nums">{COLABORADORES_POR_TIPO_2025.PJ}</p>
                <p className="text-[10px] text-sky-700 uppercase tracking-wider font-medium mt-1">PJ</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 text-center">
                <p className="text-2xl font-bold text-slate-700 tabular-nums">{COLABORADORES_POR_TIPO_2025.Socio}</p>
                <p className="text-[10px] text-slate-600 uppercase tracking-wider font-medium mt-1">Sócio</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3 border border-amber-200 text-center">
                <p className="text-2xl font-bold text-amber-800 tabular-nums">{COLABORADORES_POR_TIPO_2025.Outros}</p>
                <p className="text-[10px] text-amber-700 uppercase tracking-wider font-medium mt-1">Outros</p>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 mt-3">
              Total: {COLABORADORES_POR_TIPO_2025.CLT + COLABORADORES_POR_TIPO_2025.PJ + COLABORADORES_POR_TIPO_2025.Socio + COLABORADORES_POR_TIPO_2025.Outros} colaboradores · Quadro físico (organograma): {TOTAL_PESSOAS} pessoas
            </p>
          </div>

          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Comparativo Anual (Movimentação)</h3>
              <span className="text-[10px] text-slate-400">planilha RH</span>
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider"></th>
                    <th className="text-right px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">2024</th>
                    <th className="text-right px-3 py-2 text-[10px] font-bold text-teal-700 uppercase tracking-wider">2025 (Jan-Nov)</th>
                    <th className="text-right px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Δ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="px-3 py-2 text-slate-700 font-medium">Headcount final</td>
                    <td className="px-3 py-2 text-right tabular-nums">{INDICADORES_DP_2024.headcountFinal}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-teal-800">{INDICADORES_DP.headcountFinal}</td>
                    <td className={`px-3 py-2 text-right tabular-nums text-[11px] font-semibold ${INDICADORES_DP.headcountFinal >= INDICADORES_DP_2024.headcountFinal ? 'text-emerald-700' : 'text-red-700'}`}>
                      {INDICADORES_DP.headcountFinal - INDICADORES_DP_2024.headcountFinal >= 0 ? '+' : ''}{INDICADORES_DP.headcountFinal - INDICADORES_DP_2024.headcountFinal}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-slate-700 font-medium">Contratações</td>
                    <td className="px-3 py-2 text-right tabular-nums">{INDICADORES_DP_2024.contratacoes}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-teal-800">{INDICADORES_DP.contratacoes}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[11px] font-semibold text-slate-500">
                      {INDICADORES_DP.contratacoes - INDICADORES_DP_2024.contratacoes >= 0 ? '+' : ''}{INDICADORES_DP.contratacoes - INDICADORES_DP_2024.contratacoes}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-slate-700 font-medium">Desligamentos</td>
                    <td className="px-3 py-2 text-right tabular-nums">{INDICADORES_DP_2024.desligamentos}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-teal-800">{INDICADORES_DP.desligamentos}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[11px] font-semibold text-slate-500">
                      {INDICADORES_DP.desligamentos - INDICADORES_DP_2024.desligamentos >= 0 ? '+' : ''}{INDICADORES_DP.desligamentos - INDICADORES_DP_2024.desligamentos}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-slate-700 font-medium">Turnover acumulado</td>
                    <td className="px-3 py-2 text-right tabular-nums">{INDICADORES_DP_2024.turnoverAcumulado.toFixed(1)}%</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-teal-800">{TAXA_TURNOVER.toFixed(1)}%</td>
                    <td className={`px-3 py-2 text-right tabular-nums text-[11px] font-semibold ${TAXA_TURNOVER <= INDICADORES_DP_2024.turnoverAcumulado ? 'text-emerald-700' : 'text-red-700'}`}>
                      {(TAXA_TURNOVER - INDICADORES_DP_2024.turnoverAcumulado).toFixed(1)}pp
                    </td>
                  </tr>
                  <tr className="bg-teal-50/40">
                    <td className="px-3 py-2 text-slate-700 font-medium">CTSE Total</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtReal(CUSTO_2024_PLANILHA_TOTAL)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-teal-800">{fmtReal(CUSTO_2025_PLANILHA_TOTAL)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[11px] font-semibold text-slate-500">parcial</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-slate-700 font-medium">Média Salarial</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtReal(MEDIA_SALARIAL_2024)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-teal-800">{fmtReal(MEDIA_SALARIAL_2025)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums text-[11px] font-semibold ${MEDIA_SALARIAL_2025 >= MEDIA_SALARIAL_2024 ? 'text-emerald-700' : 'text-red-700'}`}>
                      {MEDIA_SALARIAL_2025 >= MEDIA_SALARIAL_2024 ? '+' : ''}{(((MEDIA_SALARIAL_2025 - MEDIA_SALARIAL_2024) / MEDIA_SALARIAL_2024) * 100).toFixed(1)}%
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Custo por Unidade e por Vínculo — Planilha 2025 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Por Unidade (2/3) */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm lg:col-span-2">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Custo de Pessoal por Unidade — {ANO_REFERENCIA}</h3>
              <span className="text-[10px] text-slate-400">planilha RH (anualizado)</span>
            </div>
            <p className="text-[11px] text-slate-500 mb-4">Total: {fmtReal(CUSTO_2025_POR_UNIDADE_TOTAL)} · Mostra onde cada R$ da folha vai por empresa do grupo</p>
            <div className="space-y-2.5">
              {CUSTO_2025_POR_UNIDADE.map(u => {
                const pct = (u.total / CUSTO_2025_POR_UNIDADE_TOTAL) * 100
                return (
                  <div key={u.unidade}>
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-xs text-slate-700 font-medium">{u.unidade}</span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-bold text-slate-900 tabular-nums">{fmtReal(u.total)}</span>
                        <span className="text-[10px] text-slate-500 font-medium tabular-nums w-10 text-right">{pct.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-teal-500 to-teal-700 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Por Vínculo (1/3) */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Custo por Vínculo</h3>
              <span className="text-[10px] text-slate-400">{ANO_REFERENCIA}</span>
            </div>
            <div className="space-y-3">
              {CUSTO_2025_POR_VINCULO.map(v => {
                const pct = (v.total / CUSTO_2025_POR_UNIDADE_TOTAL) * 100
                const colorMap: Record<string, string> = {
                  teal:  'from-teal-50 to-white border-teal-200 text-teal-800',
                  sky:   'from-sky-50 to-white border-sky-200 text-sky-800',
                  amber: 'from-amber-50 to-white border-amber-200 text-amber-800',
                }
                return (
                  <div key={v.vinculo} className={`bg-gradient-to-br ${colorMap[v.cor]} rounded-lg p-3 border`}>
                    <div className="flex items-baseline justify-between">
                      <p className={`text-[11px] uppercase tracking-wider font-bold`}>{v.vinculo}</p>
                      <p className="text-[10px] font-semibold tabular-nums opacity-80">{pct.toFixed(1)}%</p>
                    </div>
                    <p className="text-lg font-bold text-slate-900 tabular-nums mt-1">{fmtReal(v.total)}</p>
                  </div>
                )
              })}
            </div>
            <p className="text-[10px] text-slate-400 mt-4 leading-relaxed">
              PJ representa <strong className="text-slate-600">{((CUSTO_2025_POR_VINCULO[1].total / CUSTO_2025_POR_UNIDADE_TOTAL) * 100).toFixed(0)}%</strong> do custo total —
              modelo majoritário do grupo (médicos, instrutores, consultores).
            </p>
          </div>
        </div>

        {/* CTSE histórico — planilha 2024 vs 2025 */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">CTSE Histórico (Planilha RH)</h2>
          <span className="text-[10px] text-slate-400">fonte: planilha manual de RH (Google Sheets)</span>
        </div>
        <div className="mb-8">
          <CtseHistorico
            meses={MESES_RH}
            ctse2025={CUSTO_2025_PLANILHA_MENSAL}
            ctse2024={CUSTO_2024_PLANILHA_MENSAL}
          />
        </div>

        {/* Gráficos de custo */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Acompanhamento de Custo de Pessoal</h2>
          <span className="text-[10px] text-slate-400">fonte: Conta Azul (lançamentos por categoria)</span>
        </div>
        <RhCharts
          meses={custo.meses}
          internoMensal={custo.internoMensal}
          externoMensal={custo.externoMensal}
          internoAnoAnterior={custoAnt.internoMensal}
          anoAtual={ANO_REFERENCIA}
          porTipo={custo.internoPorTipo}
          porDepto={custo.internoPorDepto}
        />

        {/* Prestadores externos */}
        {custo.externoPorRotulo.length > 0 && (
          <div className="bg-white rounded-xl p-5 border border-amber-200 shadow-sm mt-6">
            <h3 className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-1">Prestadores Externos — Acumulado {ANO_REFERENCIA}</h3>
            <p className="text-[11px] text-slate-400 mb-4">Custo de operação (não é folha interna): clínicas parceiras, repasse Moha, instrutores</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {custo.externoPorRotulo.map(e => (
                <div key={e.rotulo} className="bg-amber-50/60 rounded-lg p-3 border border-amber-100">
                  <p className="text-lg font-bold text-amber-800 tabular-nums">{fmtReal(e.valor)}</p>
                  <p className="text-[11px] text-slate-600 font-medium">{e.rotulo}</p>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 mt-3">Total externo {ANO_REFERENCIA}: {fmtReal(custo.totalExternoAno)} · Folha interna {ANO_REFERENCIA}: {fmtReal(custo.totalInternoAno)}</p>
          </div>
        )}

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
          Custo de pessoal puxado automaticamente do Conta Azul (categorias de folha/PJ/estágio/encargos), separando folha interna de prestadores externos.
          Indicadores de DP e organograma: planilha de RH + quadro físico (06/05/2026), em <code className="bg-slate-100 px-1 rounded">lib/rh/dados.ts</code>.
        </p>
      </div>
    </main>
  )
}
