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

export const maxDuration = 60  // fallback paginado pode ler muitos lançamentos

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

  // ── Agregação do realizado (via RPC fn_orcamento_ano; fallback paginado) ───
  // A tabela tem ~12k lançamentos/ano; o client Supabase corta em 1000 linhas.
  // Ler direto fazia tipo/realizado saírem de um subconjunto arbitrário —
  // categorias de receita fora dessas 1000 caíam no default 'despesa' e o
  // realizado contava só ~8%. fn_orcamento_ano agrega (categoria, tipo, mês de
  // pagamento) no Postgres. Fallback paginado cobre o caso da RPC não aplicada.
  type AggRow = { categoria: string; tipo: 'receita' | 'despesa'; mes: number; realizado: number }

  async function agregarPaginado(anoAlvo: number, excluidas: Set<string>): Promise<AggRow[]> {
    const acc: Record<string, AggRow> = {}
    const LOTE = 1000
    for (let offset = 0; ; offset += LOTE) {
      let q = sb.from('lancamentos_financeiros')
        .select('categoria, tipo, valor, data_pagamento')
        .in('status', ['pago', 'parcial'])
        .not('data_pagamento', 'is', null)
        .gte('data_vencimento', `${anoAlvo}-01-01`)
        .lte('data_vencimento', `${anoAlvo}-12-31`)
        .order('id')
        .range(offset, offset + LOTE - 1)
      if (empresaId) q = q.eq('empresa_id', empresaId)
      const { data } = await q
      if (!data || data.length === 0) break
      for (const l of data) {
        if (isTransferenciaInterna(l.categoria, excluidas)) continue
        const cat = l.categoria ?? '(sem categoria)'
        const mes = parseInt((l.data_pagamento ?? '').slice(5, 7))
        if (!(mes >= 1 && mes <= 12)) continue
        const key = `${cat}|${mes}`
        if (!acc[key]) acc[key] = { categoria: cat, tipo: l.tipo as 'receita' | 'despesa', mes, realizado: 0 }
        acc[key].realizado += l.valor ?? 0
      }
      if (data.length < LOTE) break
    }
    return Object.values(acc)
  }

  async function agregarAno(anoAlvo: number): Promise<AggRow[]> {
    const { data, error } = await sb.rpc('fn_orcamento_ano', { p_ano: anoAlvo, p_empresa_id: empresaId || null })
    if (!error && Array.isArray(data)) {
      return (data as AggRow[]).map(r => ({ categoria: r.categoria, tipo: r.tipo, mes: r.mes, realizado: Number(r.realizado ?? 0) }))
    }
    // RPC ainda não aplicada no banco → agrega paginando (correto, só mais lento)
    const excluidas = await carregarCategoriasExcluidas(sb)
    return agregarPaginado(anoAlvo, excluidas)
  }

  // ── Queries ───────────────────────────────────────────────────────────────
  const [
    { data: empresas },
    { data: metasRaw },
    realizadoRows,
    historicoRows,
  ] = await Promise.all([
    sb.from('empresas').select('id, nome_curto').order('nome_curto'),
    (() => {
      let q = sb.from('metas_orcamentarias').select('*').eq('ano', ano)
      q = empresaId ? q.eq('empresa_id', empresaId) : q.is('empresa_id', null)
      return q
    })(),
    agregarAno(ano),
    agregarAno(ano - 1),
  ])

  // ── Monta realizado / tipo / histórico a partir do agregado ───────────────
  const realizadoMap: Record<string, Record<number, number>> = {}
  const tipoMap: Record<string, 'receita' | 'despesa'> = {}
  for (const r of realizadoRows) {
    tipoMap[r.categoria] = r.tipo
    if (!realizadoMap[r.categoria]) realizadoMap[r.categoria] = {}
    realizadoMap[r.categoria][r.mes] = (realizadoMap[r.categoria][r.mes] ?? 0) + r.realizado
  }

  const historicoAnoAnterior: Record<string, Record<number, number>> = {}
  for (const r of historicoRows) {
    tipoMap[r.categoria] = tipoMap[r.categoria] ?? r.tipo
    if (!historicoAnoAnterior[r.categoria]) historicoAnoAnterior[r.categoria] = {}
    historicoAnoAnterior[r.categoria][r.mes] = (historicoAnoAnterior[r.categoria][r.mes] ?? 0) + r.realizado
  }

  // Fallback de tipo pelas próprias metas: categoria com meta mas sem lançamento
  // no escopo (ex: linha de receita ainda não faturada) não cai em 'despesa'.
  for (const m of metasRaw ?? []) {
    if (m.categoria && !tipoMap[m.categoria]) tipoMap[m.categoria] = m.tipo as 'receita' | 'despesa'
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
    <main className="min-h-screen bg-slate-50 text-slate-800">
      <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white">
        <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6">
          <div className="flex items-center gap-3 mb-2">
            <a href="/dashboard/financeiro" className="text-blue-200/80 text-sm hover:text-white">← Financeiro</a>
            <span className="text-blue-300">·</span>
            <a href="/dashboard" className="text-blue-200/80 text-sm hover:text-white">Centro de Comando</a>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Plano Orçamentário</h1>
          <p className="text-blue-100/90 text-sm">Metas mensais por categoria · Realizado vs Meta · Ano {ano}</p>
        </div>
      </div>
      <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6 md:py-8">
        <Suspense>
          <OrcamentoClient
            ano={ano}
            empresaId={empresaId}
            empresas={empresas ?? []}
            categorias={categorias}
            metas={metas}
          />
        </Suspense>
      </div>
    </main>
  )
}
