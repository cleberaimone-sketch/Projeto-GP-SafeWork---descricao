// Saldo Devedor — quanto o grupo ainda deve e como isso amortiza.
//
// A página de Atrasados responde "o que está atrasado e há quanto tempo".
// Esta responde outra pergunta: "quanto ainda devo no total". A diferença
// importa porque Atrasados corta o que ainda vai vencer e recorta por ano,
// então deixa de fora tanto o futuro quanto o atraso de anos anteriores — que
// hoje é a maior parte da dívida.

import { createClient as sb } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import DividaClient, { type ItemCategoria, type PontoCronograma } from './DividaClient'
import { mesAtualBrasilia } from '@/lib/formato/data'

export const dynamic = 'force-dynamic'

type SP = { ano?: string; empresa?: string }

export default async function DividaPage({ searchParams }: { searchParams: Promise<SP> }) {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) redirect('/login')

  const filtros = await searchParams
  const anoCorrente = Number(mesAtualBrasilia().slice(0, 4))

  // "tudo" é o padrão: o saldo devedor não respeita exercício — o atraso de
  // 2025 continua sendo dívida hoje.
  const anoPedido = Number(filtros.ano)
  const ano = Number.isInteger(anoPedido) && anoPedido >= 2024 && anoPedido <= anoCorrente
    ? anoPedido
    : null
  const empresaId = filtros.empresa || null

  const supabase = sb(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const [{ data: empresas }, { data: catRaw, error: erroCat }, { data: cronRaw, error: erroCron }] =
    await Promise.all([
      supabase.from('empresas').select('id, nome_curto').order('nome_curto'),
      supabase.rpc('fn_divida_por_categoria', { p_ano: ano, p_empresa_id: empresaId }),
      supabase.rpc('fn_divida_cronograma', { p_empresa_id: empresaId }),
    ])

  const erro = erroCat ?? erroCron

  const categorias: ItemCategoria[] = ((catRaw ?? []) as Record<string, unknown>[])
    .map(r => ({
      categoria: String(r.categoria ?? '—'),
      emAberto: Number(r.em_aberto ?? 0),
      jaPago: Number(r.ja_pago ?? 0),
      total: Number(r.total ?? 0),
      atrasado: Number(r.atrasado ?? 0),
      aVencer: Number(r.a_vencer ?? 0),
      titulos: Number(r.titulos_abertos ?? 0),
    }))
    .sort((a, b) => b.emAberto - a.emAberto)

  // Cronograma: mes = null significa "já venceu".
  const linhas = ((cronRaw ?? []) as Record<string, unknown>[]).map(r => ({
    mes: r.mes ? String(r.mes).slice(0, 7) : null,
    valor: Number(r.valor ?? 0),
    titulos: Number(r.titulos ?? 0),
  }))

  const vencido = linhas.find(l => l.mes === null)
  const atrasadoTotal = vencido?.valor ?? 0
  const atrasadoTitulos = vencido?.titulos ?? 0

  const futuros: PontoCronograma[] = linhas
    .filter((l): l is { mes: string; valor: number; titulos: number } => l.mes !== null)
    .sort((a, b) => a.mes.localeCompare(b.mes))
    .map(l => ({ mes: l.mes, valor: l.valor, titulos: l.titulos, saldoApos: 0 }))

  const aVencerTotal = futuros.reduce((s, f) => s + f.valor, 0)
  const saldoTotal = atrasadoTotal + aVencerTotal

  // Curva descendente: parte do total devido e desconta o que vence a cada mês.
  // Não chega a zero porque o atrasado não some com o tempo — só com pagamento.
  let restante = saldoTotal
  for (const f of futuros) {
    restante -= f.valor
    f.saldoApos = restante
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white">
        <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6">
          <div className="flex items-center gap-3 mb-2">
            <a href="/dashboard/financeiro" className="text-blue-200/80 text-sm hover:text-white">← Financeiro</a>
            <span className="text-blue-300">·</span>
            <a href="/dashboard/financeiro/atrasados" className="text-blue-200/80 text-sm hover:text-white">Atrasados</a>
            <span className="text-blue-300">·</span>
            <a href="/dashboard" className="text-blue-200/80 text-sm hover:text-white">Centro de Comando</a>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Saldo Devedor</h1>
          <p className="text-blue-100/90 text-sm">
            Tudo em aberto — atrasado e a vencer, de todos os exercícios · Conta Azul
          </p>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6 md:py-8">
        {erro ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-800">
            <p className="font-semibold mb-1">Não foi possível carregar o saldo devedor.</p>
            <p className="text-sm">{erro.message}</p>
          </div>
        ) : (
          <Suspense>
            <DividaClient
              ano={ano}
              anoCorrente={anoCorrente}
              empresaId={empresaId}
              empresas={empresas ?? []}
              categorias={categorias}
              cronograma={futuros}
              saldoTotal={saldoTotal}
              atrasadoTotal={atrasadoTotal}
              atrasadoTitulos={atrasadoTitulos}
              aVencerTotal={aVencerTotal}
            />
          </Suspense>
        )}
      </div>
    </main>
  )
}
