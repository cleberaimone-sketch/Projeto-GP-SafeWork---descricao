import { createClient as sb } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import DrePage from './DrePage'
import { classificar, GRUPOS_LABEL } from '@/lib/financeiro/categorias'
import type { GrupoFinanceiro } from '@/lib/financeiro/categorias'

interface SP { empresa?: string; ano?: string; mes?: string; regime?: string }

// Estrutura do DRE gerencial
interface DreBloco {
  titulo: string
  nivel: 'secao' | 'grupo' | 'subtotal' | 'total' | 'resultado'
  valor: number
  margem?: number      // % sobre receita líquida
  indent?: number
  destaque?: 'positivo' | 'negativo' | 'neutro' | 'alerta' | 'total'
  separador?: boolean
  categorias?: { nome: string; valor: number }[]
}

export default async function DREPage({ searchParams }: { searchParams: Promise<SP> }) {
  const filters = await searchParams
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) redirect('/login')

  const supabase = sb(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const ano = filters.ano ?? new Date().getFullYear().toString()
  const mes = filters.mes ?? ''
  const regime = filters.regime ?? 'competencia'  // 'competencia' | 'caixa'

  // Competência: data_vencimento no período. Caixa: data_pagamento no período (apenas pagos/recebidos)
  const dataInicio = mes ? `${ano}-${mes}-01` : `${ano}-01-01`
  const dataFim    = mes ? `${ano}-${mes}-31` : `${ano}-12-31`
  const campoDatas = regime === 'caixa' ? 'data_pagamento' : 'data_vencimento'

  const { data: empresas } = await supabase.from('empresas').select('id, nome_curto, nome').order('nome_curto')

  let query = supabase
    .from('lancamentos_financeiros')
    .select('tipo, categoria, valor, status')
    .gte(campoDatas, dataInicio)
    .lte(campoDatas, dataFim)
    .neq('status', 'cancelado')

  // Regime caixa: apenas lançamentos efetivamente pagos/recebidos
  if (regime === 'caixa') {
    query = query.in('status', ['pago', 'parcial'])
  }

  if (filters.empresa) query = query.eq('empresa_id', filters.empresa)

  const { data: lancamentos } = await query
  const all = lancamentos ?? []

  // ── Classificar e agrupar por GrupoFinanceiro ──────────────────────────────
  type Grupo = GrupoFinanceiro
  const receitas: Partial<Record<Grupo, number>> = {}
  const despesas: Partial<Record<Grupo, number>> = {}

  // Categorias detalhadas por grupo (para drilldown)
  const receitasCatMap: Partial<Record<Grupo, Record<string, number>>> = {}
  const despesasCatMap: Partial<Record<Grupo, Record<string, number>>> = {}

  for (const l of all) {
    const grupo = classificar(l.categoria)
    if (grupo === 'transferencia') continue  // EXCLUIR sempre

    const cat = l.categoria ?? 'Sem categoria'
    const valor = l.valor ?? 0

    if (l.tipo === 'receita') {
      receitas[grupo] = (receitas[grupo] ?? 0) + valor
      if (!receitasCatMap[grupo]) receitasCatMap[grupo] = {}
      receitasCatMap[grupo]![cat] = (receitasCatMap[grupo]![cat] ?? 0) + valor
    } else {
      despesas[grupo] = (despesas[grupo] ?? 0) + valor
      if (!despesasCatMap[grupo]) despesasCatMap[grupo] = {}
      despesasCatMap[grupo]![cat] = (despesasCatMap[grupo]![cat] ?? 0) + valor
    }
  }

  // ── Calcular linhas do DRE gerencial ──────────────────────────────────────
  const recOp      = (receitas.receita_operacional ?? 0)
  const recFin     = (receitas.receita_financeira ?? 0)
  const recOutros  = (receitas.receita_outros ?? 0)
  const recTotal   = recOp + recFin + recOutros

  const imposto    = (despesas.impostos ?? 0)
  const recLiquida = recTotal - imposto

  const csp        = (despesas.csp ?? 0)
  const lucroBruto = recLiquida - csp
  const margemBruta = recLiquida > 0 ? (lucroBruto / recLiquida) * 100 : 0

  const pessoal    = (despesas.pessoal ?? 0)
  const admin      = (despesas.administrativo ?? 0)
  const comercial  = (despesas.comercial ?? 0)
  const outros     = (despesas.outros ?? 0)
  const totalDesp  = pessoal + admin + comercial + outros
  const ebitda     = lucroBruto - totalDesp
  const margemEbitda = recLiquida > 0 ? (ebitda / recLiquida) * 100 : 0

  // D&A estimado — não disponível no Conta Azul; mostramos aviso
  const investimento = (despesas.investimento ?? 0)
  const ebit = ebitda  // sem D&A real

  const despFin    = (despesas.financeiro ?? 0)
  const resultFin  = recFin - despFin
  const resultAntesIR = ebit + resultFin

  const resultLiquido = resultAntesIR
  const margemLiquida = recLiquida > 0 ? (resultLiquido / recLiquida) * 100 : 0

  // Categorias top por grupo
  function topCats(map: Partial<Record<Grupo, Record<string, number>>>, grupo: Grupo, n = 5) {
    const catMap = map[grupo] ?? {}
    return Object.entries(catMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, n)
      .map(([nome, valor]) => ({ nome, valor }))
  }

  function m(v: number) {
    return recLiquida > 0 ? (v / recLiquida) * 100 : 0
  }

  // ── Montar blocos do DRE ──────────────────────────────────────────────────
  const blocos: DreBloco[] = [
    // RECEITAS
    {
      titulo: '(+) RECEITA BRUTA DE SERVIÇOS',
      nivel: 'secao', valor: recTotal, destaque: 'total',
      categorias: topCats(receitasCatMap, 'receita_operacional'),
    },
    { titulo: `  Receita Operacional`, nivel: 'grupo', valor: recOp, indent: 1, margem: m(recOp) },
    ...(recFin > 0 ? [{ titulo: `  Receitas Financeiras`, nivel: 'grupo' as const, valor: recFin, indent: 1, margem: m(recFin) }] : []),
    ...(recOutros > 0 ? [{ titulo: `  Outras Receitas`, nivel: 'grupo' as const, valor: recOutros, indent: 1, margem: m(recOutros) }] : []),

    { titulo: '', nivel: 'subtotal', valor: 0, separador: true },

    // DEDUÇÕES
    {
      titulo: '(-) IMPOSTOS E TRIBUTOS',
      nivel: 'grupo', valor: imposto, indent: 0, destaque: 'negativo',
      categorias: topCats(despesasCatMap, 'impostos'),
    },
    { titulo: '  ISS, PIS, COFINS, CSLL, IRPJ', nivel: 'grupo', valor: imposto, indent: 1, margem: m(imposto) },

    { titulo: '', nivel: 'subtotal', valor: 0, separador: true },

    // RECEITA LÍQUIDA
    {
      titulo: '(=) RECEITA LÍQUIDA',
      nivel: 'subtotal', valor: recLiquida,
      destaque: recLiquida >= 0 ? 'positivo' : 'negativo',
    },

    { titulo: '', nivel: 'subtotal', valor: 0, separador: true },

    // CSP
    {
      titulo: '(-) CUSTO DOS SERVIÇOS PRESTADOS (CSP)',
      nivel: 'grupo', valor: csp, destaque: 'negativo',
      categorias: topCats(despesasCatMap, 'csp'),
    },
    { titulo: '  Exames, Clínicas, Prestadores', nivel: 'grupo', valor: csp, indent: 1, margem: m(csp) },

    { titulo: '', nivel: 'subtotal', valor: 0, separador: true },

    // LUCRO BRUTO
    {
      titulo: `(=) LUCRO BRUTO — Margem Bruta: ${margemBruta.toFixed(1)}%`,
      nivel: 'subtotal', valor: lucroBruto,
      destaque: lucroBruto >= 0 ? 'positivo' : 'negativo',
    },

    { titulo: '', nivel: 'subtotal', valor: 0, separador: true },

    // DESPESAS OPERACIONAIS
    { titulo: '(-) DESPESAS OPERACIONAIS', nivel: 'secao', valor: totalDesp, destaque: 'negativo' },
    {
      titulo: '  Pessoal (salários, encargos, benefícios)',
      nivel: 'grupo', valor: pessoal, indent: 1, margem: m(pessoal),
      categorias: topCats(despesasCatMap, 'pessoal'),
    },
    {
      titulo: '  Administrativas (aluguel, TI, seguros...)',
      nivel: 'grupo', valor: admin, indent: 1, margem: m(admin),
      categorias: topCats(despesasCatMap, 'administrativo'),
    },
    {
      titulo: '  Comerciais (marketing, comissões...)',
      nivel: 'grupo', valor: comercial, indent: 1, margem: m(comercial),
      categorias: topCats(despesasCatMap, 'comercial'),
    },
    ...(outros > 0 ? [{
      titulo: '  Outras Despesas',
      nivel: 'grupo' as const, valor: outros, indent: 1, margem: m(outros),
    }] : []),

    { titulo: '', nivel: 'subtotal', valor: 0, separador: true },

    // EBITDA
    {
      titulo: `(=) EBITDA — Margem EBITDA: ${margemEbitda.toFixed(1)}%`,
      nivel: 'resultado', valor: ebitda,
      destaque: ebitda >= 0 ? 'positivo' : 'negativo',
    },

    { titulo: '', nivel: 'subtotal', valor: 0, separador: true },

    // RESULTADO FINANCEIRO
    {
      titulo: '(+/-) RESULTADO FINANCEIRO',
      nivel: 'grupo', valor: resultFin,
      destaque: resultFin >= 0 ? 'neutro' : 'alerta',
    },
    ...(despFin > 0 ? [{
      titulo: '  Juros, IOF, tarifas bancárias',
      nivel: 'grupo' as const, valor: -despFin, indent: 1, margem: m(despFin),
      destaque: 'alerta' as const,
      categorias: topCats(despesasCatMap, 'financeiro'),
    }] : []),

    ...(investimento > 0 ? [
      { titulo: '', nivel: 'subtotal' as const, valor: 0, separador: true },
      {
        titulo: '(-) INVESTIMENTOS / CAPEX',
        nivel: 'grupo' as const, valor: investimento,
        destaque: 'neutro' as const,
        categorias: topCats(despesasCatMap, 'investimento'),
      },
    ] : []),

    { titulo: '', nivel: 'subtotal', valor: 0, separador: true },

    // RESULTADO FINAL
    {
      titulo: resultLiquido >= 0 ? `(=) RESULTADO LÍQUIDO — Margem: ${margemLiquida.toFixed(1)}%` : `(=) PREJUÍZO LÍQUIDO — Margem: ${margemLiquida.toFixed(1)}%`,
      nivel: 'total', valor: resultLiquido,
      destaque: resultLiquido >= 0 ? 'positivo' : 'negativo',
    },
  ]

  const empresaNome = filters.empresa
    ? (empresas?.find(e => e.id === filters.empresa)?.nome_curto ?? 'Empresa')
    : 'Consolidado — Holding GP SafeWork'

  const nomeMes = mes ? new Date(Number(ano), Number(mes) - 1, 1)
    .toLocaleDateString('pt-BR', { month: 'long' }) : null
  const periodo = nomeMes
    ? `${nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)} de ${ano}`
    : `Exercício ${ano}`
  const regimeLabel = regime === 'caixa' ? 'Regime de Caixa' : 'Regime de Competência'

  const kpis = {
    receitaBruta: recTotal,
    receitaLiquida: recLiquida,
    lucroBruto,
    margemBruta,
    ebitda,
    margemEbitda,
    resultadoLiquido: resultLiquido,
    margemLiquida,
    totalDespesas: imposto + csp + totalDesp + despFin,
    totalLancamentos: all.length,
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white p-6 md:p-8">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <a href="/dashboard/financeiro" className="text-gray-500 text-sm hover:text-gray-300">← Financeiro</a>
          <span className="text-gray-700">·</span>
          <a href="/dashboard" className="text-gray-500 text-sm hover:text-gray-300">Centro de Comando</a>
        </div>
        <h1 className="text-2xl font-bold mt-2">DRE — Demonstração de Resultado</h1>
        <p className="text-gray-400 text-sm">Estrutura gerencial · Conta Azul · {all.length.toLocaleString('pt-BR')} lançamentos no período</p>
      </div>

      <Suspense>
        <DrePage
          empresas={empresas ?? []}
          blocos={blocos}
          kpis={kpis}
          periodo={periodo}
          empresaNome={empresaNome}
          regime={regime}
          regimeLabel={regimeLabel}
        />
      </Suspense>
    </main>
  )
}
