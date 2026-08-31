// Demonstrativo Mensal — a tabela da planilha "DRE - Resumido", mês a mês.
//
// Primeira peça de um painel que vai crescer: as linhas do plano de contas do
// Conta Azul em janeiro a dezembro, com total e média, e o caixa acumulado
// fechando embaixo.

import { createClient as sb } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import DemonstrativoClient, { type LinhaTabela, type Tabela, type Periodo } from './DemonstrativoClient'
import { mesAtualBrasilia } from '@/lib/formato/data'

export const dynamic = 'force-dynamic'

type RpcRow = { empresa_id: string; unidade: string; mes: number; linha: string; total: number }

const MESES_NOME = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

// O grupo usava SIGE Cloud até migrar para o Conta Azul, e a migração não
// trouxe o histórico: jan/2024 tem 2 lançamentos, fev tem 5, mar tem 154 —
// contra 846 em abril e mais de mil daí em diante. O que está aqui antes de
// abril/2024 é resíduo, não o movimento real do período.
const PRIMEIRO_ANO_PARCIAL = 2024
const PRIMEIRO_MES_CONFIAVEL = 4   // abril
type SP = { ano?: string; empresa?: string; visao?: string }

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
  { chave: 'emprestimos_terceiros', rotulo: '7.01.02 Empréstimos de Terceiros', tipo: 'saida' },
  { chave: 'parc_contas_antigas',  rotulo: '8.01.02 Parc. contas antigas',     tipo: 'saida' },
  { chave: 'parc_contas_atuais',   rotulo: '8.01.03 Parc. contas atuais',      tipo: 'saida' },
  { chave: 'parc_lucro_presumido', rotulo: '8.01.04 Parc.do Lucro Presumido',  tipo: 'saida' },
  { chave: '__caixa',              rotulo: 'CAIXA',                            tipo: 'total' },
  { chave: '__acumulado',          rotulo: 'CAIXA ACUMULADO',                  tipo: 'acumulado' },
]

const OPERACIONAIS = ['receita_bruta', 'deducoes', 'custo_servicos', 'despesas_admin', 'despesas_financeiras']
const NAO_OPERACIONAIS = ['investimentos', 'emprestimos_socios', 'emprestimos_terceiros',
                          'emprestimos_outros', 'parc_contas_antigas', 'parc_contas_atuais',
                          'parc_lucro_presumido', 'parc_outros']

export default async function DemonstrativoPage({ searchParams }: { searchParams: Promise<SP> }) {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) redirect('/login')

  const filtros = await searchParams
  const hojeMes = mesAtualBrasilia()
  const anoCorrente = Number(hojeMes.slice(0, 4))
  const mesCorrente = Number(hojeMes.slice(5, 7))

  // "todos" troca as colunas de meses por anos, no mesmo layout.
  const modoAnual = filtros.ano === 'todos'
  const anoPedido = Number(filtros.ano)
  const ano = Number.isInteger(anoPedido) && anoPedido >= 2024 && anoPedido <= anoCorrente
    ? anoPedido : anoCorrente
  const empresaId = filtros.empresa || null

  const ANO_INICIAL = 2024
  const anosDisponiveis = Array.from(
    { length: anoCorrente - ANO_INICIAL + 1 }, (_, i) => ANO_INICIAL + i)

  const supabase = sb(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const [{ data: empresas }, ...respostas] = await Promise.all([
    supabase.from('empresas').select('id, nome_curto').order('nome_curto'),
    ...(modoAnual ? anosDisponiveis : [ano]).map(a =>
      supabase.rpc('fn_dre_unidade_mensal', { p_ano: a })),
  ])
  const error = respostas.find(r => r.error)?.error ?? null

  // No modo anual cada RESPOSTA vira uma coluna; no mensal, cada MÊS da única
  // resposta. Daí em diante o código é o mesmo — só muda quantas colunas há.
  const COLUNAS = modoAnual ? anosDisponiveis.length : 12
  const abrev = (i: number) => MESES_NOME[i].slice(0, 3).toLowerCase()
  const fechadasMensal = ano < anoCorrente ? 12 : Math.max(0, mesCorrente - 1)

  const periodo: Periodo = modoAnual
    ? {
        rotulos: anosDisponiveis.map(String),
        fechadas: anosDisponiveis.length - 1,
        modo: 'anual',
        rotuloTotal: `${anosDisponiveis[0]}–${anoCorrente}`,
        rotuloMedia: `${anosDisponiveis[0]}–${anoCorrente - 1}`,
      }
    : {
        rotulos: MESES_NOME,
        fechadas: fechadasMensal,
        modo: 'mensal',
        rotuloTotal: `ano ${ano}`,
        rotuloMedia: fechadasMensal >= 12
          ? 'jan–dez'
          : fechadasMensal > 0 ? `jan–${abrev(fechadasMensal - 1)}` : 'sem mês fechado',
      }

  // Pivô reaproveitável: filtra por empresa (ou consolida, com filtro nulo).
  // A coluna é o mês (modo mensal) ou o índice do ano (modo anual).
  const pivotar = (filtroEmpresa: string | null) => {
    const m = new Map<string, number[]>()
    respostas.forEach((resposta, indiceAno) => {
      for (const r of ((resposta.data ?? []) as RpcRow[])) {
        if (filtroEmpresa && r.empresa_id !== filtroEmpresa) continue
        if (!m.has(r.linha)) m.set(r.linha, Array(COLUNAS).fill(0))
        m.get(r.linha)![modoAnual ? indiceAno : r.mes - 1] += Number(r.total ?? 0)
      }
    })
    return m
  }

  const porLinha = pivotar(empresaId)

  const somarDe = (m: Map<string, number[]>, chaves: string[]) => {
    const out = Array(COLUNAS).fill(0)
    for (const c of chaves) {
      const s = m.get(c)
      if (!s) continue
      for (let i = 0; i < 12; i++) out[i] += s[i]
    }
    return out
  }
  const somar = (chaves: string[]) => somarDe(porLinha, chaves)

  const lucro = somar(OPERACIONAIS)
  const naoOp = somar(NAO_OPERACIONAIS)
  const caixa = lucro.map((v, i) => v + naoOp[i])
  const acumulado: number[] = []
  caixa.reduce((soma, v, i) => (acumulado[i] = soma + v), 0)

  // Média sobre as colunas COM MOVIMENTO já encerradas — a mesma regra do DRE
  // por Unidade. Dividir por 12 (ou pelo nº de anos) com períodos ainda vazios
  // achata tudo, e no modo anual o exercício corrente está sempre incompleto.
  const mesesFechados = periodo.fechadas
  const media = (serie: number[]) => {
    const comMovimento = serie.slice(0, mesesFechados).filter(v => v !== 0)
    return comMovimento.length === 0 ? 0
      : comMovimento.reduce((a, b) => a + b, 0) / comMovimento.length
  }

  const montarDe = (m: Map<string, number[]>) => {
    const lu = somarDe(m, OPERACIONAIS)
    const no = somarDe(m, NAO_OPERACIONAIS)
    const cx = lu.map((v, i) => v + no[i])
    const ac: number[] = []
    cx.reduce((soma, v, i) => (ac[i] = soma + v), 0)

    return (chave: string, rotulo: string, tipo: LinhaTabela['tipo']): LinhaTabela => {
      const valores =
        chave === '__lucro'     ? lu
      : chave === '__naoOp'     ? no
      : chave === '__caixa'     ? cx
      : chave === '__acumulado' ? ac
      : (m.get(chave) ?? Array(COLUNAS).fill(0))

      return {
        rotulo, tipo, valores,
        total: chave === '__acumulado'
          ? (ac[Math.max(0, mesesFechados - 1)] ?? 0)
          : valores.reduce((a, b) => a + b, 0),
        media: chave === '__acumulado' ? 0 : media(valores),
      }
    }
  }

  const montar = (chave: string, rotulo: string, tipo: LinhaTabela['tipo']): LinhaTabela => {
    const valores =
      chave === '__lucro'     ? lucro
    : chave === '__naoOp'     ? naoOp
    : chave === '__caixa'     ? caixa
    : chave === '__acumulado' ? acumulado
    : (porLinha.get(chave) ?? Array(COLUNAS).fill(0))

    return {
      rotulo, tipo, valores,
      // No acumulado, "total" não é soma de meses: é o saldo no fim do período.
      total: chave === '__acumulado'
        ? (acumulado[Math.max(0, mesesFechados - 1)] ?? 0)
        : valores.reduce((a, b) => a + b, 0),
      media: chave === '__acumulado' ? 0 : media(valores),
    }
  }

  // As três tabelas da aba FLUXO DE CAIXA da planilha, na mesma ordem.
  const tabelas: Tabela[] = [
    {
      titulo: 'Demonstrativo do exercício',
      subtitulo: 'Do faturamento ao caixa, linha a linha do plano de contas',
      grafico: 'receita-despesa-lucro',
      linhas: ESTRUTURA.map(e => montar(e.chave, e.rotulo, e.tipo)),
    },
    {
      titulo: 'Fora da operação',
      subtitulo: 'O que sai do caixa sem passar pelo lucro — detalhado',
      grafico: 'empilhado',
      linhas: [
        montar('investimentos',        'INVESTIMENTO',                  'saida'),
        montar('emprestimos_socios',   'EMPRÉSTIMO — SÓCIOS',           'saida'),
        montar('emprestimos_terceiros', 'EMPRÉSTIMO — TERCEIROS',        'saida'),
        montar('parc_contas_antigas',  'PARCELAMENTO CONTA ANTIGA',     'saida'),
        montar('parc_contas_atuais',   'PARCELAMENTO CONTA ATUAL',      'saida'),
        montar('parc_lucro_presumido', 'PARCELAMENTO LUCRO PRESUMIDO',  'saida'),
        montar('__naoOp',              'Total',                         'total'),
      ],
    },
    {
      titulo: 'Do lucro ao caixa',
      subtitulo: 'A síntese: quanto a operação gerou, quanto saiu fora dela e o que sobrou',
      grafico: 'lucro-caixa-acumulado',
      linhas: [
        montar('__lucro',     'Lucro',     'receita'),
        montar('__naoOp',     'Outros',    'saida'),
        montar('__caixa',     'Caixa',     'total'),
        montar('__acumulado', 'Acumulado', 'acumulado'),
      ],
    },
  ]

  // ── Visão por unidade: TOTAL GRUPO + uma tabela por empresa ───────────────
  const visaoPorUnidade = filtros.visao === 'unidades'

  const tabelasPorUnidade: Tabela[] = []
  if (visaoPorUnidade) {
    const linhasDe = (m: Map<string, number[]>) => {
      const mk = montarDe(m)
      return ESTRUTURA.filter(e => e.chave !== '__acumulado')
                      .map(e => mk(e.chave, e.rotulo, e.tipo))
    }

    tabelasPorUnidade.push({
      titulo: 'TOTAL GRUPO',
      subtitulo: 'Consolidado das empresas do grupo',
      grafico: 'receita-despesa-lucro',
      linhas: linhasDe(pivotar(null)),
    })

    // Só empresas com movimento, da maior receita para a menor — a ordem que
    // interessa ao folhear o demonstrativo.
    const comMovimento = (empresas ?? [])
      .map(e => ({ empresa: e, m: pivotar(e.id) }))
      .filter(({ m }) => [...m.values()].some(serie => serie.some(v => v !== 0)))
      .sort((a, b) => {
        const rec = (m: Map<string, number[]>) => (m.get('receita_bruta') ?? []).reduce((x, y) => x + y, 0)
        return rec(b.m) - rec(a.m)
      })

    for (const { empresa, m } of comMovimento) {
      tabelasPorUnidade.push({
        titulo: empresa.nome_curto,
        subtitulo: `Demonstrativo de ${empresa.nome_curto} em ${ano}`,
        grafico: 'receita-despesa-lucro',
        linhas: linhasDe(m),
      })
    }
  }

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
            {visaoPorUnidade ? `${tabelasPorUnidade.length - 1} unidades + total do grupo` : empresaNome}
            {' · '}{modoAnual ? `${anosDisponiveis[0]} a ${anoCorrente}` : `exercício ${ano}`} · Conta Azul
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
              tabelas={visaoPorUnidade ? tabelasPorUnidade : tabelas}
              periodo={periodo}
              anoTodos={modoAnual}
              avisoSerieParcial={
                (modoAnual || ano === PRIMEIRO_ANO_PARCIAL)
                  ? `Janeiro a março de ${PRIMEIRO_ANO_PARCIAL} estão no SIGE Cloud, não no Conta Azul — a migração não trouxe o histórico. ${PRIMEIRO_ANO_PARCIAL} aparece com ${PRIMEIRO_MES_CONFIAVEL - 1} meses a menos e não é comparável com os anos seguintes.`
                  : null
              }
              visao={visaoPorUnidade ? 'unidades' : 'consolidado'}
            />
          </Suspense>
        )}
      </div>
    </main>
  )
}
