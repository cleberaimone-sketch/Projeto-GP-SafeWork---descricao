// ============================================================
// GET  /api/lui/alertas  — Vercel Cron (13h e 18h BRT = 16 e 21 UTC)
// POST /api/lui/alertas  — acionamento manual (requer autenticação)
//
// Verifica condições críticas que surgiram durante o dia e envia
// WhatsApp para o Cleber se algo novo precisar de ação imediata.
// Complementa o briefing das 7h — foca em eventos INTRADIÁRIOS.
// ============================================================

export const maxDuration = 60
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { carregarCategoriasExcluidas, filtrarParaDRE } from '@/lib/financeiro/regras'
import { sendWhatsAppMessage } from '@/lib/lui/whatsapp'
import { d4signConfigurado, documentosParados } from '@/lib/d4sign/client'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>

const CLEBER_WHATSAPP = process.env.CLEBER_WHATSAPP_NUMBER ?? ''

function hoje() { return new Date().toISOString().split('T')[0] }
function horasBRT() {
  return new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false })
}
function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

// Tenta registrar a chave de dedup. Retorna true se é a 1ª vez (pode disparar).
async function podeDisparar(sb: DB, chave: string): Promise<boolean> {
  const { error } = await sb.from('webhook_dedup').insert({ message_id: chave })
  return !error  // sem erro = inserção ok = primeira vez hoje
}

async function verificarAlertas(sb: DB) {
  const dataHoje = hoje()
  const alertas: string[] = []

  // ── 1. Sync errors nas últimas 8h ─────────────────────────────────────────
  const oitoHorasAtras = new Date(Date.now() - 8 * 3600_000).toISOString()
  const { data: syncsComErro } = await sb
    .from('sync_log')
    .select('fonte, status, mensagem_erro, finalizado_em')
    .eq('status', 'erro')
    .gte('iniciado_em', oitoHorasAtras)
    .order('finalizado_em', { ascending: false })
    .limit(5)

  if (syncsComErro && syncsComErro.length > 0) {
    const chave = `alerta_sync_erro_${dataHoje}`
    if (await podeDisparar(sb, chave)) {
      const fontes = [...new Set(syncsComErro.map(s => s.fonte))].join(', ')
      alertas.push(`🔴 *Sync com erro* — ${fontes}\nVerifique /dashboard/sistema`)
    }
  }

  // ── 2. Despesas com vencimento HOJE sem pagamento ──────────────────────────
  const excluidas = await carregarCategoriasExcluidas(sb)
  const { data: lancamentosRaw } = await sb
    .from('lancamentos_financeiros')
    .select('tipo, status, valor, categoria, data_vencimento, empresa_id')
    .eq('tipo', 'despesa')
    .eq('data_vencimento', dataHoje)
    .neq('status', 'cancelado')
    .neq('status', 'pago')

  const despHoje = filtrarParaDRE(lancamentosRaw ?? [], excluidas)
    .filter(l => l.tipo === 'despesa' && l.status !== 'pago' && l.status !== 'cancelado')

  const totalDespHoje = despHoje.reduce((s, l) => s + (l.valor ?? 0), 0)

  if (despHoje.length > 0 && totalDespHoje > 5000) {
    const chave = `alerta_despesas_hoje_${dataHoje}`
    if (await podeDisparar(sb, chave)) {
      alertas.push(`⚠️ *Despesas vencendo hoje* — ${despHoje.length} lançamento${despHoje.length > 1 ? 's' : ''} totalizando ${fmt(totalDespHoje)}\nVerifique /dashboard/financeiro/contas`)
    }
  }

  // ── 3. Contratos D4sign parados (aguardando assinatura > 7 dias) ──────────
  if (d4signConfigurado()) {
    try {
      const parados = await documentosParados(7)
      if (parados.length > 0) {
        const chave = `alerta_d4sign_parados_${dataHoje}`
        if (await podeDisparar(sb, chave)) {
          const nomes = parados.slice(0, 3).map(d => d.nameDoc).join(', ')
          const extra = parados.length > 3 ? ` e mais ${parados.length - 3}` : ''
          alertas.push(`📋 *Contratos parados no D4sign* — ${parados.length} documento${parados.length > 1 ? 's' : ''} aguardando assinatura há +7 dias\n${nomes}${extra}\nVerifique /dashboard/comercial`)
        }
      }
    } catch { /* D4sign offline — ignorar */ }
  }

  // ── 4. Receitas vencidas (inadimplência acima de 15%) ──────────────────────
  const trintaDiasAtras = new Date(Date.now() - 30 * 86_400_000).toISOString().split('T')[0]
  const { data: receitasRaw } = await sb
    .from('lancamentos_financeiros')
    .select('tipo, status, valor, categoria, data_vencimento')
    .eq('tipo', 'receita')
    .neq('status', 'cancelado')
    .gte('data_vencimento', trintaDiasAtras)

  const receitas = filtrarParaDRE(receitasRaw ?? [], excluidas).filter(l => l.tipo === 'receita')
  const totalRec = receitas.reduce((s, l) => s + (l.valor ?? 0), 0)
  const vencidas = receitas.filter(l => l.status === 'vencido').reduce((s, l) => s + (l.valor ?? 0), 0)
  const inadPct = totalRec > 0 ? (vencidas / totalRec) * 100 : 0

  if (inadPct > 15 && totalRec > 10000) {
    const chave = `alerta_inadimplencia_critica_${dataHoje}`
    if (await podeDisparar(sb, chave)) {
      alertas.push(`🔴 *Inadimplência crítica* — ${inadPct.toFixed(1)}% (${fmt(vencidas)} em aberto)\nVerifique /dashboard/financeiro/inadimplentes`)
    }
  }

  return alertas
}

export async function GET(req: NextRequest) {
  // Vercel Cron: autoriza via cabeçalho
  const isCron = req.headers.get('x-vercel-cron') === '1' ||
                 req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`

  if (!isCron) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const sb = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const alertas = await verificarAlertas(sb)

  if (alertas.length === 0) {
    console.log('[alertas] Nenhum alerta novo para disparar')
    return NextResponse.json({ ok: true, alertas: 0 })
  }

  const hora = horasBRT()
  const mensagem = [
    `⚡ *GP SafeWork — Alerta ${hora}h*`,
    ``,
    ...alertas,
    ``,
    `📌 Responda aqui ou acesse o dashboard para ação.`,
  ].join('\n')

  const enviado = CLEBER_WHATSAPP
    ? await sendWhatsAppMessage(`55${CLEBER_WHATSAPP.replace(/\D/g, '')}`, mensagem)
    : false

  console.log(`[alertas] ${alertas.length} alerta(s) — enviado WhatsApp: ${enviado}`)
  return NextResponse.json({ ok: true, alertas: alertas.length, enviado })
}

export async function POST(req: NextRequest) {
  // Acionamento manual — requer usuário autenticado
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { forcar = false } = await req.json().catch(() => ({}))

  const sb = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Se forçar, remove dedup do dia para reenviar
  if (forcar) {
    const dataHoje = hoje()
    const chaves = [
      `alerta_sync_erro_${dataHoje}`,
      `alerta_despesas_hoje_${dataHoje}`,
      `alerta_inadimplencia_critica_${dataHoje}`,
      `alerta_d4sign_parados_${dataHoje}`,
    ]
    await sb.from('webhook_dedup').delete().in('message_id', chaves)
  }

  const alertas = await verificarAlertas(sb)

  if (alertas.length === 0) {
    return NextResponse.json({ ok: true, alertas: 0, mensagem: 'Nenhuma condição crítica ativa' })
  }

  const hora = horasBRT()
  const mensagem = [
    `⚡ *GP SafeWork — Alerta ${hora}h*`,
    ``,
    ...alertas,
    ``,
    `📌 Responda aqui ou acesse o dashboard para ação.`,
  ].join('\n')

  const enviado = CLEBER_WHATSAPP
    ? await sendWhatsAppMessage(`55${CLEBER_WHATSAPP.replace(/\D/g, '')}`, mensagem)
    : false

  return NextResponse.json({ ok: true, alertas: alertas.length, enviado, mensagem })
}
