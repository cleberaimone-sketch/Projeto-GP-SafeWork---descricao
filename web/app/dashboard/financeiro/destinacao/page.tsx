// Destinação do lucro — a operação acima da linha, o resto abaixo.
//
// Pedido do Cleber: "o orçamento da operação tem que ficar no lucro, o que dá
// negativo tem que ser o caixa por causa dos investimentos e empréstimos, mas a
// ideia é poder visualizar tudo para poder destinar o dinheiro".

import { createClient } from '@/lib/supabase/server'
import { createClient as sb } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { mesAtualBrasilia } from '@/lib/formato/data'
import DestinacaoClient, { type LinhaDestinacao } from './DestinacaoClient'

export default async function DestinacaoPage({ searchParams }: {
  searchParams: Promise<{ ano?: string; empresa?: string }>
}) {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) redirect('/login')

  const filtros = await searchParams
  const anoCorrente = Number(mesAtualBrasilia().slice(0, 4))
  const ano = filtros.ano && /^\d{4}$/.test(filtros.ano) ? Number(filtros.ano) : anoCorrente

  const supabase = sb(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const [{ data, error }, { data: empresas }] = await Promise.all([
    supabase.rpc('fn_destinacao_do_lucro', {
      p_ano: ano, p_empresa_id: filtros.empresa || null,
    }),
    supabase.from('empresas').select('id, nome_curto').eq('status', 'ativa').order('nome_curto'),
  ])

  const linhas = ((data ?? []) as LinhaDestinacao[]).map(l => ({
    ...l,
    receita: Number(l.receita), custo_operacional: Number(l.custo_operacional),
    lucro_operacional: Number(l.lucro_operacional),
    investimentos: Number(l.investimentos), emprestimos: Number(l.emprestimos),
    parcelamentos: Number(l.parcelamentos), financeiras: Number(l.financeiras),
    sobra: Number(l.sobra), lucro_orcado: Number(l.lucro_orcado),
  }))

  const nomeEmpresa = (empresas ?? []).find(e => e.id === filtros.empresa)?.nome_curto

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white">
        <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6">
          <div className="flex items-center gap-3 mb-2">
            <a href="/dashboard/financeiro" className="text-blue-200/80 text-sm hover:text-white">← Financeiro</a>
            <span className="text-blue-300">·</span>
            <a href="/dashboard" className="text-blue-200/80 text-sm hover:text-white">Centro de Comando</a>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Destinação do lucro</h1>
          <p className="text-blue-100/90 text-sm">
            A operação acima da linha; empréstimo, parcela e investimento abaixo · {ano}
            {nomeEmpresa && ` · ${nomeEmpresa}`}
          </p>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6 md:py-8">
        <div className="flex flex-wrap gap-2 mb-5">
          <a href={`/dashboard/financeiro/destinacao?ano=${ano}`}
             className={`px-3 py-1.5 text-xs rounded-lg ${!filtros.empresa
               ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
            Grupo inteiro
          </a>
          {(empresas ?? []).map(e => (
            <a key={e.id} href={`/dashboard/financeiro/destinacao?ano=${ano}&empresa=${e.id}`}
               className={`px-3 py-1.5 text-xs rounded-lg ${filtros.empresa === e.id
                 ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
              {e.nome_curto}
            </a>
          ))}
        </div>

        {error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-800">
            <p className="font-semibold mb-1">Não foi possível montar a destinação.</p>
            <p className="text-sm">{error.message}</p>
          </div>
        ) : (
          <Suspense>
            <DestinacaoClient linhas={linhas} ano={ano} />
          </Suspense>
        )}
      </div>
    </main>
  )
}
