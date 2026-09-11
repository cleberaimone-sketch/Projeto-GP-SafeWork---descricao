import { createClient as sb } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import ContasClient from './ContasClient'

interface SP {
  empresa?: string; de?: string; ate?: string
  status?: string; tipo?: string; cat?: string
}

export default async function ContasPage({ searchParams }: { searchParams: Promise<SP> }) {
  const filters = await searchParams
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) redirect('/login')

  const supabase = sb(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const hoje = new Date().toISOString().split('T')[0]

  // Teto explícito, e a contagem do total ao lado.
  //
  // Sem filtro esta tela pede 56.395 lançamentos. Antes não havia limite
  // escrito, o que não significava trazer tudo: o PostgREST corta em 1.000 e
  // não avisa, então a tabela mostrava as 1.000 primeiras como se fossem a
  // lista inteira. Paginar também não serve — ninguém usa uma tabela de 56 mil
  // linhas no navegador. O teto fica à vista e a tela diz quanto ficou de fora.
  const TETO_LINHAS = 2000

  const [{ data: empresas }, rawQ, { count: totalFiltrado }] = await Promise.all([
    supabase.from('empresas').select('id, nome_curto').order('nome_curto'),
    (() => {
      let q = supabase
        .from('lancamentos_financeiros')
        .select('id, empresa_id, tipo, descricao, categoria, valor, data_vencimento, data_pagamento, status, fonte_id')
        .neq('status', 'cancelado')
        .order('data_vencimento', { ascending: true })
        .limit(TETO_LINHAS)
      if (filters.empresa) q = q.eq('empresa_id', filters.empresa)
      if (filters.de)      q = q.gte('data_vencimento', filters.de)
      if (filters.ate)     q = q.lte('data_vencimento', filters.ate)
      if (filters.status)  q = q.eq('status', filters.status)
      if (filters.tipo)    q = q.eq('tipo', filters.tipo)
      return q
    })(),
    // Mesmos filtros, só a contagem — é o que permite dizer quanto ficou de
    // fora do teto em vez de exibir a lista cortada como se fosse completa.
    (() => {
      let q = supabase
        .from('lancamentos_financeiros')
        .select('id', { count: 'exact', head: true })
        .neq('status', 'cancelado')
      if (filters.empresa) q = q.eq('empresa_id', filters.empresa)
      if (filters.de)      q = q.gte('data_vencimento', filters.de)
      if (filters.ate)     q = q.lte('data_vencimento', filters.ate)
      if (filters.status)  q = q.eq('status', filters.status)
      if (filters.tipo)    q = q.eq('tipo', filters.tipo)
      return q
    })(),
  ])

  const empresaMap: Record<string, string> = {}
  for (const e of empresas ?? []) empresaMap[e.id] = e.nome_curto

  const lancamentos = (rawQ.data ?? []).map(l => ({
    ...l,
    empresa_nome: l.empresa_id ? (empresaMap[l.empresa_id] ?? '—') : '—',
    dias: l.data_vencimento
      ? Math.floor((new Date(hoje).getTime() - new Date(l.data_vencimento + 'T00:00:00').getTime()) / 86400000)
      : 0,
  }))

  // ── KPIs ─────────────────────────────────────────────────────────────────
  const receitas  = lancamentos.filter(l => l.tipo === 'receita')
  const despesas  = lancamentos.filter(l => l.tipo === 'despesa')
  const pendRec   = receitas.filter(l => l.status === 'pendente' || l.status === 'parcial')
  const pendDesp  = despesas.filter(l => l.status === 'pendente' || l.status === 'parcial')
  const vencRec   = receitas.filter(l => l.status === 'vencido')
  const vencDesp  = despesas.filter(l => l.status === 'vencido')
  const pagosRec  = receitas.filter(l => l.status === 'pago')
  const pagosDesp = despesas.filter(l => l.status === 'pago')

  const in7d = new Date(); in7d.setDate(in7d.getDate() + 7)
  const in7dISO = in7d.toISOString().split('T')[0]
  const vencendo7d = lancamentos.filter(l =>
    (l.status === 'pendente') && l.data_vencimento >= hoje && l.data_vencimento <= in7dISO
  )

  const kpi = {
    totalARec:    [...pendRec, ...vencRec].reduce((s, l) => s + (l.valor ?? 0), 0),
    totalAPagar:  [...pendDesp, ...vencDesp].reduce((s, l) => s + (l.valor ?? 0), 0),
    vencidoRec:   vencRec.reduce((s, l) => s + (l.valor ?? 0), 0),
    vencidoDesp:  vencDesp.reduce((s, l) => s + (l.valor ?? 0), 0),
    vencendo7d:   vencendo7d.reduce((s, l) => s + (l.valor ?? 0), 0),
    qtdVencendo7d: vencendo7d.length,
    pagosRec:     pagosRec.reduce((s, l) => s + (l.valor ?? 0), 0),
    pagosDesp:    pagosDesp.reduce((s, l) => s + (l.valor ?? 0), 0),
    qtdTotal:     lancamentos.length,
  }

  // ── Categorias disponíveis para filtro ───────────────────────────────────
  const cats = [...new Set(lancamentos.map(l => l.categoria).filter(Boolean))].sort() as string[]

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white">
        <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6">
          <div className="flex items-center gap-3 mb-2">
            <a href="/dashboard/financeiro" className="text-blue-200/80 text-sm hover:text-white">← Financeiro</a>
            <span className="text-blue-300">·</span>
            <a href="/dashboard" className="text-blue-200/80 text-sm hover:text-white">Centro de Comando</a>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Contas a Pagar / Receber</h1>
          <p className="text-blue-100/90 text-sm">{lancamentos.length.toLocaleString('pt-BR')} lançamentos · Conta Azul</p>
        </div>
      </div>
      <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6 md:py-8">
        <Suspense>
          <ContasClient
            lancamentos={lancamentos}
            total={totalFiltrado ?? lancamentos.length}
            teto={TETO_LINHAS}
            empresas={empresas ?? []}
            categorias={cats}
            kpi={kpi}
            hoje={hoje}
          />
        </Suspense>
      </div>
    </main>
  )
}
