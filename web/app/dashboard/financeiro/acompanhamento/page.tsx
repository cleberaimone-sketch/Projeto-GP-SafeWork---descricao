// Acompanhamento — receita, despesa e lucro, empresa por empresa.
//
// Uma página só para olhar a evolução: o grupo no topo e cada unidade abaixo,
// no mesmo formato, para comparar de relance quem está subindo e quem está
// caindo. Sem tabela, sem dívida, sem saldo — só as três linhas que dizem se a
// operação melhora ou piora.
//
// O exercício anterior vem junto: sem ele, "subiu" e "caiu" só existem contra a
// média do próprio ano, que é uma régua curta demais para um negócio sazonal.

import { createClient as sb } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import AcompanhamentoClient, { type SerieUnidade, type SerieAnterior } from './AcompanhamentoClient'
import { mesAtualBrasilia } from '@/lib/formato/data'

export const dynamic = 'force-dynamic'

type RpcRow = { empresa_id: string; unidade: string; mes: number; linha: string; total: number }
type SP = { ano?: string }

const OPERACIONAIS = ['receita_bruta', 'deducoes', 'custo_servicos', 'despesas_admin', 'despesas_financeiras']

const GRUPO = 'TOTAL DO GRUPO'

/** Agrupa as linhas da RPC em unidade → linha do DRE → 12 meses. */
function pivotar(linhas: RpcRow[]) {
  const porUnidade = new Map<string, Map<string, number[]>>()
  for (const r of linhas) {
    if (!porUnidade.has(r.unidade)) porUnidade.set(r.unidade, new Map())
    const m = porUnidade.get(r.unidade)!
    if (!m.has(r.linha)) m.set(r.linha, Array(12).fill(0))
    m.get(r.linha)![r.mes - 1] += Number(r.total ?? 0)
  }
  return porUnidade
}

/** Soma todas as unidades numa série só — o consolidado do grupo. */
function consolidar(porUnidade: Map<string, Map<string, number[]>>) {
  const total = new Map<string, number[]>()
  for (const m of porUnidade.values()) {
    for (const [chave, serie] of m) {
      if (!total.has(chave)) total.set(chave, Array(12).fill(0))
      const alvo = total.get(chave)!
      for (let i = 0; i < 12; i++) alvo[i] += serie[i]
    }
  }
  return total
}

// Receita positiva, despesa em módulo (para a linha subir quando a despesa
// aumenta, que é como se lê o gráfico), lucro é a diferença.
function tresLinhas(m: Map<string, number[]>): Omit<SerieUnidade, 'unidade' | 'anterior'> {
  const receita = m.get('receita_bruta') ?? Array(12).fill(0)
  // As saídas vêm negativas da RPC; aqui viram positivas para o gráfico.
  const despesa = Array(12).fill(0)
  for (const c of OPERACIONAIS) {
    if (c === 'receita_bruta') continue
    const s = m.get(c)
    if (!s) continue
    for (let i = 0; i < 12; i++) despesa[i] += Math.abs(s[i])
  }
  const lucro = receita.map((v, i) => v - despesa[i])
  return { receita, despesa, lucro }
}

/**
 * Mesmas três linhas do exercício anterior, mais o mapa de quais meses tiveram
 * movimento. Sem esse mapa, um mês em que a unidade ainda não existia entraria
 * na comparação como zero — e um zero na base infla qualquer variação.
 */
function montarAnterior(m: Map<string, number[]>): SerieAnterior {
  const { receita, despesa, lucro } = tresLinhas(m)
  const temMovimento = receita.map((v, i) => v !== 0 || despesa[i] !== 0)
  return { receita, despesa, lucro, temMovimento }
}

export default async function AcompanhamentoPage({ searchParams }: { searchParams: Promise<SP> }) {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) redirect('/login')

  const filtros = await searchParams
  const hojeMes = mesAtualBrasilia()
  const anoCorrente = Number(hojeMes.slice(0, 4))
  const mesCorrente = Number(hojeMes.slice(5, 7))

  const anoPedido = Number(filtros.ano)
  const ano = Number.isInteger(anoPedido) && anoPedido >= 2024 && anoPedido <= anoCorrente
    ? anoPedido : anoCorrente

  const supabase = sb(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const [atual, passado] = await Promise.all([
    supabase.rpc('fn_dre_unidade_mensal', { p_ano: ano }),
    supabase.rpc('fn_dre_unidade_mensal', { p_ano: ano - 1 }),
  ])
  const error = atual.error
  const linhas = (atual.data ?? []) as RpcRow[]
  // Se o exercício anterior falhar, a página não cai junto: só perde a régua.
  const linhasAnt = passado.error ? [] : ((passado.data ?? []) as RpcRow[])

  const porUnidade = pivotar(linhas)
  const porUnidadeAnt = pivotar(linhasAnt)

  const anteriorDe = (nome: string): SerieAnterior | undefined => {
    const m = nome === GRUPO ? consolidar(porUnidadeAnt) : porUnidadeAnt.get(nome)
    if (!m) return undefined
    const s = montarAnterior(m)
    return s.temMovimento.some(Boolean) ? s : undefined
  }

  const unidades: SerieUnidade[] = [
    { unidade: GRUPO, ...tresLinhas(consolidar(porUnidade)), anterior: anteriorDe(GRUPO) },
    ...[...porUnidade.entries()]
      .map(([unidade, m]) => ({ unidade, ...tresLinhas(m), anterior: anteriorDe(unidade) }))
      // Maior faturamento primeiro, e fora quem não teve movimento no ano.
      .filter(u => u.receita.some(v => v !== 0) || u.despesa.some(v => v !== 0))
      .sort((a, b) =>
        b.receita.reduce((s, v) => s + v, 0) - a.receita.reduce((s, v) => s + v, 0)),
  ]

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
          <h1 className="text-2xl font-bold tracking-tight">Acompanhamento</h1>
          <p className="text-blue-100/90 text-sm">
            Receita, despesa e lucro mês a mês · {unidades.length - 1} unidades + grupo · exercício {ano}
          </p>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6 md:py-8">
        {error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-800">
            <p className="font-semibold mb-1">Não foi possível carregar o acompanhamento.</p>
            <p className="text-sm">{error.message}</p>
          </div>
        ) : (
          <Suspense>
            <AcompanhamentoClient
              ano={ano}
              anoCorrente={anoCorrente}
              unidades={unidades}
              mesesFechados={mesesFechados}
            />
          </Suspense>
        )}
      </div>
    </main>
  )
}
