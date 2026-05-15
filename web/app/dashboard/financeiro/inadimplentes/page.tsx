import { createClient as sb } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import InadimplentesClient from './InadimplentesClient'

interface SP { empresa?: string; de?: string; ate?: string; ordem?: string }

export default async function InadimplentesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const filters = await searchParams
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) redirect('/login')

  const supabase = sb(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const [{ data: empresas }, { data: rawLancamentos }] = await Promise.all([
    supabase.from('empresas').select('id, nome_curto').order('nome_curto'),
    (() => {
      let q = supabase
        .from('lancamentos_financeiros')
        .select('id, empresa_id, descricao, categoria, valor, data_vencimento, status')
        .eq('tipo', 'receita')
        .eq('status', 'vencido')
        .order('data_vencimento', { ascending: true })
      if (filters.empresa) q = q.eq('empresa_id', filters.empresa)
      if (filters.de)  q = q.gte('data_vencimento', filters.de)
      if (filters.ate) q = q.lte('data_vencimento', filters.ate)
      return q
    })(),
  ])

  const hoje = new Date()
  const empresaMap: Record<string, string> = {}
  for (const e of empresas ?? []) empresaMap[e.id] = e.nome_curto

  const lancamentos = (rawLancamentos ?? []).map(l => ({
    ...l,
    empresa_nome: l.empresa_id ? (empresaMap[l.empresa_id] ?? '—') : '—',
    dias_atraso: l.data_vencimento
      ? Math.floor((hoje.getTime() - new Date(l.data_vencimento + 'T00:00:00').getTime()) / 86400000)
      : 0,
  }))

  // Agrupar por empresa para resumo
  const porEmpresa: Record<string, { nome: string; total: number; qtd: number; max_atraso: number }> = {}
  for (const l of lancamentos) {
    const key = l.empresa_id ?? 'sem-empresa'
    if (!porEmpresa[key]) porEmpresa[key] = { nome: l.empresa_nome, total: 0, qtd: 0, max_atraso: 0 }
    porEmpresa[key].total += l.valor ?? 0
    porEmpresa[key].qtd += 1
    porEmpresa[key].max_atraso = Math.max(porEmpresa[key].max_atraso, l.dias_atraso)
  }

  const resumoPorEmpresa = Object.values(porEmpresa).sort((a, b) => b.total - a.total)
  const totalGeral = lancamentos.reduce((s, l) => s + (l.valor ?? 0), 0)
  const maisAntigo = lancamentos.length > 0
    ? Math.max(...lancamentos.map(l => l.dias_atraso))
    : 0

  return (
    <main className="min-h-screen bg-gray-950 text-white p-6 md:p-8">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <a href="/dashboard/financeiro" className="text-gray-500 text-sm hover:text-gray-300">← Financeiro</a>
          <span className="text-gray-700">·</span>
          <a href="/dashboard" className="text-gray-500 text-sm hover:text-gray-300">Centro de Comando</a>
        </div>
        <h1 className="text-2xl font-bold mt-2">Inadimplência — Títulos Vencidos</h1>
        <p className="text-gray-400 text-sm">{lancamentos.length.toLocaleString('pt-BR')} títulos em aberto</p>
      </div>

      <Suspense>
        <InadimplentesClient
          lancamentos={lancamentos}
          empresas={empresas ?? []}
          resumoPorEmpresa={resumoPorEmpresa}
          totalGeral={totalGeral}
          maisAntigo={maisAntigo}
        />
      </Suspense>
    </main>
  )
}
