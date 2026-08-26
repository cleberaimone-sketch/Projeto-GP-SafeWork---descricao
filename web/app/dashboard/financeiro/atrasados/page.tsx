import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import AtrasadosClient from './AtrasadosClient'
import PainelDivida, { type ItemCategoria, type PontoCronograma, type PontoSerie } from './PainelDivida'
import type { LancamentoAtrasado, AgingBucket, ResumoEmpresa, KpisAtrasados } from './AtrasadosClient'
import FiltroPeriodo from '../FiltroPeriodo'
import {
  carregarCategoriasExcluidas,
  isTransferenciaInterna,
} from '@/lib/financeiro/regras'
import type { GraficoAnualMes } from '../GraficoAnual'

const NOMES_MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

interface SP { empresa?: string; lado?: 'receber' | 'pagar'; de?: string; ate?: string }

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

  // Período: ano atual por padrão (permite ver outros anos / mês / tudo via FiltroPeriodo)
  const anoAtual = hoje.getFullYear()
  const de  = filters.de  ?? `${anoAtual}-01-01`
  const ate = filters.ate ?? `${anoAtual}-12-31`

  // ── Queries ───────────────────────────────────────────────────────────────
  // Exercício do painel de dívida: sai do filtro de período quando ele cobre
  // um ano inteiro; caso contrário, o painel mostra todos os exercícios.
  const anoFiltrado = (de.slice(5) === '01-01' && ate.slice(5) === '12-31' && de.slice(0, 4) === ate.slice(0, 4))
    ? Number(de.slice(0, 4))
    : null

  const [
    { data: empresas },
    { data: rawLancamentos },
    excluidas,
    { data: catRaw },
    { data: cronRaw },
    { data: serieRaw },
  ] = await Promise.all([
    sb.from('empresas').select('id, nome_curto').order('nome_curto'),
    (() => {
      // Vencidos/pendentes com vencimento passado, dentro do período selecionado
      let q = sb
        .from('lancamentos_financeiros')
        .select('id, empresa_id, tipo, descricao, categoria, valor, data_vencimento, data_pagamento, status, cliente_id')
        .neq('status', 'cancelado')
        .neq('status', 'pago')
        .neq('status', 'parcial')
        .not('data_vencimento', 'is', null)
        .lt('data_vencimento', hojeISO)
        .gte('data_vencimento', de)
        .lte('data_vencimento', ate)
        .order('data_vencimento', { ascending: true })
      if (filters.empresa) q = q.eq('empresa_id', filters.empresa)
      return q
    })(),
    carregarCategoriasExcluidas(sb),
    // Saldo devedor: escopo próprio, sem o recorte de período da lista abaixo.
    // A dívida não respeita exercício — o atraso de 2025 continua sendo dívida.
    sb.rpc('fn_divida_por_categoria', { p_ano: anoFiltrado, p_empresa_id: filters.empresa ?? null }),
    sb.rpc('fn_divida_cronograma',    { p_empresa_id: filters.empresa ?? null }),
    sb.rpc('fn_divida_serie_mensal',  { p_de: null, p_ate: null, p_empresa_id: filters.empresa ?? null }),
  ])

  // ── Saldo devedor ─────────────────────────────────────────────────────────
  const categoriasDivida: ItemCategoria[] = ((catRaw ?? []) as Record<string, unknown>[])
    .map(r => ({
      categoria: String(r.categoria ?? '—'),
      emAberto: Number(r.em_aberto ?? 0),
      jaPago:   Number(r.ja_pago ?? 0),
      total:    Number(r.total ?? 0),
      atrasado: Number(r.atrasado ?? 0),
      aVencer:  Number(r.a_vencer ?? 0),
      titulos:  Number(r.titulos_abertos ?? 0),
    }))
    .sort((a, b) => b.emAberto - a.emAberto)

  const linhasCron = ((cronRaw ?? []) as Record<string, unknown>[]).map(r => ({
    mes: r.mes ? String(r.mes).slice(0, 7) : null,
    valor: Number(r.valor ?? 0),
    titulos: Number(r.titulos ?? 0),
  }))
  const vencidoAgregado = linhasCron.find(l => l.mes === null)
  const atrasadoTotal = vencidoAgregado?.valor ?? 0
  const atrasadoTitulos = vencidoAgregado?.titulos ?? 0

  const cronograma: PontoCronograma[] = linhasCron
    .filter((l): l is { mes: string; valor: number; titulos: number } => l.mes !== null)
    .sort((a, b) => a.mes.localeCompare(b.mes))
    .map(l => ({ ...l, saldoApos: 0 }))

  const aVencerTotal = cronograma.reduce((s, c) => s + c.valor, 0)
  const saldoDevedorTotal = atrasadoTotal + aVencerTotal

  // Curva descendente: parte do total devido e desconta o que vence a cada mês.
  let restante = saldoDevedorTotal
  for (const c of cronograma) { restante -= c.valor; c.saldoApos = restante }

  const serieDivida: PontoSerie[] = ((serieRaw ?? []) as Record<string, unknown>[])
    .map(r => ({
      mes: String(r.mes).slice(0, 7),
      vencido: Number(r.vencido ?? 0),
      titulos: Number(r.titulos ?? 0),
    }))
    .sort((a, b) => a.mes.localeCompare(b.mes))

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

  // ── Gráfico anual (jan-dez): contas a pagar por mês de vencimento — total e pago ──
  // Segue o ANO do filtro de cima (de); por padrão o ano atual.
  const anoGraf = parseInt((de ?? '').slice(0, 4)) || anoAtual
  let qGrafico = sb.from('lancamentos_financeiros')
    .select('valor, data_vencimento, data_pagamento, status, categoria')
    .neq('status', 'cancelado')
    .eq('tipo', 'despesa')
    .or(`and(data_vencimento.gte.${anoGraf}-01-01,data_vencimento.lte.${anoGraf}-12-31),and(data_pagamento.gte.${anoGraf}-01-01,data_pagamento.lte.${anoGraf}-12-31)`)
  if (filters.empresa) qGrafico = qGrafico.eq('empresa_id', filters.empresa)
  const { data: rawAnoPagar } = await qGrafico

  const baseP = (rawAnoPagar ?? []).filter(l => !isTransferenciaInterna(l.categoria, excluidas))
  const graficoAnual: GraficoAnualMes[] = []
  let acumSaldo = 0
  for (let m = 0; m < 12; m++) {
    const mesKey = `${anoGraf}-${String(m + 1).padStart(2, '0')}`
    // total = o que VENCE no mês ; pago = o que foi PAGO no mês (por data de pagamento, inclui atrasados quitados)
    const total = baseP.filter(l => (l.data_vencimento ?? '').startsWith(mesKey)).reduce((s, l) => s + (l.valor ?? 0), 0)
    const pago  = baseP.filter(l => (l.status === 'pago' || l.status === 'parcial') && (l.data_pagamento ?? '').startsWith(mesKey)).reduce((s, l) => s + (l.valor ?? 0), 0)
    // Acumulado = saldo devedor: soma o que vence e DESCONTA o que foi pago (sobe ao vencer, desce ao pagar)
    acumSaldo += (total - pago)
    graficoAnual.push({ mes: NOMES_MES[m], total, pago, acumulado: acumSaldo })
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
          <FiltroPeriodo de={de} ate={ate} anoAtual={anoAtual} />

          <div className="mt-6">
            <PainelDivida
              ano={anoFiltrado}
              anoCorrente={anoAtual}
              empresaId={filters.empresa ?? null}
              empresas={empresas ?? []}
              categorias={categoriasDivida}
              cronograma={cronograma}
              serie={serieDivida}
              saldoTotal={saldoDevedorTotal}
              atrasadoTotal={atrasadoTotal}
              atrasadoTitulos={atrasadoTitulos}
              aVencerTotal={aVencerTotal}
            />
          </div>
        </Suspense>
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
            graficoAnual={graficoAnual}
            anoGrafico={anoGraf}
          />
        </Suspense>
      </div>
    </main>
  )
}
