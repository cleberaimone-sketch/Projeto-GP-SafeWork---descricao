import { createClient as sb } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import DrePage from './DrePage'
import { classificarPorPlano, type LinhaDreCodigo } from '@/lib/financeiro/categorias'
import { carregarCategoriasExcluidas, isTransferenciaInterna } from '@/lib/financeiro/regras'

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

export const dynamic = 'force-dynamic'
export const maxDuration = 60  // leitura paginada de ~25k lançamentos/ano

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

  // Leitura PAGINADA — um ano tem ~25k lançamentos e o client Supabase corta em
  // 1000; sem paginar, o DRE do ano saía truncado (~4% dos dados).
  type DreLanc = { tipo: string; categoria: string | null; valor: number | null; status: string; data_vencimento: string | null; data_pagamento: string | null }
  const all: DreLanc[] = []
  const LOTE = 1000
  for (let off = 0; ; off += LOTE) {
    let q = supabase
      .from('lancamentos_financeiros')
      .select('tipo, categoria, valor, status, data_vencimento, data_pagamento')
      .gte(campoDatas, dataInicio)
      .lte(campoDatas, dataFim)
      .neq('status', 'cancelado')
      .order('id')
      .range(off, off + LOTE - 1)
    if (regime === 'caixa') q = q.in('status', ['pago', 'parcial'])  // só pagos/recebidos
    if (filters.empresa) q = q.eq('empresa_id', filters.empresa)
    const { data } = await q
    if (!data || data.length === 0) break
    all.push(...(data as DreLanc[]))
    if (data.length < LOTE) break
  }

  // A lista de movimentação interna vive no banco (categorias_excluidas), não
  // no código: quando o Cleber marca uma categoria como movimentação, ela some
  // de todas as telas sem precisar de deploy. O DRE consultava só o regex e
  // continuava contando o que as RPCs já tinham excluído.
  const excluidas = await carregarCategoriasExcluidas(supabase)

  // ── Classificar pelo plano de contas do Conta Azul ────────────────────────
  // Antes isto usava classificar(), que casa por texto. Com categoria numerada
  // ele erra: "1.03.02 Engenharia + Medicina + E-Social" virava 'pessoal' e
  // "1.05.02 Receitas Intermediadas (Moha)" virava 'impostos'. Como só algumas
  // chaves de receita eram somadas, R$ 1,77 mi de receita de 2026 sumia da tela
  // sem erro nenhum. O 1º dígito da categoria é a fonte confiável.
  const totais: Record<LinhaDreCodigo, number> = {
    receita: 0, deducoes: 0, custo: 0, administrativa: 0, financeira: 0,
    investimento: 0, emprestimo: 0, parcelamento: 0,
    transferencia: 0, sem_classificacao: 0,
  }
  const porCategoria: Partial<Record<LinhaDreCodigo, Record<string, number>>> = {}

  for (const l of all) {
    if (isTransferenciaInterna(l.categoria, excluidas)) continue  // movimentação
    const linha = classificarPorPlano(l.categoria)
    if (linha === 'transferencia') continue   // dinheiro do próprio grupo
    const valor = l.valor ?? 0
    // Receita entra positiva, despesa positiva na própria linha; o sinal é
    // aplicado na montagem do demonstrativo.
    totais[linha] += valor
    if (!porCategoria[linha]) porCategoria[linha] = {}
    const cat = l.categoria ?? 'Sem categoria'
    porCategoria[linha]![cat] = (porCategoria[linha]![cat] ?? 0) + valor
  }

  // ── Linhas do demonstrativo ───────────────────────────────────────────────
  // Estrutura tradicional até o resultado líquido; abaixo dele, o que é conta
  // patrimonial — some do lucro, mas sai do caixa e precisa estar visível.
  const recTotal   = totais.receita + totais.sem_classificacao
  const imposto    = totais.deducoes
  const recLiquida = recTotal - imposto
  const csp        = totais.custo
  const lucroBruto = recLiquida - csp
  const margemBruta = recLiquida > 0 ? (lucroBruto / recLiquida) * 100 : 0

  const totalDesp  = totais.administrativa
  const ebitda     = lucroBruto - totalDesp
  const margemEbitda = recLiquida > 0 ? (ebitda / recLiquida) * 100 : 0

  const despFin    = totais.financeira
  const resultLiquido = ebitda - despFin
  const margemLiquida = recLiquida > 0 ? (resultLiquido / recLiquida) * 100 : 0

  const investimento = totais.investimento
  const emprestimo   = totais.emprestimo
  const parcelamento = totais.parcelamento
  const totalNaoOp   = investimento + emprestimo + parcelamento
  const geracaoCaixa = resultLiquido - totalNaoOp

  function topCats(linha: LinhaDreCodigo, n = 5) {
    return Object.entries(porCategoria[linha] ?? {})
      .sort(([, a], [, b]) => b - a)
      .slice(0, n)
      .map(([nome, valor]) => ({ nome, valor }))
  }

  function m(v: number) {
    return recLiquida > 0 ? (v / recLiquida) * 100 : 0
  }

  // ── Montar blocos do DRE ──────────────────────────────────────────────────
  const blocos: DreBloco[] = [
    {
      titulo: '(+) RECEITA BRUTA DE SERVIÇOS',
      nivel: 'secao', valor: recTotal, destaque: 'total',
      categorias: topCats('receita', 8),
    },

    { titulo: '', nivel: 'subtotal', valor: 0, separador: true },

    {
      titulo: '(-) DEDUÇÕES E IMPOSTOS SOBRE VENDAS',
      nivel: 'grupo', valor: imposto, indent: 0, destaque: 'negativo',
      categorias: topCats('deducoes'),
    },

    { titulo: '', nivel: 'subtotal', valor: 0, separador: true },

    {
      titulo: '(=) RECEITA LÍQUIDA',
      nivel: 'subtotal', valor: recLiquida,
      destaque: recLiquida >= 0 ? 'positivo' : 'negativo',
    },

    { titulo: '', nivel: 'subtotal', valor: 0, separador: true },

    {
      titulo: '(-) CUSTO DOS SERVIÇOS PRESTADOS',
      nivel: 'grupo', valor: csp, destaque: 'negativo', margem: m(csp),
      categorias: topCats('custo'),
    },

    { titulo: '', nivel: 'subtotal', valor: 0, separador: true },

    {
      titulo: `(=) LUCRO BRUTO — Margem: ${margemBruta.toFixed(1)}%`,
      nivel: 'subtotal', valor: lucroBruto,
      destaque: lucroBruto >= 0 ? 'positivo' : 'negativo',
    },

    { titulo: '', nivel: 'subtotal', valor: 0, separador: true },

    {
      titulo: '(-) DESPESAS ADMINISTRATIVAS E COMERCIAIS',
      nivel: 'grupo', valor: totalDesp, destaque: 'negativo', margem: m(totalDesp),
      categorias: topCats('administrativa', 8),
    },

    { titulo: '', nivel: 'subtotal', valor: 0, separador: true },

    {
      titulo: `(=) RESULTADO OPERACIONAL (EBIT) — Margem: ${margemEbitda.toFixed(1)}%`,
      nivel: 'resultado', valor: ebitda,
      destaque: ebitda >= 0 ? 'positivo' : 'negativo',
    },

    { titulo: '', nivel: 'subtotal', valor: 0, separador: true },

    {
      titulo: '(-) DESPESAS FINANCEIRAS (juros e encargos)',
      nivel: 'grupo', valor: despFin, destaque: 'alerta', margem: m(despFin),
      categorias: topCats('financeira'),
    },

    { titulo: '', nivel: 'subtotal', valor: 0, separador: true },

    {
      titulo: resultLiquido >= 0
        ? `(=) RESULTADO LÍQUIDO — Margem: ${margemLiquida.toFixed(1)}%`
        : `(=) PREJUÍZO LÍQUIDO — Margem: ${margemLiquida.toFixed(1)}%`,
      nivel: 'total', valor: resultLiquido,
      destaque: resultLiquido >= 0 ? 'positivo' : 'negativo',
    },

    // ── Abaixo da linha: conta patrimonial ──────────────────────────────────
    // Não são despesa — não entram no lucro — mas saem do caixa. Ficam aqui
    // para que a empresa que lucra na operação e queima o resultado pagando
    // dívida apareça como tal, em vez de o dinheiro simplesmente sumir.
    { titulo: '', nivel: 'subtotal', valor: 0, separador: true },

    {
      titulo: '(-) FORA DA OPERAÇÃO — não afeta o lucro, sai do caixa',
      nivel: 'secao', valor: totalNaoOp, destaque: 'negativo',
    },
    ...(investimento > 0 ? [{
      titulo: '  Investimentos em imobilizado (CAPEX)',
      nivel: 'grupo' as const, valor: investimento, indent: 1, margem: m(investimento),
      categorias: topCats('investimento'),
    }] : []),
    ...(emprestimo > 0 ? [{
      titulo: '  Empréstimos — principal',
      nivel: 'grupo' as const, valor: emprestimo, indent: 1, margem: m(emprestimo),
      categorias: topCats('emprestimo'),
    }] : []),
    ...(parcelamento > 0 ? [{
      titulo: '  Parcelamentos e contas atrasadas — principal',
      nivel: 'grupo' as const, valor: parcelamento, indent: 1, margem: m(parcelamento),
      categorias: topCats('parcelamento'),
    }] : []),

    { titulo: '', nivel: 'subtotal', valor: 0, separador: true },

    {
      titulo: geracaoCaixa >= 0
        ? '(=) GERAÇÃO DE CAIXA — o que sobra depois de tudo'
        : '(=) CONSUMO DE CAIXA — a operação não cobre o que sai',
      nivel: 'total', valor: geracaoCaixa,
      destaque: geracaoCaixa >= 0 ? 'positivo' : 'negativo',
    },
  ]

  // ── DRE mensal (jan-dez lado a lado + acumulado) — só no exercício completo ──
  function kpisDre(lancs: typeof all) {
    const t: Record<LinhaDreCodigo, number> = {
      receita: 0, deducoes: 0, custo: 0, administrativa: 0, financeira: 0,
      investimento: 0, emprestimo: 0, parcelamento: 0,
      transferencia: 0, sem_classificacao: 0,
    }
    for (const l of lancs) {
      if (isTransferenciaInterna(l.categoria, excluidas)) continue
      const linha = classificarPorPlano(l.categoria)
      if (linha === 'transferencia') continue
      t[linha] += l.valor ?? 0
    }
    const rTotal = t.receita + t.sem_classificacao
    const rLiq   = rTotal - t.deducoes
    const lBruto = rLiq - t.custo
    const ebit   = lBruto - t.administrativa
    const result = ebit - t.financeira
    const naoOp  = t.investimento + t.emprestimo + t.parcelamento
    return {
      receita: rTotal, impostos: t.deducoes, recLiquida: rLiq, csp: t.custo,
      lucroBruto: lBruto, despesas: t.administrativa, ebitda: ebit,
      financeiro: -t.financeira, resultado: result,
      naoOperacional: naoOp, caixa: result - naoOp,
    }
  }

  interface DreMensalLinha { label: string; tipo: 'receita' | 'deducao' | 'subtotal' | 'resultado'; valores: number[]; acumulado: number }
  let dreMensal: DreMensalLinha[] = []
  if (!mes) {
    const porMes = Array.from({ length: 12 }, (_, i) => {
      const mm = String(i + 1).padStart(2, '0')
      const doMes = all.filter(l => {
        const dataL = (regime === 'caixa' ? l.data_pagamento : l.data_vencimento) ?? ''
        return dataL.startsWith(`${ano}-${mm}`)
      })
      return kpisDre(doMes)
    })
    const linhas: { label: string; key: keyof ReturnType<typeof kpisDre>; tipo: DreMensalLinha['tipo'] }[] = [
      { label: '(+) Receita Bruta',    key: 'receita',    tipo: 'receita' },
      { label: '(-) Impostos',         key: 'impostos',   tipo: 'deducao' },
      { label: '(=) Receita Líquida',  key: 'recLiquida', tipo: 'subtotal' },
      { label: '(-) CSP',              key: 'csp',        tipo: 'deducao' },
      { label: '(=) Lucro Bruto',      key: 'lucroBruto', tipo: 'subtotal' },
      { label: '(-) Despesas Admin.',  key: 'despesas',   tipo: 'deducao' },
      { label: '(=) Result. Operacional', key: 'ebitda',  tipo: 'subtotal' },
      { label: '(+/-) Financeiro',     key: 'financeiro', tipo: 'deducao' },
      { label: '(=) Resultado Líquido', key: 'resultado', tipo: 'resultado' },
      { label: '(-) Fora da operação', key: 'naoOperacional', tipo: 'deducao' },
      { label: '(=) Geração de Caixa', key: 'caixa',      tipo: 'resultado' },
    ]
    dreMensal = linhas.map(ln => {
      const valores = porMes.map(k => k[ln.key])
      return { label: ln.label, tipo: ln.tipo, valores, acumulado: valores.reduce((s, v) => s + v, 0) }
    })
  }

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
    totalDespesas: imposto + csp + totalDesp + despFin + totalNaoOp,
    totalLancamentos: all.length,
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
          <h1 className="text-2xl font-bold tracking-tight">DRE — Demonstração de Resultado</h1>
          <p className="text-blue-100/90 text-sm">Estrutura gerencial · Conta Azul · {all.length.toLocaleString('pt-BR')} lançamentos no período</p>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6 md:py-8">
        <Suspense>
          <DrePage
            empresas={empresas ?? []}
            blocos={blocos}
            kpis={kpis}
            periodo={periodo}
            empresaNome={empresaNome}
            regime={regime}
            regimeLabel={regimeLabel}
            dreMensal={dreMensal}
          />
        </Suspense>
      </div>
    </main>
  )
}
