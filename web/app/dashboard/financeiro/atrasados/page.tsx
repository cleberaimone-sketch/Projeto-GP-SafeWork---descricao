import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import AtrasadosClient from './AtrasadosClient'
import type { LancamentoAtrasado, AgingBucket, ResumoEmpresa, KpisAtrasados } from './AtrasadosClient'
import {
  carregarCategoriasExcluidas,
  isTransferenciaInterna,
} from '@/lib/financeiro/regras'

interface SP { empresa?: string; lado?: 'receber' | 'pagar' }

function toISO(d: Date) { return d.toISOString().split('T')[0] }

export default async function AtrasadosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const filters = await searchParams
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) redirect('/login')

  const sb = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const hojeISO = toISO(hoje)

  // ── Queries ───────────────────────────────────────────────────────────────
  const [
    { data: empresas },
    { data: rawLancamentos },
    excluidas,
  ] = await Promise.all([
    sb.from('empresas').select('id, nome_curto').order('nome_curto'),
    (() => {
      // Pega TODOS os lançamentos vencidos OU pendentes com vencimento passado
      let q = sb
        .from('lancamentos_financeiros')
        .select('id, empresa_id, tipo, descricao, categoria, valor, data_vencimento, data_pagamento, status, cliente_id')
        .neq('status', 'cancelado')
        .neq('status', 'pago')
        .neq('status', 'parcial')
        .not('data_vencimento', 'is', null)
        .lt('data_vencimento', hojeISO)
        .order('data_vencimento', { ascending: true })
      if (filters.empresa) q = q.eq('empresa_id', filters.empresa)
      return q
    })(),
    carregarCategoriasExcluidas(sb),
  ])

  const empresaMap: Record<string, string> = {}
  for (const e of empresas ?? []) empresaMap[e.id] = e.nome_curto

  // Filtra transferências internas (não são dívida real)
  const lancamentos: LancamentoAtrasado[] = (rawLancamentos ?? [])
    .filter(l => !isTransferenciaInterna(l.categoria, excluidas))
    .map(l => {
      const diasAtraso = l.data_vencimento
        ? Math.floor((hoje.getTime() - new Date(l.data_vencimento + 'T00:00:00').getTime()) / 86400000)
        : 0
      const bucket: AgingBucket =
        diasAtraso <= 30  ? '1-30' :
        diasAtraso <= 60  ? '31-60' :
        diasAtraso <= 90  ? '61-90' :
                            '90+'
      return {
        id: l.id,
        empresa_id: l.empresa_id,
        empresa_nome: l.empresa_id ? (empresaMap[l.empresa_id] ?? '—') : '—',
        tipo: l.tipo as 'receita' | 'despesa',
        descricao: l.descricao ?? '(sem descrição)',
        categoria: l.categoria ?? '—',
        valor: l.valor ?? 0,
        data_vencimento: l.data_vencimento!,
        dias_atraso: diasAtraso,
        bucket,
      }
    })

  const aReceber = lancamentos.filter(l => l.tipo === 'receita')
  const aPagar   = lancamentos.filter(l => l.tipo === 'despesa')

  // ── KPIs ──────────────────────────────────────────────────────────────────
  function dsoMedio(items: LancamentoAtrasado[]): number {
    if (items.length === 0) return 0
    const totalDias = items.reduce((s, l) => s + l.dias_atraso * l.valor, 0)
    const totalValor = items.reduce((s, l) => s + l.valor, 0)
    return totalValor > 0 ? totalDias / totalValor : 0
  }

  const kpis: KpisAtrasados = {
    totalReceber:   aReceber.reduce((s, l) => s + l.valor, 0),
    qtdReceber:     aReceber.length,
    totalPagar:     aPagar.reduce((s, l) => s + l.valor, 0),
    qtdPagar:       aPagar.length,
    dsoReceber:     dsoMedio(aReceber),
    dpoPagar:       dsoMedio(aPagar),
    saldoLiquido:   aReceber.reduce((s, l) => s + l.valor, 0) - aPagar.reduce((s, l) => s + l.valor, 0),
    maisAntigoReceber: aReceber.length > 0 ? Math.max(...aReceber.map(l => l.dias_atraso)) : 0,
    maisAntigoPagar:   aPagar.length   > 0 ? Math.max(...aPagar.map(l => l.dias_atraso))   : 0,
  }

  // ── Resumo por empresa ────────────────────────────────────────────────────
  function resumirPorEmpresa(items: LancamentoAtrasado[]): ResumoEmpresa[] {
    const m: Record<string, { nome: string; total: number; qtd: number; maxAtraso: number }> = {}
    for (const l of items) {
      const key = l.empresa_id ?? 'sem'
      if (!m[key]) m[key] = { nome: l.empresa_nome, total: 0, qtd: 0, maxAtraso: 0 }
      m[key].total += l.valor
      m[key].qtd   += 1
      m[key].maxAtraso = Math.max(m[key].maxAtraso, l.dias_atraso)
    }
    return Object.values(m).sort((a, b) => b.total - a.total)
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white">
        <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6">
          <div className="flex items-center gap-3 mb-2">
            <a href="/dashboard/financeiro" className="text-blue-200/80 text-sm hover:text-white">← Financeiro</a>
            <span className="text-blue-300">·</span>
            <a href="/dashboard" className="text-blue-200/80 text-sm hover:text-white">Centro de Comando</a>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Contas Atrasadas</h1>
          <p className="text-blue-100/90 text-sm">
            A Receber: {aReceber.length.toLocaleString('pt-BR')} títulos · A Pagar: {aPagar.length.toLocaleString('pt-BR')} títulos
          </p>
        </div>
      </div>
      <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6 md:py-8">
        <Suspense>
          <AtrasadosClient
            kpis={kpis}
            aReceber={aReceber}
            aPagar={aPagar}
            resumoReceber={resumirPorEmpresa(aReceber)}
            resumoPagar={resumirPorEmpresa(aPagar)}
            empresas={empresas ?? []}
            empresaSelecionada={filters.empresa ?? ''}
            ladoInicial={filters.lado ?? 'receber'}
          />
        </Suspense>
      </div>
    </main>
  )
}
