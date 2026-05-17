import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import OrcamentoClient from './OrcamentoClient'
import type { CategoriaItem, MetaItem } from './OrcamentoClient'
import {
  carregarCategoriasExcluidas,
  isTransferenciaInterna,
} from '@/lib/financeiro/regras'

interface SP { empresa?: string; ano?: string }

export default async function OrcamentoPage({ searchParams }: { searchParams: Promise<SP> }) {
  const filters = await searchParams
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) redirect('/login')

  const sb = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const anoAtual = new Date().getFullYear()
  const ano      = parseInt(filters.ano ?? String(anoAtual))
  const empresaId = filters.empresa ?? ''  // '' = consolidado

  // ── Queries ───────────────────────────────────────────────────────────────
  const [
    { data: empresas },
    { data: metasRaw },
    { data: lancamentosAno },
    { data: lancamentosAnoAnterior },
    excluidas,
  ] = await Promise.all([
    sb.from('empresas').select('id, nome_curto').order('nome_curto'),
    (() => {
      let q = sb.from('metas_orcamentarias').select('*').eq('ano', ano)
      q = empresaId ? q.eq('empresa_id', empresaId) : q.is('empresa_id', null)
      return q
    })(),
    (() => {
      let q = sb.from('lancamentos_financeiros')
        .select('categoria, tipo, valor, data_vencimento, data_pagamento, status')
        .neq('status', 'cancelado')
        .gte('data_vencimento', `${ano}-01-01`)
        .lte('data_vencimento', `${ano}-12-31`)
      if (empresaId) q = q.eq('empresa_id', empresaId)
      return q
    })(),
    // Lançamentos do ano anterior — usado pra ação "replicar do ano anterior"
    (() => {
      let q = sb.from('lancamentos_financeiros')
        .select('categoria, tipo, valor, data_vencimento, status')
        .neq('status', 'cancelado')
        .gte('data_vencimento', `${ano - 1}-01-01`)
        .lte('data_vencimento', `${ano - 1}-12-31`)
      if (empresaId) q = q.eq('empresa_id', empresaId)
      return q
    })(),
    carregarCategoriasExcluidas(sb),
  ])

  // ── Agrega realizado por (categoria, mês) ─────────────────────────────────
  // "Realizado" = lançamentos pagos no ano (regime caixa) por mês de pagamento
  const realizadoMap: Record<string, Record<number, number>> = {}
  const tipoMap: Record<string, 'receita' | 'despesa'> = {}

  for (const l of lancamentosAno ?? []) {
    if (isTransferenciaInterna(l.categoria, excluidas)) continue
    const cat = l.categoria ?? '(sem categoria)'
    tipoMap[cat] = l.tipo as 'receita' | 'despesa'

    // Realizado: lançamentos pagos (data_pagamento) no ano
    if ((l.status === 'pago' || l.status === 'parcial') && l.data_pagamento) {
      const m = parseInt(l.data_pagamento.slice(5, 7))
      if (m >= 1 && m <= 12) {
        if (!realizadoMap[cat]) realizadoMap[cat] = {}
        realizadoMap[cat][m] = (realizadoMap[cat][m] ?? 0) + (l.valor ?? 0)
      }
    }
  }

  // ── Agrega histórico do ano anterior (para sugerir como base) ─────────────
  const historicoAnoAnterior: Record<string, Record<number, number>> = {}
  for (const l of lancamentosAnoAnterior ?? []) {
    if (isTransferenciaInterna(l.categoria, excluidas)) continue
    const cat = l.categoria ?? '(sem categoria)'
    tipoMap[cat] = tipoMap[cat] ?? (l.tipo as 'receita' | 'despesa')
    if ((l.status === 'pago' || l.status === 'parcial') && l.data_vencimento) {
      const m = parseInt(l.data_vencimento.slice(5, 7))
      if (m >= 1 && m <= 12) {
        if (!historicoAnoAnterior[cat]) historicoAnoAnterior[cat] = {}
        historicoAnoAnterior[cat][m] = (historicoAnoAnterior[cat][m] ?? 0) + (l.valor ?? 0)
      }
    }
  }

  // ── Lista de categorias para exibir ───────────────────────────────────────
  // Inclui qualquer categoria que tenha movimento no ano OU no anterior OU já tenha meta
  const todasCategorias = new Set<string>([
    ...Object.keys(realizadoMap),
    ...Object.keys(historicoAnoAnterior),
    ...((metasRaw ?? []).map(m => m.categoria)),
  ])

  const categorias: CategoriaItem[] = Array.from(todasCategorias)
    .map(cat => ({
      categoria: cat,
      tipo: tipoMap[cat] ?? 'despesa',  // default despesa se desconhecida
      realizado_mes: realizadoMap[cat] ?? {},
      historico_ano_anterior: historicoAnoAnterior[cat] ?? {},
      total_realizado_ano: Object.values(realizadoMap[cat] ?? {}).reduce((s, v) => s + v, 0),
      total_historico:    Object.values(historicoAnoAnterior[cat] ?? {}).reduce((s, v) => s + v, 0),
    }))
    .sort((a, b) => {
      // Receitas primeiro, depois despesas. Dentro de cada, ordem alfabética
      if (a.tipo !== b.tipo) return a.tipo === 'receita' ? -1 : 1
      return a.categoria.localeCompare(b.categoria)
    })

  // ── Mapa de metas por (categoria, mês) ────────────────────────────────────
  const metas: MetaItem[] = (metasRaw ?? []).map(m => ({
    id:         m.id,
    categoria:  m.categoria,
    mes:        m.mes,
    valor_meta: parseFloat(m.valor_meta),
    tipo:       m.tipo as 'receita' | 'despesa',
  }))

  return (
    <main className="min-h-screen bg-slate-50 text-white p-6 md:p-8">

      <div className="mb-6">
        <div className="flex items-center gap-3">
          <a href="/dashboard/financeiro" className="text-slate-500 text-sm hover:text-slate-700">← Financeiro</a>
          <span className="text-slate-700">·</span>
          <a href="/dashboard" className="text-slate-500 text-sm hover:text-slate-700">Centro de Comando</a>
        </div>
        <h1 className="text-2xl font-bold mt-2">Plano Orçamentário</h1>
        <p className="text-slate-500 text-sm">
          Metas mensais por categoria · Realizado vs Meta · Ano {ano}
        </p>
      </div>

      <Suspense>
        <OrcamentoClient
          ano={ano}
          empresaId={empresaId}
          empresas={empresas ?? []}
          categorias={categorias}
          metas={metas}
        />
      </Suspense>

    </main>
  )
}
