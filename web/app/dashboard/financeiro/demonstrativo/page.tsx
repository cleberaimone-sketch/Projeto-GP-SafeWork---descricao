// Demonstrativo Mensal — a tabela da planilha "DRE - Resumido", mês a mês.
//
// Primeira peça de um painel que vai crescer: as linhas do plano de contas do
// Conta Azul em janeiro a dezembro, com total e média, e o caixa acumulado
// fechando embaixo.

import { createClient as sb } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import DemonstrativoClient, { type LinhaTabela } from './DemonstrativoClient'
import { mesAtualBrasilia } from '@/lib/formato/data'

export const dynamic = 'force-dynamic'

type RpcRow = { empresa_id: string; unidade: string; mes: number; linha: string; total: number }
type SP = { ano?: string; empresa?: string }

// A ordem e os rótulos são os da planilha — é como o Cleber lê o demonstrativo.
const ESTRUTURA: { chave: string; rotulo: string; tipo: LinhaTabela['tipo'] }[] = [
  { chave: 'receita_bruta',        rotulo: '01T Receita Bruta de Vendas',      tipo: 'receita' },
  { chave: 'deducoes',             rotulo: '02 Deduções da Receita Bruta',     tipo: 'saida' },
  { chave: 'custo_servicos',       rotulo: '03 Custo dos Serviços realizados', tipo: 'saida' },
  { chave: 'despesas_admin',       rotulo: '04.2 Despesas Administrativas',    tipo: 'saida' },
  { chave: 'despesas_financeiras', rotulo: '05 Despesas Financ.',              tipo: 'saida' },
  { chave: '__lucro',              rotulo: '06T Lucro Liquido',                tipo: 'subtotal' },
  { chave: 'investimentos',        rotulo: '06.1 Investimentos em Imobilizado', tipo: 'saida' },
  { chave: 'emprestimos_socios',   rotulo: '7.01.03 Empréstimos de Sócios',    tipo: 'saida' },
  { chave: 'parc_contas_antigas',  rotulo: '8.01.02 Parc. contas antigas',     tipo: 'saida' },
  { chave: 'parc_contas_atuais',   rotulo: '8.01.03 Parc. contas atuais',      tipo: 'saida' },
  { chave: 'parc_lucro_presumido', rotulo: '8.01.04 Parc.do Lucro Presumido',  tipo: 'saida' },
  { chave: '__caixa',              rotulo: 'CAIXA',                            tipo: 'total' },
  { chave: '__acumulado',          rotulo: 'CAIXA ACUMULADO',                  tipo: 'acumulado' },
]

const OPERACIONAIS = ['receita_bruta', 'deducoes', 'custo_servicos', 'despesas_admin', 'despesas_financeiras']
const NAO_OPERACIONAIS = ['investimentos', 'emprestimos_socios', 'parc_contas_antigas',
                          'parc_contas_atuais', 'parc_lucro_presumido', 'parc_outros']

export default async function DemonstrativoPage({ searchParams }: { searchParams: Promise<SP> }) {
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
  const empresaId = filtros.empresa || null

  const supabase = sb(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const [{ data: empresas }, { data, error }] = await Promise.all([
    supabase.from('empresas').select('id, nome_curto').order('nome_curto'),
    supabase.rpc('fn_dre_unidade_mensal', { p_ano: ano }),
  ])

  // A RPC devolve por unidade; aqui consolida (ou isola uma empresa).
  const porLinha = new Map<string, number[]>()
  for (const r of ((data ?? []) as RpcRow[])) {
    if (empresaId && r.empresa_id !== empresaId) continue
    if (!porLinha.has(r.linha)) porLinha.set(r.linha, Array(12).fill(0))
    porLinha.get(r.linha)![r.mes - 1] += Number(r.total ?? 0)
  }

  const somar = (chaves: string[]) => {
    const out = Array(12).fill(0)
    for (const c of chaves) {
      const s = porLinha.get(c)
      if (!s) continue
      for (let i = 0; i < 12; i++) out[i] += s[i]
    }
    return out
  }

  const lucro = somar(OPERACIONAIS)
  const naoOp = somar(NAO_OPERACIONAIS)
  const caixa = lucro.map((v, i) => v + naoOp[i])
  const acumulado: number[] = []
  caixa.reduce((soma, v, i) => (acumulado[i] = soma + v), 0)

  // Média sobre os meses COM MOVIMENTO até o último mês fechado — a mesma regra
  // do DRE por Unidade. Dividir por 12 com meses ainda vazios achata tudo.
  const mesesFechados = ano < anoCorrente ? 12 : Math.max(0, mesCorrente - 1)
  const media = (serie: number[]) => {
    const comMovimento = serie.slice(0, mesesFechados).filter(v => v !== 0)
    return comMovimento.length === 0 ? 0
      : comMovimento.reduce((a, b) => a + b, 0) / comMovimento.length
  }

  const linhas: LinhaTabela[] = ESTRUTURA.map(({ chave, rotulo, tipo }) => {
    const valores =
      chave === '__lucro'     ? lucro
    : chave === '__caixa'     ? caixa
    : chave === '__acumulado' ? acumulado
    : (porLinha.get(chave) ?? Array(12).fill(0))

    return {
      rotulo, tipo, valores,
      // No acumulado, "total" não é soma de meses: é o saldo no fim do período.
      total: chave === '__acumulado'
        ? (acumulado[Math.max(0, mesesFechados - 1)] ?? 0)
        : valores.reduce((a, b) => a + b, 0),
      media: chave === '__acumulado' ? 0 : media(valores),
    }
  })

  const empresaNome = empresaId
    ? (empresas ?? []).find(e => e.id === empresaId)?.nome_curto ?? 'Empresa'
    : 'Grupo consolidado'

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white">
        <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6">
          <div className="flex items-center gap-3 mb-2">
            <a href="/dashboard/financeiro" className="text-blue-200/80 text-sm hover:text-white">← Financeiro</a>
            <span className="text-blue-300">·</span>
            <a href="/dashboard" className="text-blue-200/80 text-sm hover:text-white">Centro de Comando</a>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Demonstrativo Mensal</h1>
          <p className="text-blue-100/90 text-sm">
            {empresaNome} · exercício {ano} · Conta Azul
            {mesesFechados > 0 && ` · média sobre meses fechados até ${['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][mesesFechados - 1]}`}
          </p>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6 md:py-8">
        {error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-800">
            <p className="font-semibold mb-1">Não foi possível carregar o demonstrativo.</p>
            <p className="text-sm">{error.message}</p>
          </div>
        ) : (
          <Suspense>
            <DemonstrativoClient
              ano={ano}
              anoCorrente={anoCorrente}
              empresaId={empresaId}
              empresas={empresas ?? []}
              linhas={linhas}
              mesesFechados={mesesFechados}
            />
          </Suspense>
        )}
      </div>
    </main>
  )
}
