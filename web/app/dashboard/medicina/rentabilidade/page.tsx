// Atendimento × custo — a página que cruza o SOC com o Conta Azul.
//
// Pedido do Cleber: comparar consulta realizada com o que foi faturado e com o
// que custou. Os três números existiam em telas separadas, e a pergunta que
// importa — quanto custa uma consulta em cada unidade — não aparecia em
// nenhuma delas.

import { createClient } from '@/lib/supabase/server'
import { createClient as sb } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { mesAtualBrasilia } from '@/lib/formato/data'
import RentabilidadeClient, { type LinhaAtendimento } from './RentabilidadeClient'

export default async function RentabilidadePage({ searchParams }: {
  searchParams: Promise<{ ano?: string }>
}) {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) redirect('/login')

  const filtros = await searchParams
  const anoCorrente = Number(mesAtualBrasilia().slice(0, 4))
  const ano = filtros.ano && /^\d{4}$/.test(filtros.ano) ? Number(filtros.ano) : anoCorrente

  // Meses fechados: o corrente é parcial nos dois lados (exame ainda entrando,
  // honorário ainda não lançado) e distorce qualquer razão calculada sobre ele.
  const mesCorrente = Number(mesAtualBrasilia().slice(5, 7))
  const mesesFechados = ano < anoCorrente ? 12 : Math.max(mesCorrente - 1, 1)

  const supabase = sb(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data, error } = await supabase.rpc('fn_atendimento_x_custo', { p_ano: ano })

  const linhas = ((data ?? []) as LinhaAtendimento[]).map(l => ({
    ...l,
    consultas: Number(l.consultas), exames: Number(l.exames),
    custo_medico: Number(l.custo_medico), custo_clinicas: Number(l.custo_clinicas),
    receita: Number(l.receita),
  }))

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      <div className="bg-gradient-to-r from-emerald-900 via-emerald-800 to-emerald-900 text-white">
        <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6">
          <div className="flex items-center gap-3 mb-2">
            <a href="/dashboard/medicina" className="text-emerald-200/80 text-sm hover:text-white">← Medicina</a>
            <span className="text-emerald-300">·</span>
            <a href="/dashboard" className="text-emerald-200/80 text-sm hover:text-white">Centro de Comando</a>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Atendimento × custo</h1>
          <p className="text-emerald-100/90 text-sm">
            Consulta realizada (SOC) cruzada com honorário médico e receita (Conta Azul) · exercício {ano}
          </p>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6 md:py-8">
        {error ? (
          // Erro aqui não vira tabela vazia: sem os dois lados não há cruzamento
          // nenhum, e uma tela em branco passaria por "nenhum atendimento".
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-800">
            <p className="font-semibold mb-1">Não foi possível cruzar atendimento e custo.</p>
            <p className="text-sm">{error.message}</p>
          </div>
        ) : linhas.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <p className="text-sm text-slate-600">
              Sem dados para {ano}. O cruzamento depende do espelho do SOC (consultas) e dos
              lançamentos do Conta Azul (honorários) no mesmo exercício.
            </p>
          </div>
        ) : (
          <Suspense>
            <RentabilidadeClient linhas={linhas} ano={ano} mesesFechados={mesesFechados} />
          </Suspense>
        )}
      </div>
    </main>
  )
}
