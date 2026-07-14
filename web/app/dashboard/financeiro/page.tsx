import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import FiltrosFinanceiro from './FiltrosFinanceiro'
import SyncButton from './SyncButton'
import PlataChat from './PlataChat'
import FluxoCaixaChart from './FluxoCaixaChart'
import DashboardFinanceiro from './DashboardFinanceiro'
import CockpitCFO, { type CockpitData } from './CockpitCFO'
import MapaEmpresas, { type MapaEmpresaItem } from './MapaEmpresas'
import { classificar } from '@/lib/financeiro/categorias'
import {
  carregarCategoriasExcluidas,
  isTransferenciaInterna,
} from '@/lib/financeiro/regras'
import { pluggyConfigurado } from '@/lib/pluggy/client'
import type { WaterfallItem, AgingItem, TrendMes, EmpresaBar, KpiData } from './DashboardFinanceiro'
import type { FluxoMes, FluxoBucket } from './FluxoCaixaChart'

// Nunca servir dados cacheados — filtros mudam os params e precisam re-executar todas as queries
export const dynamic    = 'force-dynamic'
export const maxDuration = 60

interface SP { empresa?: string; de?: string; ate?: string; tipo?: string; status?: string; serie?: string }

function toISO(d: Date) { return d.toISOString().split('T')[0] }

export default async function FinanceiroDashboard({ searchParams }: { searchParams: Promise<SP> }) {
  const filters = await searchParams
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) redirect('/login')

  const sb = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // ── Datas ─────────────────────────────────────────────────────────────────
  const hoje        = new Date()
  const hojeISO     = toISO(hoje)
  const d30  = new Date(hoje); d30.setDate(hoje.getDate() + 30)
  const d60  = new Date(hoje); d60.setDate(hoje.getDate() + 60)
  const d90  = new Date(hoje); d90.setDate(hoje.getDate() + 90)

  const pluggyOk = pluggyConfigurado()

  // Período padrão: MÊS ATUAL (Cockpit, KPIs, Mapa, Waterfall abrem no mês corrente)
  const fimMesAtual    = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)
  const inicioMesAtual = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  const defaultDe   = filters.de  ?? toISO(inicioMesAtual)
  const defaultAte  = filters.ate ?? toISO(fimMesAtual)
  // Nº de meses do período filtrado (p/ média mensal no Mapa de Empresas)
  const mesesPeriodo = Math.max(1,
    (parseInt(defaultAte.slice(0, 4)) - parseInt(defaultDe.slice(0, 4))) * 12
    + (parseInt(defaultAte.slice(5, 7)) - parseInt(defaultDe.slice(5, 7))) + 1)

  // ── Janela da série temporal (Tendência EBITDA + Fluxo de Caixa) ──────────
  // Segue o FILTRO de período quando ele cobre mais de um mês (atalhos 2025/2024
  // ou intervalo custom) — assim os gráficos acompanham o atalho de ano. Sem
  // filtro multi-mês, usa o seletor de série (ano / 12 meses / ano anterior).
  const anoAtual = hoje.getFullYear()
  const serieSel = filters.serie ?? 'ano'   // 'ano' | '12m' | 'ano_ant'
  // Se o usuário escolheu explicitamente uma série (botão), ela vence; senão o
  // filtro de período multi-mês (atalho de ano) manda nos gráficos.
  const filtroMultiMes = !filters.serie && !!(filters.de && filters.ate && filters.de.slice(0, 7) !== filters.ate.slice(0, 7))
  let serieDe: string, serieAte: string, serieLabel: string
  if (filtroMultiMes) {
    serieDe = filters.de!
    serieAte = filters.ate!
    const ya = filters.de!.slice(0, 4), yb = filters.ate!.slice(0, 4)
    serieLabel = ya === yb ? ya : `${filters.de} → ${filters.ate}`
  } else if (serieSel === '12m') {
    serieDe = toISO(new Date(anoAtual, hoje.getMonth() - 11, 1))
    serieAte = toISO(fimMesAtual)
    serieLabel = 'Últimos 12 meses'
  } else if (serieSel === 'ano_ant') {
    serieDe = `${anoAtual - 1}-01-01`
    serieAte = `${anoAtual - 1}-12-31`
    serieLabel = String(anoAtual - 1)
  } else {
    serieDe = `${anoAtual}-01-01`
    serieAte = toISO(fimMesAtual)
    serieLabel = String(anoAtual)
  }

  // Janela FIXA do Cockpit: últimos 13 meses (sempre) — garante comparação mês atual vs anterior
  const cockpitDe  = toISO(new Date(anoAtual, hoje.getMonth() - 12, 1))
  const cockpitAte = toISO(fimMesAtual)

  // Janelas para queries de aging/overdue e DSO
  const umAnoAtras = toISO(new Date(hoje.getFullYear() - 1, hoje.getMonth(), hoje.getDate()))
  const d90atras   = toISO(new Date(hoje.getTime() - 90 * 86400000))

  // Params base para as RPCs do período filtrado (empresa e tipo opcionais)
  const rpcBase: Record<string, string> = { p_de: defaultDe, p_ate: defaultAte }
  if (filters.empresa) rpcBase.p_empresa_id = filters.empresa
  if (filters.tipo)    rpcBase.p_tipo       = filters.tipo

  // Params da série (Tendência/Fluxo): mesmo empresa/tipo, janela própria
  const rpcSerie: Record<string, string> = { p_de: serieDe, p_ate: serieAte }
  if (filters.empresa) rpcSerie.p_empresa_id = filters.empresa
  if (filters.tipo)    rpcSerie.p_tipo       = filters.tipo

  // Params do Cockpit (mês atual vs anterior): janela fixa, respeita empresa/tipo
  const rpcCockpit: Record<string, string> = { p_de: cockpitDe, p_ate: cockpitAte }
  if (filters.empresa) rpcCockpit.p_empresa_id = filters.empresa
  if (filters.tipo)    rpcCockpit.p_tipo       = filters.tipo

  // Não-operacional para o FLUXO DE CAIXA. As RPCs fn_financeiro_* excluem
  // grupos 5-8 e empréstimos/venda de ativos do accrual (regra do DRE) — mas o
  // fluxo de caixa PRECISA deles nas saídas/entradas, senão o pago dá menos que
  // o recebido e o saldo fica positivo/crescente falso. Busca com filtro
  // superset (prefixo 5-8 + nomes) e aplica a MESMA regra de fn_nao_operacional
  // em JS, agregando por mês de vencimento (pago vs pendente).
  async function agregarNaoOpFluxo(de: string, ate: string): Promise<Record<string, { rec: number; recPrev: number; desp: number; despPrev: number }>> {
    const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase()
    const naoOp = (c: string | null | undefined) => {
      const t = String(c ?? '').trim()
      if (['5', '6', '7', '8'].includes(t.charAt(0))) return true
      const n = norm(t)
      return n.startsWith('EMPRESTIMO') || n === 'VENDA DE ATIVOS' || n === 'OI'
    }
    const acc: Record<string, { rec: number; recPrev: number; desp: number; despPrev: number }> = {}
    const LOTE = 1000
    for (let offset = 0; ; offset += LOTE) {
      let q = sb.from('lancamentos_financeiros')
        .select('tipo, valor, status, categoria, data_vencimento')
        .neq('status', 'cancelado')
        .gte('data_vencimento', de).lte('data_vencimento', ate)
        .or('categoria.like.5%,categoria.like.6%,categoria.like.7%,categoria.like.8%,categoria.ilike.%mprestimo%,categoria.ilike.%mpréstimo%,categoria.ilike.%ativo%,categoria.ilike.oi')
        .order('id').range(offset, offset + LOTE - 1)
      if (filters.empresa) q = q.eq('empresa_id', filters.empresa)
      if (filters.tipo)    q = q.eq('tipo', filters.tipo)
      const { data } = await q
      if (!data || data.length === 0) break
      for (const l of data) {
        if (!naoOp(l.categoria)) continue
        const mes = (l.data_vencimento ?? '').slice(0, 7)
        if (!mes) continue
        if (!acc[mes]) acc[mes] = { rec: 0, recPrev: 0, desp: 0, despPrev: 0 }
        const v = Number(l.valor ?? 0)
        const pago = l.status === 'pago' || l.status === 'parcial'
        if (l.tipo === 'receita') { acc[mes].rec += v; if (!pago) acc[mes].recPrev += v }
        else                      { acc[mes].desp += v; if (!pago) acc[mes].despPrev += v }
      }
      if (data.length < LOTE) break
    }
    return acc
  }

  // ── Queries paralelas ─────────────────────────────────────────────────────
  const [
    { data: empresas },
    { data: saldosAtivos },
    { data: syncLog },
    { data: convData },
    { data: pendentes90d },
    { data: saldosPluggy },
    excluidas,
    // RPC 1: totais mensais do PERÍODO filtrado (mês atual default) — KPIs e totais
    { data: mensaisRaw },
    // RPC 1b: série temporal (ano atual default) — Tendência + Fluxo + sparklines
    { data: mensaisSerieRaw },
    // RPC 1c: janela fixa 13 meses — Cockpit mês a mês + runway
    { data: mensaisCockpitRaw },
    // RPC 2: totais por categoria — para waterfall EBITDA
    { data: categoriasRaw },
    // RPC 4: receita/despesa por empresa no período — Mapa de Empresas + gráfico por empresa
    { data: porEmpresaRaw },
    // Contas atrasadas: vencidas e não pagas (último 1 ano)
    { data: atrasadosRaw },
    // Empréstimos / parcelamentos: filtrado por categoria (poucas linhas)
    { data: emprestimosRaw },
    // A/R Aging: contas a receber não pagas (último 1 ano)
    { data: agingRaw },
    // DSO: receitas pagas nos últimos 90 dias
    { data: dsoRaw },
    // Não-operacional (empréstimos/parcelas/juros) por mês — completa o Fluxo
    naoOpFluxoRaw,
  ] = await Promise.all([
    sb.from('empresas').select('id, nome_curto, status').order('nome_curto'),
    sb.from('v_saldos_ativos').select('*').order('nome_exibicao'),
    sb.from('sync_log').select('finalizado_em').eq('fonte', 'conta_azul').order('finalizado_em', { ascending: false }).limit(1),
    sb.from('conversas_ia').select('mensagens').eq('agente', 'plata').eq('canal', 'dashboard').eq('contato_id', user.id).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    sb.from('lancamentos_financeiros')
      .select('tipo, valor, data_vencimento, status, categoria')
      .in('status', ['pendente', 'vencido'])
      .gte('data_vencimento', hojeISO)
      .lte('data_vencimento', toISO(d90)),
    sb.from('v_saldos_pluggy').select('*').order('banco'),
    carregarCategoriasExcluidas(sb),
    sb.rpc('fn_financeiro_mensal', rpcBase),
    sb.rpc('fn_financeiro_mensal', rpcSerie),
    sb.rpc('fn_financeiro_mensal', rpcCockpit),
    sb.rpc('fn_financeiro_categorias', rpcBase),
    sb.rpc('fn_financeiro_por_empresa', { p_de: defaultDe, p_ate: defaultAte }),
    sb.from('lancamentos_financeiros')
      .select('empresa_id, tipo, valor, data_vencimento, categoria')
      .in('status', ['pendente', 'vencido'])
      .lt('data_vencimento', hojeISO)
      .gte('data_vencimento', umAnoAtras),
    sb.from('lancamentos_financeiros')
      .select('tipo, valor, data_vencimento, data_pagamento, status, categoria')
      .or('categoria.ilike.%empr%,categoria.ilike.%parcelamento%,categoria.ilike.%parcela%')
      .neq('status', 'cancelado')
      .gte('data_vencimento', defaultDe)
      .lte('data_vencimento', defaultAte),
    sb.from('lancamentos_financeiros')
      .select('tipo, valor, data_vencimento, status, categoria')
      .eq('tipo', 'receita')
      .in('status', ['pendente', 'vencido', 'parcial'])
      .gte('data_vencimento', umAnoAtras),
    sb.from('lancamentos_financeiros')
      .select('data_vencimento, data_pagamento, valor')
      .eq('tipo', 'receita')
      .eq('status', 'pago')
      .not('data_pagamento', 'is', null)
      .gte('data_pagamento', d90atras),
    agregarNaoOpFluxo(serieDe, serieAte),
  ])

  // ── Orçamento (metas) do exercício — para o orçado × realizado ──────────────
  const anoFiltro = parseInt(defaultDe.slice(0, 4))
  let qMetas = sb.from('metas_orcamentarias').select('tipo, valor_meta').eq('ano', anoFiltro)
  qMetas = filters.empresa ? qMetas.eq('empresa_id', filters.empresa) : qMetas.is('empresa_id', null)
  const { data: metasRaw } = await qMetas
  let orcadoReceita = 0, orcadoDespesa = 0
  for (const meta of metasRaw ?? []) {
    const v = parseFloat(meta.valor_meta) || 0
    if (meta.tipo === 'receita') orcadoReceita += v
    else orcadoDespesa += v
  }
  const temOrcamento = (metasRaw?.length ?? 0) > 0

  // Mapeia v_saldos_ativos para a forma esperada pelos componentes
  const saldos = (saldosAtivos ?? []).map(s => ({
    id: s.conta_ativa_id,
    empresa_id: s.empresa_id,
    banco: s.nome_exibicao,
    conta: s.numero_cc,
    agencia: s.agencia,
    saldo: s.saldo ?? 0,
    data_referencia: s.data_referencia,
    fonte: s.fonte_saldo ?? s.fonte_dados,
    tipo_conta: s.tipo_conta,
  }))

  // ── Lookups ───────────────────────────────────────────────────────────────
  const empresaMap: Record<string, string> = {}
  for (const e of empresas ?? []) empresaMap[e.id] = e.nome_curto

  const initialMessages = ((convData?.mensagens ?? []) as { role: 'user' | 'assistant'; content: string }[]).slice(-30)
  const filtroAtivo = !!(filters.empresa || filters.de || filters.ate || filters.tipo || filters.status)
  const ultimoSync  = syncLog?.[0]?.finalizado_em
    ? new Date(syncLog[0].finalizado_em).toLocaleString('pt-BR')
    : 'Nunca'

  // ── Saldos bancários ──────────────────────────────────────────────────────
  const totalSaldos = (saldos ?? []).reduce((s, b) => s + (b.saldo ?? 0), 0)
  const saldoPorEmpresa: Record<string, { positivo: number; negativo: number; liquido: number }> = {}
  for (const s of saldos) {
    if (!s.empresa_id) continue
    if (!saldoPorEmpresa[s.empresa_id]) saldoPorEmpresa[s.empresa_id] = { positivo: 0, negativo: 0, liquido: 0 }
    const v = s.saldo ?? 0
    if (v > 0) saldoPorEmpresa[s.empresa_id].positivo += v
    else       saldoPorEmpresa[s.empresa_id].negativo += Math.abs(v)
    saldoPorEmpresa[s.empresa_id].liquido += v
  }

  // ── Regex empréstimos ─────────────────────────────────────────────────────
  const REGEX_EMPRESTIMO = /empr[eé]stimo|emprestimo|parcelamento|parcela/i
  function isEmprestimo(cat: string | null | undefined): boolean {
    return !!cat && REGEX_EMPRESTIMO.test(cat)
  }

  // ── mesMap: helper que agrega linhas de fn_financeiro_mensal ──────────────
  // Cada linha do RPC tem: { mes, tipo, status_grupo, total, qtd }
  // status_grupo: 'pago' | 'vencido' | 'pendente' (accrual) | 'caixa_pago' (cash by data_pagamento)
  type MesEntry = { rec: number; desp: number; recPago: number; despPago: number; recPrev: number; despPrev: number }
  type MensalRow = { mes: string; tipo: string; status_grupo: string; total: number; qtd: number }
  function construirMesMap(rows: MensalRow[] | null): Record<string, MesEntry> {
    const map: Record<string, MesEntry> = {}
    for (const row of rows ?? []) {
      const key = row.mes
      if (!map[key]) map[key] = { rec: 0, desp: 0, recPago: 0, despPago: 0, recPrev: 0, despPrev: 0 }
      const entry = map[key]
      const v = Number(row.total)
      if (row.status_grupo === 'caixa_pago') {
        if (row.tipo === 'receita') entry.recPago  += v
        else                        entry.despPago += v
      } else {
        if (row.tipo === 'receita') {
          entry.rec += v
          if (row.status_grupo === 'pendente' || row.status_grupo === 'vencido') entry.recPrev += v
        } else {
          entry.desp += v
          if (row.status_grupo === 'pendente' || row.status_grupo === 'vencido') entry.despPrev += v
        }
      }
    }
    return map
  }

  // 3 janelas distintas: período do filtro, série (Tendência/Fluxo), cockpit (mês a mês)
  const mesMap        = construirMesMap(mensaisRaw as MensalRow[] | null)        // período filtrado
  const mesMapSerie   = construirMesMap(mensaisSerieRaw as MensalRow[] | null)   // ano atual / 12m / ano anterior
  const mesMapCockpit = construirMesMap(mensaisCockpitRaw as MensalRow[] | null) // 13 meses fixos

  const mesesOrdenados      = Object.entries(mesMap).sort(([a], [b]) => a.localeCompare(b))
  const mesesSerieOrdenados = Object.entries(mesMapSerie).sort(([a], [b]) => a.localeCompare(b))
  const totalLancamentos = (mensaisRaw ?? [])
    .filter((r: { status_grupo: string }) => r.status_grupo !== 'caixa_pago')
    .reduce((s: number, r: { qtd: number }) => s + Number(r.qtd), 0)

  // ── Totais do período (filtro) ────────────────────────────────────────────
  const totalReceitas = mesesOrdenados.reduce((s, [, v]) => s + v.rec,  0)
  const totalDespesas = mesesOrdenados.reduce((s, [, v]) => s + v.desp, 0)

  // ── Tendência (série: ano atual por padrão) ───────────────────────────────
  const trend12: TrendMes[] = mesesSerieOrdenados.slice(-12).map(([key, v]) => {
    const [ano, mes] = key.split('-')
    const nomeMes = new Date(Number(ano), Number(mes) - 1, 1)
      .toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
    return { mes: nomeMes, receita: v.rec, despesa: v.desp, ebitda: v.rec - v.desp }
  })

  // ── Sparklines (últimos 6 meses da série) ─────────────────────────────────
  const spark6       = mesesSerieOrdenados.slice(-6)
  const sparkReceita = spark6.map(([, v]) => v.rec)
  const sparkDespesa = spark6.map(([, v]) => v.desp)
  const sparkEbitda  = spark6.map(([, v]) => v.rec - v.desp)

  // ── Fluxo de caixa mensal (série) — POR VENCIMENTO ────────────────────────
  // Regime de caixa real ancorado no VENCIMENTO: cada título aparece no mês em
  // que vence, não no de pagamento. Corrige a distorção das vendas parceladas
  // (o sync gravava data_pagamento = data_competência da venda, jogando
  // parcelas que vencem em 2026 lá para 2025). Com isso o fluxo reconcilia com
  // o Faturamento do mês:  entradas (pago) + entradas_prev (a receber) = rec.
  //
  // mesMapSerie é só OPERACIONAL (o RPC exclui grupos 5-8). Para o fluxo somamos
  // o não-operacional (empréstimos/parcelas/juros) — senão as saídas ficam
  // subestimadas e o saldo sobe falso. Cópia por mês para não afetar a
  // Tendência/EBITDA (que continuam operacionais, usando mesMapSerie).
  const mesMapFluxo: Record<string, MesEntry> = {}
  for (const [k, v] of Object.entries(mesMapSerie)) mesMapFluxo[k] = { ...v }
  for (const [mes, n] of Object.entries(naoOpFluxoRaw ?? {})) {
    if (!mesMapFluxo[mes]) mesMapFluxo[mes] = { rec: 0, desp: 0, recPago: 0, despPago: 0, recPrev: 0, despPrev: 0 }
    const e = mesMapFluxo[mes]
    e.rec += n.rec; e.recPrev += n.recPrev; e.desp += n.desp; e.despPrev += n.despPrev
  }
  const mesesFluxoOrdenados = Object.entries(mesMapFluxo).sort(([a], [b]) => a.localeCompare(b))

  let saldoAcum = 0
  const porFluxoMes: FluxoMes[] = mesesFluxoOrdenados.map(([key, v]) => {
    const [ano, mes] = key.split('-')
    const nomeMes = new Date(Number(ano), Number(mes) - 1, 1)
      .toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
    const entradas = v.rec  - v.recPrev   // recebido: vence no mês e já está pago
    const saidas   = v.desp - v.despPrev  // pago: vence no mês e já está pago
    const saldo = entradas - saidas
    saldoAcum += saldo
    return { mes: nomeMes, entradas, saidas, entradas_prev: v.recPrev, saidas_prev: v.despPrev, saldo, saldo_acum: saldoAcum }
  })

  // ── Cockpit — reflete o PERÍODO FILTRADO (igual ao Mapa de Empresas) ──────
  // Antes o Cockpit usava sempre o último mês com dados e ignorava o filtro de
  // data — por isso destoava do Mapa. Agora receita/despesa vêm do período
  // filtrado (mesMap/rpcBase), a mesma fonte do Mapa.
  const isMultiMes = defaultDe.slice(0, 7) !== defaultAte.slice(0, 7)
  const mesesCockpitOrdenados = Object.entries(mesMapCockpit).sort(([a], [b]) => a.localeCompare(b))
  const chavesComDados = mesesCockpitOrdenados
    .filter(([, v]) => v.rec > 0 || v.desp > 0)
    .map(([k]) => k)
  // Mês de referência: o mês filtrado (1 mês) ou o último com dados (multi-mês, só p/ label)
  const anoMesAtual = isMultiMes ? (chavesComDados.at(-1) ?? defaultAte.slice(0, 7)) : defaultDe.slice(0, 7)
  const [cpAno, cpMes] = anoMesAtual.split('-').map(Number)
  const anoMesAnt = cpMes === 1 ? `${cpAno - 1}-12` : `${cpAno}-${String(cpMes - 1).padStart(2, '0')}`
  const mAnt = mesMapCockpit[anoMesAnt]

  // Para multi-mês, compara com o mesmo span do ano anterior (melhor esforço c/ janela cockpit)
  const prevDeKey  = `${parseInt(defaultDe.slice(0, 4)) - 1}-${defaultDe.slice(5, 7)}`
  const prevAteKey = `${parseInt(defaultAte.slice(0, 4)) - 1}-${defaultAte.slice(5, 7)}`
  const recAntMulti  = Object.entries(mesMapCockpit).filter(([k]) => k >= prevDeKey && k <= prevAteKey).reduce((s, [, v]) => s + v.rec,  0)
  const despAntMulti = Object.entries(mesMapCockpit).filter(([k]) => k >= prevDeKey && k <= prevAteKey).reduce((s, [, v]) => s + v.desp, 0)

  // Receita/despesa do Cockpit = período filtrado (bate com o Mapa); comparação vs período anterior
  const receitaMesAtual = totalReceitas
  const despesaMesAtual = totalDespesas
  const receitaMesAnt   = isMultiMes ? recAntMulti  : (mAnt?.rec  ?? 0)
  const despesaMesAnt   = isMultiMes ? despAntMulti : (mAnt?.desp ?? 0)
  const lucroMesAtual   = receitaMesAtual - despesaMesAtual
  const lucroMesAnt     = receitaMesAnt   - despesaMesAnt
  const lucroDelta      = lucroMesAnt !== 0 ? ((lucroMesAtual - lucroMesAnt) / Math.abs(lucroMesAnt)) * 100 : 0
  const margemMesAtual  = receitaMesAtual > 0 ? (lucroMesAtual / receitaMesAtual) * 100 : 0
  const margemMesAnt    = receitaMesAnt   > 0 ? (lucroMesAnt   / receitaMesAnt)   * 100 : 0
  const recDelta        = receitaMesAnt  > 0 ? ((receitaMesAtual  - receitaMesAnt)  / receitaMesAnt)  * 100 : 0
  const despDelta       = despesaMesAnt  > 0 ? ((despesaMesAtual  - despesaMesAnt)  / despesaMesAnt)  * 100 : 0
  const ebitdaAtual     = lucroMesAtual
  const ebitdaAnt       = lucroMesAnt
  const ebitdaDelta     = ebitdaAnt !== 0 ? ((ebitdaAtual - ebitdaAnt) / Math.abs(ebitdaAnt)) * 100 : 0

  // Contas atrasadas — query dedicada (vencidas < hoje, status pendente/vencido)
  let contasPagarAtrasadas = 0,   qtdPagarAtrasadas = 0
  let contasReceberAtrasadas = 0, qtdReceberAtrasadas = 0
  for (const l of atrasadosRaw ?? []) {
    if (isTransferenciaInterna(l.categoria, excluidas)) continue
    if (l.tipo === 'despesa') {
      contasPagarAtrasadas += l.valor ?? 0
      qtdPagarAtrasadas    += 1
    } else if (l.tipo === 'receita') {
      contasReceberAtrasadas += l.valor ?? 0
      qtdReceberAtrasadas    += 1
    }
  }

  // Empréstimos / parcelamentos — query dedicada por categoria
  let emprestimosAReceber = 0, emprestimosAPagar = 0, emprestimosPagosMes = 0
  for (const l of emprestimosRaw ?? []) {
    if (!isEmprestimo(l.categoria)) continue
    const valor   = l.valor ?? 0
    const isPago  = l.status === 'pago' || l.status === 'parcial'
    const pendent = l.status === 'pendente' || l.status === 'vencido'
    const dataPg  = l.data_pagamento ?? l.data_vencimento
    const mesPg   = dataPg?.slice(0, 7)
    if (pendent) {
      if (l.tipo === 'receita') emprestimosAReceber += valor
      else                      emprestimosAPagar   += valor
    }
    if (isPago && l.tipo === 'despesa' && mesPg === anoMesAtual) emprestimosPagosMes += valor
  }

  function mesLabel(chave: string): string {
    if (!chave) return ''
    const [ano, mes] = chave.split('-')
    return new Date(Number(ano), Number(mes) - 1, 1)
      .toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
  }

  // Labels dinâmicos: ano completo → "2025" / "2024"; multi-mês genérico → "jan/25–dez/25"; mês único → "jun/26"
  const deAno = defaultDe.slice(0, 4)
  const ateAno = defaultAte.slice(0, 4)
  const isAnoCompleto = deAno === ateAno && defaultDe.slice(5) === '01-01' && defaultAte.slice(5) >= '12-01'
  const cockpitPeriodoLabel = isMultiMes
    ? (isAnoCompleto ? deAno : `${mesLabel(defaultDe.slice(0, 7))}–${mesLabel(defaultAte.slice(0, 7))}`)
    : mesLabel(anoMesAtual)
  const cockpitPeriodoAntLabel = isMultiMes
    ? (isAnoCompleto ? String(parseInt(deAno) - 1) : '')
    : mesLabel(anoMesAnt)

  const cockpitData: CockpitData = {
    periodoLabel:    cockpitPeriodoLabel,
    periodoAntLabel: cockpitPeriodoAntLabel,
    receitaMesAtual, receitaMesAnt, receitaDelta: recDelta,
    despesaMesAtual, despesaMesAnt, despesaDelta: despDelta,
    lucroMesAtual,   lucroMesAnt,   lucroDelta,
    margemMesAtual,  margemMesAnt,
    contasPagarAtrasadas,   qtdPagarAtrasadas,
    contasReceberAtrasadas, qtdReceberAtrasadas,
    emprestimosAReceber, emprestimosAPagar, emprestimosPagosMes,
  }

  // ── EBITDA Waterfall — via fn_financeiro_categorias ───────────────────────
  // wfRec = soma de TODAS as receitas (não só grupos nomeados) para evitar zero no waterfall
  const recGrp: Record<string, number> = {}
  const despGrp: Record<string, number> = {}
  let totalReceitaWf = 0
  for (const row of categoriasRaw ?? []) {
    const g = classificar(row.categoria)
    if (g === 'transferencia') continue
    const v = Number(row.total)
    if (row.tipo === 'receita') {
      recGrp[g] = (recGrp[g] ?? 0) + v
      totalReceitaWf += v
    } else {
      despGrp[g] = (despGrp[g] ?? 0) + v
    }
  }

  const wfRec     = totalReceitaWf
  const wfImpost  = despGrp.impostos ?? 0
  const wfRecLiq  = wfRec - wfImpost
  const wfCSP     = despGrp.csp ?? 0
  const wfLBruto  = wfRecLiq - wfCSP
  const wfPessoal = despGrp.pessoal ?? 0
  const wfAdmin   = despGrp.administrativo ?? 0
  const wfComerc  = despGrp.comercial ?? 0
  const wfOutros  = despGrp.outros ?? 0
  const wfEBITDA  = wfLBruto - wfPessoal - wfAdmin - wfComerc - wfOutros

  let runningTotal = wfLBruto
  const waterfall: WaterfallItem[] = [
    { name: 'Rec. Bruta', spacer: 0,        value: wfRec,    tipo: 'inicio'   },
    ...(wfImpost > 0 ? [{ name: 'Impostos', spacer: wfRecLiq, value: wfImpost, tipo: 'negativo' as const }] : []),
    { name: 'Rec. Líq.',  spacer: 0,        value: wfRecLiq, tipo: 'subtotal' },
    ...(wfCSP > 0    ? [{ name: 'CSP',      spacer: wfLBruto, value: wfCSP,    tipo: 'negativo' as const }] : []),
    { name: 'L. Bruto',   spacer: 0,        value: Math.max(0, wfLBruto), tipo: 'subtotal' },
  ]
  for (const [name, valor] of [['Pessoal', wfPessoal], ['Admin.', wfAdmin], ['Comerc.', wfComerc], ['Outros', wfOutros]] as [string, number][]) {
    if (valor > 0) {
      runningTotal -= valor
      waterfall.push({ name, spacer: Math.max(0, runningTotal), value: valor, tipo: 'negativo' })
    }
  }
  waterfall.push({
    name: 'EBITDA',
    spacer: wfEBITDA < 0 ? wfEBITDA : 0,
    value: Math.abs(wfEBITDA),
    tipo: wfEBITDA >= 0 ? 'resultado' : 'resultado_neg',
  })

  // ── A/R Aging — query dedicada de recebíveis não pagos ───────────────────
  const agingFiltered = (agingRaw ?? []).filter((l: { categoria: string }) => !isTransferenciaInterna(l.categoria, excluidas))
  const agingBuckets = [
    { label: 'A vencer (corrente)',    diasMin: 0,   diasMax: -1   },
    { label: '1 a 30 dias em atraso',  diasMin: 1,   diasMax: 30   },
    { label: '31 a 60 dias',           diasMin: 31,  diasMax: 60   },
    { label: '61 a 90 dias',           diasMin: 61,  diasMax: 90   },
    { label: '+90 dias (crítico)',      diasMin: 91,  diasMax: 9999 },
  ]
  const aging: AgingItem[] = agingBuckets.map(b => {
    const items = agingFiltered.filter((l: { data_vencimento: string }) => {
      if (!l.data_vencimento) return false
      const dias = Math.floor((hoje.getTime() - new Date(l.data_vencimento + 'T00:00:00').getTime()) / 86400000)
      if (b.diasMax === -1) return dias < 0
      return dias >= b.diasMin && dias <= b.diasMax
    })
    return {
      label: b.label,
      valor: items.reduce((s: number, l: { valor: number }) => s + (l.valor ?? 0), 0),
      qtd: items.length,
      diasMin: b.diasMin,
    }
  })

  // ── Por empresa — gráfico de barras (fn_financeiro_por_empresa) ───────────
  const empMap: Record<string, { rec: number; desp: number }> = {}
  for (const row of porEmpresaRaw ?? []) {
    const nome = row.empresa_id ? (empresaMap[row.empresa_id] ?? row.empresa_id) : 'Sem empresa'
    if (!empMap[nome]) empMap[nome] = { rec: 0, desp: 0 }
    if (row.tipo === 'receita') empMap[nome].rec  += Number(row.total)
    else                       empMap[nome].desp += Number(row.total)
  }
  const porEmpresa: EmpresaBar[] = Object.entries(empMap)
    .map(([empresa, v]) => ({
      empresa,
      receita: v.rec,
      despesa: v.desp,
      margem: v.rec > 0 ? ((v.rec - v.desp) / v.rec) * 100 : 0,
    }))
    .sort((a, b) => b.receita - a.receita)

  // ── Mapa de Empresas — receita/despesa do PERÍODO filtrado (sincroniza com o filtro) ──
  // Usa a mesma fonte do gráfico por empresa (fn_financeiro_por_empresa), no período de/até.
  // O saldo bancário (positivo/negativo/líquido) permanece a foto ATUAL — não tem "saldo de período".
  const empMesMap: Record<string, { rec: number; desp: number }> = {}
  for (const row of porEmpresaRaw ?? []) {
    if (!row.empresa_id) continue
    if (!empMesMap[row.empresa_id]) empMesMap[row.empresa_id] = { rec: 0, desp: 0 }
    if (row.tipo === 'receita') empMesMap[row.empresa_id].rec  += Number(row.total)
    else                       empMesMap[row.empresa_id].desp += Number(row.total)
  }
  const mapaEmpresas: MapaEmpresaItem[] = (empresas ?? [])
    .filter(e => e.id)
    .map(e => {
      const m      = empMesMap[e.id] ?? { rec: 0, desp: 0 }
      const saldo  = saldoPorEmpresa[e.id] ?? { positivo: 0, negativo: 0, liquido: 0 }
      const margem = m.rec > 0 ? ((m.rec - m.desp) / m.rec) * 100 : (m.desp > 0 ? -100 : 0)
      let status: 'verde' | 'amarelo' | 'vermelho' = 'amarelo'
      if (margem < 0 || (saldo.negativo > 0 && saldo.negativo > m.rec)) status = 'vermelho'
      else if (margem >= 15 && saldo.liquido > 0 && saldo.negativo < m.rec * 0.3) status = 'verde'
      return {
        empresa_id: e.id,
        empresa: e.nome_curto,
        receita_mes: m.rec,
        despesa_mes: m.desp,
        margem_mes: margem,
        saldo_positivo: saldo.positivo,
        saldo_negativo: saldo.negativo,
        saldo_liquido: saldo.liquido,
        status,
        descontinuando: (e as { status?: string }).status === 'descontinuando',
      }
    })
    .sort((a, b) => {
      const ordemStatus = { vermelho: 0, amarelo: 1, verde: 2 }
      if (ordemStatus[a.status] !== ordemStatus[b.status]) return ordemStatus[a.status] - ordemStatus[b.status]
      return a.margem_mes - b.margem_mes
    })

  // ── DSO (Days Sales Outstanding) ──────────────────────────────────────────
  const dsoList = (dsoRaw ?? []).filter((l: { data_pagamento: string; data_vencimento: string }) => l.data_pagamento && l.data_vencimento)
  const dso = dsoList.length > 5
    ? Math.round(dsoList.reduce((sum: number, l: { data_pagamento: string; data_vencimento: string }) => {
        const diff = new Date(l.data_pagamento).getTime() - new Date(l.data_vencimento + 'T00:00:00').getTime()
        return sum + Math.max(0, diff / 86400000)
      }, 0) / dsoList.length)
    : null

  // ── Runway ────────────────────────────────────────────────────────────────
  const last3Keys      = mesesCockpitOrdenados.slice(-3).map(([k]) => k)
  const burn3m         = last3Keys.reduce((s, k) => s + (mesMapCockpit[k]?.despPago ?? 0), 0)
  const avgMonthlyBurn = last3Keys.length > 0 ? burn3m / last3Keys.length : 0
  const runway         = avgMonthlyBurn > 0 ? Math.round((totalSaldos / avgMonthlyBurn) * 10) / 10 : null

  // ── Inadimplência ─────────────────────────────────────────────────────────
  const inadimplencia = (atrasadosRaw ?? [])
    .filter((l: { tipo: string; categoria: string }) => l.tipo === 'receita' && !isTransferenciaInterna(l.categoria, excluidas))
    .reduce((s: number, l: { valor: number }) => s + (l.valor ?? 0), 0)
  const inadimplenciaPct = totalReceitas > 0 ? (inadimplencia / totalReceitas) * 100 : 0

  // ── Previsão 90 dias ──────────────────────────────────────────────────────
  const pendentesFiltrados = (pendentes90d ?? []).filter(
    l => !isTransferenciaInterna(l.categoria, excluidas),
  )
  function makeBucket(de: Date, ate: Date, label: string): FluxoBucket {
    const items = pendentesFiltrados.filter(l => {
      const d = l.data_vencimento ?? ''
      return d >= toISO(de) && d <= toISO(ate)
    })
    const a_receber = items.filter(l => l.tipo === 'receita').reduce((s, l) => s + (l.valor ?? 0), 0)
    const a_pagar   = items.filter(l => l.tipo === 'despesa').reduce((s, l) => s + (l.valor ?? 0), 0)
    return { label, a_receber, a_pagar, saldo_liquido: a_receber - a_pagar,
      qtd_receber: items.filter(l => l.tipo === 'receita').length,
      qtd_pagar:   items.filter(l => l.tipo === 'despesa').length }
  }
  const buckets90d: FluxoBucket[] = [
    makeBucket(hoje, d30, `Próximos 30 dias (até ${toISO(d30)})`),
    makeBucket(d30,  d60, `31 a 60 dias (até ${toISO(d60)})`),
    makeBucket(d60,  d90, `61 a 90 dias (até ${toISO(d90)})`),
  ]

  // ── KPI consolidado ───────────────────────────────────────────────────────
  const kpi: KpiData = {
    receita: totalReceitas, receitaDelta: recDelta, receitaSpark: sparkReceita,
    despesa: totalDespesas, despesaDelta: despDelta, despesaSpark: sparkDespesa,
    ebitda: wfEBITDA, ebitdaDelta: ebitdaDelta, ebitdaSpark: sparkEbitda,
    margemEbitda: wfRecLiq > 0 ? (wfEBITDA / wfRecLiq) * 100 : 0,
    caixa: totalSaldos,
    inadimplencia, inadimplenciaPct,
    dso, runway,
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">

      {/* Header — banner azul corporativo */}
      <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white">
        <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6">
          <a href="/dashboard" className="text-blue-200/80 text-sm hover:text-white inline-block mb-2">← Centro de Comando</a>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-white flex items-center justify-center text-xl font-bold shadow-lg">Pl</div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Dashboard Financeiro</h1>
                <p className="text-blue-100/90 text-sm">
                  Plata · Conta Azul · {totalLancamentos.toLocaleString('pt-BR')} lançamentos{filtroAtivo ? ' (filtrado)' : ''} · Sync: {ultimoSync}
                </p>
              </div>
            </div>
            <Suspense><SyncButton /></Suspense>
          </div>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6 md:py-8">

      {/* Quick actions */}
      <div className="flex items-center gap-2 flex-wrap mb-6">
        <a href="/dashboard/financeiro/fluxo-caixa"
          className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-xs font-semibold text-emerald-800 transition-colors">
          Fluxo de Caixa →
        </a>
        <a href="/dashboard/financeiro/conciliacao"
          className="px-3 py-1.5 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg text-xs font-semibold text-teal-800 transition-colors">
          Conciliação →
        </a>
        <a href="/dashboard/financeiro/contas"
          className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 transition-colors shadow-sm">
          Contas →
        </a>
        <a href="/dashboard/financeiro/atrasados"
          className="px-3 py-1.5 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg text-xs font-semibold text-red-800 transition-colors">
          Atrasados →
        </a>
        <a href="/dashboard/financeiro/emprestimos"
          className="px-3 py-1.5 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-lg text-xs font-semibold text-violet-800 transition-colors">
          Empréstimos →
        </a>
        <a href="/dashboard/financeiro/orcamento"
          className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg text-xs font-semibold text-blue-800 transition-colors">
          Orçamento →
        </a>
        <a href="/dashboard/financeiro/sync"
          className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 transition-colors shadow-sm">
          Sync →
        </a>
        <a href="/dashboard/financeiro/dre"
          className="px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm">
          DRE →
        </a>
        <a href="/dashboard/financeiro/dre-comparativo"
          className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg text-xs font-semibold text-amber-800 transition-colors">
          DRE Comparativo →
        </a>
        <a href="/dashboard/financeiro/plata"
          className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg text-xs font-semibold text-amber-800 transition-colors">
          Plata IA →
        </a>
      </div>

      {/* Filtros */}
      <Suspense>
        <FiltrosFinanceiro empresas={empresas ?? []} />
      </Suspense>

      {/* Cockpit do CFO — KPIs principais (topo) */}
      <Suspense>
        <CockpitCFO data={cockpitData} />
      </Suspense>

      {/* Saldos Open Finance — Pluggy (aparece só quando há contas conectadas) */}
      {pluggyOk && (saldosPluggy ?? []).length > 0 && (
        <div className="mt-4 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-slate-50">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <h2 className="text-sm font-bold text-slate-800">Saldos · Open Finance</h2>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-slate-500">
                {(saldosPluggy ?? []).length} conta{(saldosPluggy ?? []).length !== 1 ? 's' : ''} · dados em tempo real
              </span>
              <a href="/dashboard/financeiro/sync" className="text-[11px] text-blue-600 hover:underline">Gerenciar →</a>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-slate-100">
            {(saldosPluggy ?? []).slice(0, 8).map((s, i) => {
              const emp = (empresas ?? []).find(e => e.id === s.empresa_id)
              const saldoNum = Number(s.saldo ?? 0)
              const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
              return (
                <div key={i} className={`px-5 py-4 ${i >= 2 ? 'border-t border-slate-100 md:border-t-0' : ''}`}>
                  <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider truncate">{emp?.nome_curto ?? '—'}</p>
                  <p className={`text-xl font-bold tabular-nums mt-1 ${saldoNum < 0 ? 'text-red-700' : 'text-slate-900'}`}>
                    {fmt(saldoNum)}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5 truncate">{s.nome_exibicao}</p>
                  <p className="text-[10px] text-emerald-600 mt-0.5">
                    {s.data_referencia ? new Date(s.data_referencia).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                  </p>
                </div>
              )
            })}
          </div>
          {(saldosPluggy ?? []).length > 8 && (
            <div className="px-5 py-2 border-t border-slate-100 bg-slate-50">
              <p className="text-[11px] text-slate-400">+{(saldosPluggy ?? []).length - 8} contas adicionais</p>
            </div>
          )}
        </div>
      )}

      {/* Mapa de Empresas — visão consolidada por unidade */}
      <Suspense>
        <MapaEmpresas empresas={mapaEmpresas} mesLabel={cockpitPeriodoLabel} meses={mesesPeriodo} />
      </Suspense>

      {/* Dashboard principal */}
      <Suspense>
        <DashboardFinanceiro
          kpi={kpi}
          waterfall={waterfall}
          aging={aging}
          trend12={trend12}
          porEmpresa={porEmpresa}
          porFluxoMes={porFluxoMes}
          buckets90d={buckets90d}
          saldoAtual={totalSaldos}
          empresas={empresas ?? []}
          saldosBancarios={saldos ?? []}
          initialMessages={initialMessages}
          filtroAtivo={filtroAtivo}
          serieSel={serieSel}
          serieLabel={serieLabel}
          anoAtual={anoAtual}
          compromissos={{
            aPagarAtrasado:     contasPagarAtrasadas,
            aReceberAtrasado:   contasReceberAtrasadas,
            emprestimosPagar:   emprestimosAPagar,
            emprestimosReceber: emprestimosAReceber,
          }}
          orcamento={{ receita: orcadoReceita, despesa: orcadoDespesa, temOrcamento }}
        />
      </Suspense>

      {/* Fluxo de Caixa */}
      <div className="mt-6">
        <Suspense>
          <FluxoCaixaChart
            porMes={porFluxoMes}
            buckets90d={buckets90d}
            saldoAtual={totalSaldos}
            serieSel={serieSel}
            serieLabel={serieLabel}
            anoAtual={anoAtual}
          />
        </Suspense>
      </div>

      {/* Chat Plata + Sync */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <h2 className="text-sm font-semibold text-slate-500 mb-3">Chat com Plata — IA Financeira</h2>
          <Suspense>
            <PlataChat initialMessages={initialMessages} />
          </Suspense>
        </div>
        <div className="space-y-4">
          <div className="bg-white rounded-xl p-4 border border-slate-200">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Sincronização</h3>
            <p className="text-xs text-slate-500 mb-3">Todas as empresas · lançamentos + saldos</p>
            <Suspense><SyncButton /></Suspense>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-200">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Pergunte ao Plata</h3>
            <div className="space-y-1 text-xs text-slate-500">
              <p>• &ldquo;Qual empresa tem melhor margem?&rdquo;</p>
              <p>• &ldquo;Comparar receita de 2025 vs 2026&rdquo;</p>
              <p>• &ldquo;Quais as maiores despesas do grupo?&rdquo;</p>
              <p>• &ldquo;Projetar receita do próximo trimestre&rdquo;</p>
            </div>
          </div>
        </div>
      </div>

      </div>
    </main>
  )
}
