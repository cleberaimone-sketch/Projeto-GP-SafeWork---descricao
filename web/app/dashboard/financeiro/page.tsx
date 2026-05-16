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
  filtrarParaDRE,
  isTransferenciaInterna,
} from '@/lib/financeiro/regras'
import type { WaterfallItem, AgingItem, TrendMes, EmpresaBar, KpiData } from './DashboardFinanceiro'
import type { FluxoMes, FluxoBucket } from './FluxoCaixaChart'

interface SP { empresa?: string; de?: string; ate?: string; tipo?: string; status?: string }

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

  // ── Queries paralelas base ────────────────────────────────────────────────
  const hoje = new Date()
  const hojeISO = toISO(hoje)
  const d30  = new Date(hoje); d30.setDate(hoje.getDate() + 30)
  const d60  = new Date(hoje); d60.setDate(hoje.getDate() + 60)
  const d90  = new Date(hoje); d90.setDate(hoje.getDate() + 90)

  const [
    { data: empresas },
    { data: saldosAtivos },
    { data: syncLog },
    { data: convData },
    { data: pendentes90d },
    excluidas,
  ] = await Promise.all([
    sb.from('empresas').select('id, nome_curto').order('nome_curto'),
    // Só saldos das contas ATIVAS (definidas em contas_bancarias_ativas)
    sb.from('v_saldos_ativos').select('*').order('nome_exibicao'),
    sb.from('sync_log').select('finalizado_em').eq('fonte', 'conta_azul').order('finalizado_em', { ascending: false }).limit(1),
    sb.from('conversas_ia').select('mensagens').eq('agente', 'plata').eq('canal', 'dashboard').eq('contato_id', user.id).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    sb.from('lancamentos_financeiros')
      .select('tipo, valor, data_vencimento, status, categoria')
      .in('status', ['pendente', 'vencido'])
      .gte('data_vencimento', hojeISO)
      .lte('data_vencimento', toISO(d90)),
    carregarCategoriasExcluidas(sb),
  ])

  // Mapeia v_saldos_ativos para a forma esperada pelos componentes (compatibilidade)
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

  // ── Query filtrada de lançamentos ─────────────────────────────────────────
  let query = sb.from('lancamentos_financeiros').select('*').neq('status', 'cancelado')
  if (filters.empresa) query = query.eq('empresa_id', filters.empresa)
  if (filters.de)      query = query.gte('data_vencimento', filters.de)
  if (filters.ate)     query = query.lte('data_vencimento', filters.ate)
  if (filters.tipo)    query = query.eq('tipo', filters.tipo)
  if (filters.status)  query = query.eq('status', filters.status)
  query = query.order('data_vencimento', { ascending: false })

  const { data: lancamentos } = await query
  const rawAll = lancamentos ?? []

  // Aplica regras de negócio: exclui transferências internas entre empresas (não são receita/despesa real).
  // Conta Modelo / Conta Atrasada serão tratadas em fase futura quando o sync trouxer o nome do banco no lançamento.
  const all = filtrarParaDRE(rawAll, excluidas)

  // ── Lookups ───────────────────────────────────────────────────────────────
  const empresaMap: Record<string, string> = {}
  for (const e of empresas ?? []) empresaMap[e.id] = e.nome_curto

  const initialMessages = ((convData?.mensagens ?? []) as { role: 'user' | 'assistant'; content: string }[]).slice(-30)
  const filtroAtivo = !!(filters.empresa || filters.de || filters.ate || filters.tipo || filters.status)
  const ultimoSync = syncLog?.[0]?.finalizado_em
    ? new Date(syncLog[0].finalizado_em).toLocaleString('pt-BR')
    : 'Nunca'

  // ── Totais base ───────────────────────────────────────────────────────────
  const receitasList = all.filter(l => l.tipo === 'receita')
  const despesasList = all.filter(l => l.tipo === 'despesa')
  const totalReceitas = receitasList.reduce((s, l) => s + (l.valor ?? 0), 0)
  const totalDespesas = despesasList.reduce((s, l) => s + (l.valor ?? 0), 0)
  const totalSaldos   = (saldos ?? []).reduce((s, b) => s + (b.saldo ?? 0), 0)

  // ── Saldos por empresa (para o Mapa de Empresas) ──────────────────────────
  const saldoPorEmpresa: Record<string, { positivo: number; negativo: number; liquido: number }> = {}
  for (const s of saldos) {
    if (!s.empresa_id) continue
    if (!saldoPorEmpresa[s.empresa_id]) saldoPorEmpresa[s.empresa_id] = { positivo: 0, negativo: 0, liquido: 0 }
    const v = s.saldo ?? 0
    if (v > 0) saldoPorEmpresa[s.empresa_id].positivo += v
    else       saldoPorEmpresa[s.empresa_id].negativo += Math.abs(v)
    saldoPorEmpresa[s.empresa_id].liquido += v
  }

  // ── Detecta empréstimos / parcelamentos por categoria ─────────────────────
  const REGEX_EMPRESTIMO = /empr[eé]stimo|emprestimo|parcelamento|parcela/i
  function isEmprestimo(cat: string | null | undefined): boolean {
    return !!cat && REGEX_EMPRESTIMO.test(cat)
  }

  // ── Por mês — para trend, sparklines e fluxo de caixa ─────────────────────
  const mesMap: Record<string, { rec: number; desp: number; recPago: number; despPago: number; recPrev: number; despPrev: number }> = {}
  for (const l of all) {
    const isPago     = l.status === 'pago' || l.status === 'parcial'
    const isPendente = l.status === 'pendente' || l.status === 'vencido'
    const dataCaixa  = isPago ? (l.data_pagamento ?? l.data_vencimento) : l.data_vencimento
    const keyComp    = l.data_vencimento?.slice(0, 7)
    const keyCaixa   = dataCaixa?.slice(0, 7)

    if (keyComp) {
      if (!mesMap[keyComp]) mesMap[keyComp] = { rec: 0, desp: 0, recPago: 0, despPago: 0, recPrev: 0, despPrev: 0 }
      if (l.tipo === 'receita') mesMap[keyComp].rec += l.valor ?? 0
      else mesMap[keyComp].desp += l.valor ?? 0
    }
    if (keyCaixa && keyCaixa !== keyComp) {
      if (!mesMap[keyCaixa]) mesMap[keyCaixa] = { rec: 0, desp: 0, recPago: 0, despPago: 0, recPrev: 0, despPrev: 0 }
    }
    const keyFluxo = keyCaixa ?? keyComp
    if (keyFluxo && mesMap[keyFluxo]) {
      if (l.tipo === 'receita') {
        if (isPago)     mesMap[keyFluxo].recPago  += l.valor ?? 0
        if (isPendente) mesMap[keyFluxo].recPrev  += l.valor ?? 0
      } else {
        if (isPago)     mesMap[keyFluxo].despPago += l.valor ?? 0
        if (isPendente) mesMap[keyFluxo].despPrev += l.valor ?? 0
      }
    }
  }

  const mesesOrdenados = Object.entries(mesMap).sort(([a], [b]) => a.localeCompare(b))

  // Trend 12 meses (últimos 12, calculando EBITDA aproximado = rec - desp)
  const trend12: TrendMes[] = mesesOrdenados.slice(-12).map(([key, v]) => {
    const [ano, mes] = key.split('-')
    const nomeMes = new Date(Number(ano), Number(mes) - 1, 1)
      .toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
    return { mes: nomeMes, receita: v.rec, despesa: v.desp, ebitda: v.rec - v.desp }
  })

  // Sparklines (últimos 6 meses)
  const spark6 = mesesOrdenados.slice(-6)
  const sparkReceita  = spark6.map(([, v]) => v.rec)
  const sparkDespesa  = spark6.map(([, v]) => v.desp)
  const sparkEbitda   = spark6.map(([, v]) => v.rec - v.desp)

  // Fluxo de caixa mensal
  let saldoAcum = 0
  const porFluxoMes: FluxoMes[] = mesesOrdenados.map(([key, v]) => {
    const [ano, mes] = key.split('-')
    const nomeMes = new Date(Number(ano), Number(mes) - 1, 1)
      .toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
    const saldo = v.recPago - v.despPago
    saldoAcum += saldo
    return { mes: nomeMes, entradas: v.recPago, saidas: v.despPago, entradas_prev: v.recPrev, saidas_prev: v.despPrev, saldo, saldo_acum: saldoAcum }
  })

  // ── Mês atual vs anterior (para deltas) ──────────────────────────────────
  const anoMesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
  const antMes = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
  const anoMesAnt = `${antMes.getFullYear()}-${String(antMes.getMonth() + 1).padStart(2, '0')}`
  const mAtual = mesMap[anoMesAtual]
  const mAnt   = mesMap[anoMesAnt]
  const recDelta  = (mAnt?.rec  ?? 0) > 0 ? (((mAtual?.rec  ?? 0) - (mAnt?.rec  ?? 0)) / mAnt.rec  ) * 100 : 0
  const despDelta = (mAnt?.desp ?? 0) > 0 ? (((mAtual?.desp ?? 0) - (mAnt?.desp ?? 0)) / mAnt.desp ) * 100 : 0
  const ebitdaAtual = (mAtual?.rec ?? 0) - (mAtual?.desp ?? 0)
  const ebitdaAnt   = (mAnt?.rec  ?? 0) - (mAnt?.desp  ?? 0)
  const ebitdaDelta = ebitdaAnt !== 0 ? ((ebitdaAtual - ebitdaAnt) / Math.abs(ebitdaAnt)) * 100 : 0

  // ── Cockpit data — Resultado do mês + Contas atrasadas + Empréstimos ─────
  const receitaMesAtual = mAtual?.rec  ?? 0
  const receitaMesAnt   = mAnt?.rec    ?? 0
  const despesaMesAtual = mAtual?.desp ?? 0
  const despesaMesAnt   = mAnt?.desp   ?? 0
  const lucroMesAtual   = receitaMesAtual - despesaMesAtual
  const lucroMesAnt     = receitaMesAnt   - despesaMesAnt
  const lucroDelta      = lucroMesAnt !== 0 ? ((lucroMesAtual - lucroMesAnt) / Math.abs(lucroMesAnt)) * 100 : 0
  const margemMesAtual  = receitaMesAtual > 0 ? (lucroMesAtual / receitaMesAtual) * 100 : 0
  const margemMesAnt    = receitaMesAnt   > 0 ? (lucroMesAnt   / receitaMesAnt)   * 100 : 0

  // Contas atrasadas (vencidas e ainda não pagas/recebidas)
  let contasPagarAtrasadas = 0,   qtdPagarAtrasadas = 0
  let contasReceberAtrasadas = 0, qtdReceberAtrasadas = 0
  for (const l of rawAll) {
    if (isTransferenciaInterna(l.categoria, excluidas)) continue
    if (l.status === 'pago' || l.status === 'parcial' || l.status === 'cancelado') continue
    if (!l.data_vencimento) continue
    if (l.data_vencimento >= hojeISO) continue  // ainda não venceu

    if (l.tipo === 'despesa') {
      contasPagarAtrasadas += l.valor ?? 0
      qtdPagarAtrasadas    += 1
    } else if (l.tipo === 'receita') {
      contasReceberAtrasadas += l.valor ?? 0
      qtdReceberAtrasadas    += 1
    }
  }

  // Empréstimos / parcelamentos
  let emprestimosAReceber   = 0  // entradas pendentes
  let emprestimosAPagar     = 0  // saídas pendentes
  let emprestimosPagosMes   = 0  // pagos no mês atual
  for (const l of rawAll) {
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
    if (isPago && l.tipo === 'despesa' && mesPg === anoMesAtual) {
      emprestimosPagosMes += valor
    }
  }

  const cockpitData: CockpitData = {
    receitaMesAtual, receitaMesAnt, receitaDelta: recDelta,
    despesaMesAtual, despesaMesAnt, despesaDelta: despDelta,
    lucroMesAtual,   lucroMesAnt,   lucroDelta,
    margemMesAtual,  margemMesAnt,
    contasPagarAtrasadas,   qtdPagarAtrasadas,
    contasReceberAtrasadas, qtdReceberAtrasadas,
    emprestimosAReceber, emprestimosAPagar, emprestimosPagosMes,
  }

  // ── EBITDA Waterfall (via classificação de categorias) ────────────────────
  const recGrp: Record<string, number> = {}
  const despGrp: Record<string, number> = {}
  for (const l of all) {
    const g = classificar(l.categoria)
    if (g === 'transferencia') continue
    if (l.tipo === 'receita') recGrp[g]  = (recGrp[g]  ?? 0) + (l.valor ?? 0)
    else                      despGrp[g] = (despGrp[g] ?? 0) + (l.valor ?? 0)
  }
  const wfRec     = (recGrp.receita_operacional ?? 0) + (recGrp.receita_financeira ?? 0) + (recGrp.receita_outros ?? 0)
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
    { name: 'Rec. Bruta',   spacer: 0,       value: wfRec,    tipo: 'inicio'   },
    ...(wfImpost > 0 ? [{ name: 'Impostos',  spacer: wfRecLiq, value: wfImpost, tipo: 'negativo' }] : []),
    { name: 'Rec. Líq.',    spacer: 0,       value: wfRecLiq, tipo: 'subtotal' },
    ...(wfCSP > 0    ? [{ name: 'CSP',       spacer: wfLBruto, value: wfCSP,    tipo: 'negativo' }] : []),
    { name: 'L. Bruto',     spacer: 0,       value: Math.max(0, wfLBruto), tipo: 'subtotal' },
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

  // ── A/R Aging ─────────────────────────────────────────────────────────────
  const agingBuckets = [
    { label: 'A vencer (corrente)',  diasMin: 0,   diasMax: -1  },
    { label: '1 a 30 dias em atraso', diasMin: 1,  diasMax: 30  },
    { label: '31 a 60 dias',          diasMin: 31, diasMax: 60  },
    { label: '61 a 90 dias',          diasMin: 61, diasMax: 90  },
    { label: '+90 dias (crítico)',     diasMin: 91, diasMax: 9999},
  ]
  const aging: AgingItem[] = agingBuckets.map(b => {
    const items = receitasList.filter(l => {
      if (l.status === 'pago' || l.status === 'cancelado') return false
      if (!l.data_vencimento) return false
      const dias = Math.floor((hoje.getTime() - new Date(l.data_vencimento + 'T00:00:00').getTime()) / 86400000)
      if (b.diasMax === -1) return dias < 0           // corrente = ainda não venceu
      return dias >= b.diasMin && dias <= b.diasMax
    })
    return {
      label: b.label,
      valor: items.reduce((s, l) => s + (l.valor ?? 0), 0),
      qtd: items.length,
      diasMin: b.diasMin,
    }
  })

  // ── Por empresa ────────────────────────────────────────────────────────────
  const empMap: Record<string, { rec: number; desp: number }> = {}
  for (const l of all) {
    const key = l.empresa_id ? (empresaMap[l.empresa_id] ?? l.empresa_id) : 'Sem empresa'
    if (!empMap[key]) empMap[key] = { rec: 0, desp: 0 }
    if (l.tipo === 'receita') empMap[key].rec  += l.valor ?? 0
    else                      empMap[key].desp += l.valor ?? 0
  }
  const porEmpresa: EmpresaBar[] = Object.entries(empMap)
    .map(([empresa, v]) => ({
      empresa,
      receita: v.rec,
      despesa: v.desp,
      margem: v.rec > 0 ? ((v.rec - v.desp) / v.rec) * 100 : 0,
    }))
    .sort((a, b) => b.receita - a.receita)

  // ── Mapa de Empresas (receita/despesa MÊS ATUAL + saldo bancário + status) ────
  const mesAtualKey = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
  const empMesMap: Record<string, { rec: number; desp: number }> = {}
  for (const l of all) {
    if (!l.empresa_id) continue
    if (l.data_vencimento?.slice(0, 7) !== mesAtualKey) continue
    if (!empMesMap[l.empresa_id]) empMesMap[l.empresa_id] = { rec: 0, desp: 0 }
    if (l.tipo === 'receita') empMesMap[l.empresa_id].rec  += l.valor ?? 0
    else                      empMesMap[l.empresa_id].desp += l.valor ?? 0
  }
  const mapaEmpresas: MapaEmpresaItem[] = (empresas ?? [])
    .filter(e => e.id)
    .map(e => {
      const m = empMesMap[e.id] ?? { rec: 0, desp: 0 }
      const saldo = saldoPorEmpresa[e.id] ?? { positivo: 0, negativo: 0, liquido: 0 }
      const margem = m.rec > 0 ? ((m.rec - m.desp) / m.rec) * 100 : (m.desp > 0 ? -100 : 0)

      // Semáforo:
      //   🟢 verde:   margem ≥ 15% E saldo líquido positivo E sem dívida grande
      //   🟡 amarelo: caso intermediário
      //   🔴 vermelho: margem negativa OU dívida > receita mensal
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
      }
    })
    .sort((a, b) => {
      // pior margem primeiro (= sinaliza onde tem fogo)
      const ordemStatus = { vermelho: 0, amarelo: 1, verde: 2 }
      if (ordemStatus[a.status] !== ordemStatus[b.status]) return ordemStatus[a.status] - ordemStatus[b.status]
      return a.margem_mes - b.margem_mes
    })

  // ── DSO (Days Sales Outstanding) ──────────────────────────────────────────
  const paidRecs = all.filter(l =>
    l.tipo === 'receita' && l.status === 'pago' && l.data_pagamento && l.data_vencimento
  )
  const dso = paidRecs.length > 5
    ? Math.round(paidRecs.reduce((sum, l) => {
        const diff = new Date(l.data_pagamento).getTime() - new Date(l.data_vencimento + 'T00:00:00').getTime()
        return sum + Math.max(0, diff / 86400000)
      }, 0) / paidRecs.length)
    : null

  // ── Runway ────────────────────────────────────────────────────────────────
  // Burn rate = média mensal dos últimos 3 meses de despesas pagas
  const last3Keys = mesesOrdenados.slice(-3).map(([k]) => k)
  const burn3m = last3Keys.reduce((s, k) => s + (mesMap[k]?.despPago ?? 0), 0)
  const avgMonthlyBurn = last3Keys.length > 0 ? burn3m / last3Keys.length : 0
  const runway = avgMonthlyBurn > 0 ? Math.round((totalSaldos / avgMonthlyBurn) * 10) / 10 : null

  // ── Inadimplência ─────────────────────────────────────────────────────────
  const inadimplencia = receitasList.filter(l => l.status === 'vencido').reduce((s, l) => s + (l.valor ?? 0), 0)
  const inadimplenciaPct = totalReceitas > 0 ? (inadimplencia / totalReceitas) * 100 : 0

  // ── Previsão 90 dias ──────────────────────────────────────────────────────
  // Exclui transferências internas do forecast
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
    <main className="min-h-screen bg-gray-950 text-white p-6 md:p-8">

      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <a href="/dashboard" className="text-gray-500 text-sm hover:text-gray-300">← Centro de Comando</a>
          <h1 className="text-2xl font-bold mt-1">Dashboard Financeiro — GP SafeWork</h1>
          <p className="text-gray-400 text-sm">
            Conta Azul · {all.length.toLocaleString('pt-BR')} lançamentos{filtroAtivo ? ' (filtrado)' : ''} · Sync: {ultimoSync}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <a href="/dashboard/financeiro/fluxo-caixa"
            className="px-3 py-1.5 bg-emerald-800/60 hover:bg-emerald-700/70 border border-emerald-700/50 rounded-lg text-xs font-medium text-emerald-200 transition-colors">
            Fluxo de Caixa →
          </a>
          <a href="/dashboard/financeiro/contas"
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-xs font-medium text-gray-300 transition-colors">
            Contas →
          </a>
          <a href="/dashboard/financeiro/inadimplentes"
            className="px-3 py-1.5 bg-red-900/50 hover:bg-red-800/60 border border-red-800/50 rounded-lg text-xs font-medium text-red-300 transition-colors">
            Inadimplentes →
          </a>
          <a href="/dashboard/financeiro/dre"
            className="px-3 py-1.5 bg-amber-700 hover:bg-amber-600 rounded-lg text-xs font-medium transition-colors">
            DRE →
          </a>
          <a href="/dashboard/financeiro/plata"
            className="px-3 py-1.5 bg-amber-900/60 hover:bg-amber-800/70 border border-amber-700/50 rounded-lg text-xs font-medium text-amber-300 transition-colors">
            Plata IA →
          </a>
          <Suspense><SyncButton /></Suspense>
        </div>
      </div>

      {/* Filtros */}
      <Suspense>
        <FiltrosFinanceiro empresas={empresas ?? []} />
      </Suspense>

      {/* Cockpit do CFO — KPIs principais (topo) */}
      <Suspense>
        <CockpitCFO data={cockpitData} />
      </Suspense>

      {/* Mapa de Empresas — visão consolidada por unidade */}
      <Suspense>
        <MapaEmpresas empresas={mapaEmpresas} />
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
        />
      </Suspense>

      {/* Fluxo de Caixa */}
      <div className="mt-6">
        <Suspense>
          <FluxoCaixaChart
            porMes={porFluxoMes}
            buckets90d={buckets90d}
            saldoAtual={totalSaldos}
          />
        </Suspense>
      </div>

      {/* Chat Plata + Sync */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <h2 className="text-sm font-semibold text-gray-400 mb-3">Chat com Plata — IA Financeira</h2>
          <Suspense>
            <PlataChat initialMessages={initialMessages} />
          </Suspense>
        </div>
        <div className="space-y-4">
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Sincronização</h3>
            <p className="text-xs text-gray-500 mb-3">Todas as empresas · lançamentos + saldos</p>
            <Suspense><SyncButton /></Suspense>
          </div>
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Pergunte ao Plata</h3>
            <div className="space-y-1 text-xs text-gray-500">
              <p>• "Qual empresa tem melhor margem?"</p>
              <p>• "Comparar receita de 2025 vs 2026"</p>
              <p>• "Quais as maiores despesas do grupo?"</p>
              <p>• "Projetar receita do próximo trimestre"</p>
            </div>
          </div>
        </div>
      </div>

    </main>
  )
}
