import { createClient as sb } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import DrePage, { type DreLinha, type DreCategoria } from './DrePage'

interface SP { empresa?: string; ano?: string; mes?: string }

export default async function DREPage({ searchParams }: { searchParams: Promise<SP> }) {
  const filters = await searchParams
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) redirect('/login')

  const supabase = sb(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const ano = filters.ano ?? new Date().getFullYear().toString()
  const mes = filters.mes ?? ''

  const dataInicio = mes ? `${ano}-${mes}-01` : `${ano}-01-01`
  const dataFim    = mes ? `${ano}-${mes}-31` : `${ano}-12-31`

  const { data: empresas } = await supabase.from('empresas').select('id, nome_curto, nome').order('nome_curto')

  let query = supabase
    .from('lancamentos_financeiros')
    .select('tipo, categoria, valor, status')
    .gte('data_vencimento', dataInicio)
    .lte('data_vencimento', dataFim)
    .neq('status', 'cancelado')

  if (filters.empresa) query = query.eq('empresa_id', filters.empresa)

  const { data: lancamentos } = await query

  const all = lancamentos ?? []
  const receitasList = all.filter(l => l.tipo === 'receita')
  const despesasList = all.filter(l => l.tipo === 'despesa')

  const totalReceitas = receitasList.reduce((s, l) => s + (l.valor ?? 0), 0)
  const totalDespesas = despesasList.reduce((s, l) => s + (l.valor ?? 0), 0)
  const resultado = totalReceitas - totalDespesas
  const margem = totalReceitas > 0 ? (resultado / totalReceitas) * 100 : 0

  // Agrupar receitas por categoria
  const recCatMap: Record<string, number> = {}
  for (const l of receitasList) {
    const c = l.categoria ?? 'Sem categoria'
    recCatMap[c] = (recCatMap[c] ?? 0) + (l.valor ?? 0)
  }
  const recCats: DreCategoria[] = Object.entries(recCatMap)
    .sort(([, a], [, b]) => b - a)
    .map(([categoria, valor]) => ({ categoria, valor, pct: totalReceitas > 0 ? Math.round((valor / totalReceitas) * 100) : 0 }))

  // Agrupar despesas por categoria
  const despCatMap: Record<string, number> = {}
  for (const l of despesasList) {
    const c = l.categoria ?? 'Sem categoria'
    despCatMap[c] = (despCatMap[c] ?? 0) + (l.valor ?? 0)
  }
  const despCats: DreCategoria[] = Object.entries(despCatMap)
    .sort(([, a], [, b]) => b - a)
    .map(([categoria, valor]) => ({ categoria, valor, pct: totalDespesas > 0 ? Math.round((valor / totalDespesas) * 100) : 0 }))

  // Montar linhas do DRE
  const linhas: DreLinha[] = [
    { label: '(+) RECEITAS BRUTAS', valor: totalReceitas, destaque: 'total' },
    ...recCats.slice(0, 10).map(c => ({ label: c.categoria, valor: c.valor, indent: 1 })),
    { separador: true, label: '', valor: 0 },

    { label: '(-) DESPESAS TOTAIS', valor: -totalDespesas, destaque: 'negativo' },
    ...despCats.slice(0, 10).map(c => ({ label: c.categoria, valor: -c.valor, indent: 1, destaque: 'negativo' as const })),
    { separador: true, label: '', valor: 0 },

    {
      label: resultado >= 0 ? '(=) RESULTADO LÍQUIDO' : '(=) PREJUÍZO LÍQUIDO',
      valor: resultado,
      destaque: resultado >= 0 ? 'positivo' : 'negativo',
    },
    {
      label: `Margem Líquida: ${margem.toFixed(1)}%`,
      valor: resultado,
      destaque: resultado >= 0 ? 'positivo' : 'negativo',
      indent: 1,
    },
  ]

  const empresaNome = filters.empresa
    ? (empresas?.find(e => e.id === filters.empresa)?.nome_curto ?? 'Empresa')
    : 'Consolidado — Holding GP SafeWork'

  const nomeMes = mes ? new Date(Number(ano), Number(mes) - 1, 1)
    .toLocaleDateString('pt-BR', { month: 'long' }) : null
  const periodo = nomeMes ? `${nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)} de ${ano}` : `Exercício ${ano}`

  return (
    <main className="min-h-screen bg-gray-950 text-white p-6 md:p-8">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <a href="/dashboard/financeiro" className="text-gray-500 text-sm hover:text-gray-300">← Financeiro</a>
          <span className="text-gray-700">·</span>
          <a href="/dashboard" className="text-gray-500 text-sm hover:text-gray-300">Centro de Comando</a>
        </div>
        <h1 className="text-2xl font-bold mt-2">DRE — Demonstração de Resultado</h1>
        <p className="text-gray-400 text-sm">Dados via Conta Azul · {all.length.toLocaleString('pt-BR')} lançamentos no período</p>
      </div>

      <Suspense>
        <DrePage
          empresas={empresas ?? []}
          linhas={linhas}
          receitaBruta={totalReceitas}
          categorias={{ receitas: recCats, despesas: despCats }}
          periodo={periodo}
          empresaNome={empresaNome}
        />
      </Suspense>
    </main>
  )
}
