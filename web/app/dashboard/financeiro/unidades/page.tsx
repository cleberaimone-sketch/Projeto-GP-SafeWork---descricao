// DRE por unidade — a versão viva da planilha "DRE - Resumido" que era
// preenchida à mão a partir do Conta Azul. Uma linha do DRE por vez, um
// gráfico por unidade, mês a mês, com a média marcada.

import { createClient as sb } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import UnidadesClient, { type LinhaDre, type PontoUnidade } from './UnidadesClient'
import { mesAtualBrasilia } from '@/lib/formato/data'

export const dynamic = 'force-dynamic'

type RpcRow = { empresa_id: string; unidade: string; mes: number; linha: string; total: number; qtd: number }

export default async function UnidadesPage({
  searchParams,
}: {
  searchParams: Promise<{ ano?: string }>
}) {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const hojeMes = mesAtualBrasilia()             // "YYYY-MM" no fuso de Brasília
  const anoCorrente = Number(hojeMes.slice(0, 4))
  const mesCorrente = Number(hojeMes.slice(5, 7))

  const anoPedido = Number(params.ano)
  const ano = Number.isInteger(anoPedido) && anoPedido >= 2024 && anoPedido <= anoCorrente
    ? anoPedido
    : anoCorrente

  const supabase = sb(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data, error } = await supabase.rpc('fn_dre_unidade_mensal', { p_ano: ano })
  const linhas = (error ? [] : (data ?? [])) as RpcRow[]

  // Pivô: unidade → linha do DRE → 12 meses.
  const porUnidade = new Map<string, Map<string, number[]>>()
  for (const r of linhas) {
    if (!porUnidade.has(r.unidade)) porUnidade.set(r.unidade, new Map())
    const linhasDaUnidade = porUnidade.get(r.unidade)!
    if (!linhasDaUnidade.has(r.linha)) linhasDaUnidade.set(r.linha, Array(12).fill(0))
    linhasDaUnidade.get(r.linha)![r.mes - 1] = Number(r.total ?? 0)
  }

  // Linhas derivadas — as mesmas somas que a planilha fazia:
  //   Lucro Líquido = receita + deduções + custo + adm + financeiras (já com sinal)
  //   Caixa         = lucro líquido + investimento + empréstimo + parcelamentos
  const OPERACIONAIS = ['receita_bruta', 'deducoes', 'custo_servicos', 'despesas_admin', 'despesas_financeiras']
  const NAO_OPERACIONAIS = ['investimentos', 'emprestimos_socios', 'parc_contas_antigas', 'parc_contas_atuais', 'parc_lucro_presumido', 'parc_outros']

  const somaLinhas = (m: Map<string, number[]>, chaves: string[]) => {
    const out = Array(12).fill(0)
    for (const c of chaves) {
      const serie = m.get(c)
      if (!serie) continue
      for (let i = 0; i < 12; i++) out[i] += serie[i]
    }
    return out
  }

  const unidades: PontoUnidade[] = [...porUnidade.entries()]
    .map(([unidade, m]) => {
      const lucro = somaLinhas(m, OPERACIONAIS)
      const naoOp = somaLinhas(m, NAO_OPERACIONAIS)
      const caixa = lucro.map((v, i) => v + naoOp[i])
      const series: Record<string, number[]> = {}
      for (const [k, v] of m) series[k] = v
      series.lucro_liquido = lucro
      series.caixa = caixa
      return { unidade, series }
    })
    // maior faturamento primeiro — a ordem que interessa ao ler o painel
    .sort((a, b) =>
      (b.series.receita_bruta ?? []).reduce((s, v) => s + v, 0) -
      (a.series.receita_bruta ?? []).reduce((s, v) => s + v, 0))

  // Consolidado do grupo, para o gráfico "Total"
  const total: Record<string, number[]> = {}
  for (const u of unidades) {
    for (const [k, serie] of Object.entries(u.series)) {
      if (!total[k]) total[k] = Array(12).fill(0)
      for (let i = 0; i < 12; i++) total[k][i] += serie[i]
    }
  }

  // Média sobre meses FECHADOS. O mês corrente ainda está correndo e os
  // futuros só têm o que já foi lançado — incluí-los puxaria a média para
  // baixo e faria toda unidade parecer em queda.
  const mesesFechados = ano < anoCorrente ? 12 : Math.max(0, mesCorrente - 1)

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white">
        <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6">
          <div className="flex items-center gap-3 mb-2">
            <a href="/dashboard/financeiro" className="text-blue-200/80 text-sm hover:text-white">← Financeiro</a>
            <span className="text-blue-300">·</span>
            <a href="/dashboard" className="text-blue-200/80 text-sm hover:text-white">Centro de Comando</a>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">DRE por Unidade</h1>
          <p className="text-blue-100/90 text-sm">
            {unidades.length} unidades · exercício {ano} · Conta Azul
            {mesesFechados > 0 && ` · média sobre ${mesesFechados} ${mesesFechados === 1 ? 'mês fechado' : 'meses fechados'}`}
          </p>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6 md:py-8">
        {error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-800">
            <p className="font-semibold mb-1">Não foi possível carregar o DRE por unidade.</p>
            <p className="text-sm">{error.message}</p>
          </div>
        ) : unidades.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500">
            Nenhum lançamento classificado no plano de contas para {ano}.
          </div>
        ) : (
          <Suspense>
            <UnidadesClient
              ano={ano}
              anoCorrente={anoCorrente}
              mesesFechados={mesesFechados}
              unidades={unidades}
              total={total as LinhaDre}
            />
          </Suspense>
        )}
      </div>
    </main>
  )
}
