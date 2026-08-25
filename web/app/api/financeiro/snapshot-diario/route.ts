// Snapshot diário da saúde financeira — grava 1 linha/dia (consolidado) em
// snapshots_financeiros_diarios. Roda via Vercel Cron às 07:30 UTC (após o
// sync do Conta Azul das 06:00), ou manualmente via POST autenticado.
//
// Os números REUSAM as RPCs canônicas do dashboard (fn_financeiro_mensal),
// que já aplicam os filtros de negócio (sem transferências internas, sem
// não-operacional) — snapshot e dashboard nunca divergem.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any, any, any>

function toISO(d: Date) { return d.toISOString().split('T')[0] }

function cronAutenticado(req: NextRequest): boolean {
  return (
    req.headers.get('x-cron-secret') === process.env.CRON_SECRET ||
    req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
  )
}

async function somaAbertos(
  sb: AnySupabase,
  tipo: 'despesa' | 'receita',
  de: string,
  ate: string,
): Promise<number> {
  // Paginado — nunca confiar no cap de 1000 do PostgREST
  let total = 0
  const LOTE = 1000
  for (let off = 0; ; off += LOTE) {
    const { data } = await sb
      .from('lancamentos_financeiros')
      .select('valor')
      .eq('tipo', tipo)
      .in('status', ['pendente', 'vencido'])
      .gte('data_vencimento', de)
      .lte('data_vencimento', ate)
      .order('id')
      .range(off, off + LOTE - 1)
    if (!data || data.length === 0) break
    for (const r of data) total += Number(r.valor ?? 0)
    if (data.length < LOTE) break
  }
  return total
}

async function gravarSnapshot(): Promise<NextResponse> {
  const sb = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const hojeISO = toISO(hoje)
  const d30 = new Date(hoje); d30.setDate(hoje.getDate() - 29)
  const mesIni = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  const d7 = new Date(hoje); d7.setDate(hoje.getDate() + 7)
  const d365 = new Date(hoje); d365.setDate(hoje.getDate() - 365)
  const ontem = new Date(hoje); ontem.setDate(hoje.getDate() - 1)

  // fn_financeiro_mensal devolve { mes, tipo, status_grupo, total, qtd }.
  // status_grupo: 'pago' | 'vencido' | 'pendente' (competência, por vencimento)
  //             | 'caixa_pago' (regime de caixa, por data_pagamento).
  type MensalRow = { mes: string; tipo: string; status_grupo: string; total: number; qtd: number }
  const [
    { data: rolling30 },
    { data: mesAtual },
    { data: saldos },
  ] = await Promise.all([
    sb.rpc('fn_financeiro_mensal', { p_de: toISO(d30), p_ate: hojeISO }),
    sb.rpc('fn_financeiro_mensal', { p_de: toISO(mesIni), p_ate: hojeISO }),
    sb.from('v_saldos_ativos').select('saldo'),
  ])

  // Competência: pago + vencido + pendente. 'caixa_pago' fica de fora — é a
  // mesma linha vista pelo outro regime, e somá-la dobraria o valor.
  const soma = (rows: MensalRow[] | null, tipo: 'receita' | 'despesa') =>
    (rows ?? [])
      .filter(r => r.tipo === tipo && r.status_grupo !== 'caixa_pago')
      .reduce((s, r) => s + Number(r.total ?? 0), 0)

  const receita30 = soma(rolling30, 'receita')
  const despesa30 = soma(rolling30, 'despesa')
  const margem30 = receita30 > 0 ? ((receita30 - despesa30) / receita30) * 100 : 0

  const [atrasadosPagar, atrasadosReceber, vence7d, aReceber7d] = await Promise.all([
    somaAbertos(sb, 'despesa', toISO(d365), toISO(ontem)),
    somaAbertos(sb, 'receita', toISO(d365), toISO(ontem)),
    somaAbertos(sb, 'despesa', hojeISO, toISO(d7)),
    somaAbertos(sb, 'receita', hojeISO, toISO(d7)),
  ])

  const snapshot = {
    data: hojeISO,
    empresa_id: null as string | null,
    receita_30d: receita30,
    despesa_30d: despesa30,
    margem_30d: Math.round(margem30 * 10) / 10,
    receita_mes: soma(mesAtual, 'receita'),
    despesa_mes: soma(mesAtual, 'despesa'),
    saldo_bancario: (saldos ?? []).reduce((s: number, b: { saldo: number | null }) => s + Number(b.saldo ?? 0), 0),
    atrasados_pagar: atrasadosPagar,
    atrasados_receber: atrasadosReceber,
    vence_7d: vence7d,
    a_receber_7d: aReceber7d,
  }

  const { error } = await sb
    .from('snapshots_financeiros_diarios')
    .upsert(snapshot, { onConflict: 'data,empresa_id' })

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  // ── Fase 2: análise da Plata sobre a evolução (best-effort) ───────────────
  let analiseOk = false
  try {
    const { data: serie } = await sb
      .from('snapshots_financeiros_diarios')
      .select('data, receita_30d, despesa_30d, margem_30d, saldo_bancario, atrasados_pagar, atrasados_receber, vence_7d, a_receber_7d')
      .is('empresa_id', null)
      .order('data', { ascending: true })
      .limit(8)
    if (process.env.ANTHROPIC_API_KEY && (serie?.length ?? 0) >= 1) {
      const { plataAnaliseEvolucao } = await import('@/lib/agentes/plata/claude')
      const analise = await plataAnaliseEvolucao(JSON.stringify(serie))
      const { error: errAn } = await sb
        .from('snapshots_financeiros_diarios')
        .update({ analise })
        .eq('data', hojeISO)
        .is('empresa_id', null)
      analiseOk = !errAn
    }
  } catch (e) {
    console.error('[snapshot] análise da Plata falhou (snapshot gravado normalmente):', e)
  }

  return NextResponse.json({ ok: true, analise: analiseOk, snapshot })
}

// GET — Vercel Cron (07:30 UTC, depois do sync das 06:00)
export async function GET(req: NextRequest) {
  if (!cronAutenticado(req)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  return gravarSnapshot()
}

// POST — disparo manual por usuário logado (ex.: primeiro snapshot)
export async function POST() {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'não autorizado' }, { status: 401 })
  return gravarSnapshot()
}
