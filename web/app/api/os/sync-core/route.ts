// ============================================================
// GET /api/os/sync-core
//
// Sincroniza eventos do GP OS Core para a tabela local os_eventos.
// Roda via Vercel Cron a cada 5 min (ver vercel.json).
//
// Fluxo:
//   1. Determina cursor: maior created_at de eventos do Core já no local
//   2. Chama GET /api/events?since=<cursor>&limit=50
//   3. Para cada evento novo: insere em os_eventos (dedup via webhook_dedup)
//   4. Chama POST /api/events/ack com os IDs internos do Core
//   5. Supabase Realtime entrega ao OSEventsFeed em tempo real
// ============================================================

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  getCoreEventos,
  acknowledgeCoreEventos,
  normalizarEvento,
  coreConfigurado,
} from '@/lib/os/core-client'

const CRON_SECRET = process.env.CRON_SECRET

function autenticado(req: NextRequest): boolean {
  const auth = req.headers.get('authorization')
  const cron = req.headers.get('x-vercel-cron')
  return cron === '1' || auth === `Bearer ${CRON_SECRET}`
}

export async function GET(req: NextRequest) {
  if (!autenticado(req)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  if (!coreConfigurado()) {
    return NextResponse.json({ ok: true, msg: 'CORE_READ_TOKEN não configurado', sincronizados: 0 })
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // ── 1. Cursor incremental ─────────────────────────────────────────────────
  // Usa o maior created_at de eventos vindos do Core que já temos local
  const { data: ultimoEvento } = await sb
    .from('os_eventos')
    .select('created_at')
    .not('payload->_core_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const since = ultimoEvento?.created_at ?? undefined

  // ── 2. Busca eventos do Core desde o cursor ───────────────────────────────
  const { events, pagination } = await getCoreEventos({ since, limit: 50 })

  if (events.length === 0) {
    return NextResponse.json({ ok: true, sincronizados: 0, duplicados: 0, total: 0, since })
  }

  // ── 3. Insere novos eventos localmente ────────────────────────────────────
  let sincronizados = 0
  let duplicados    = 0
  const idsParaAck: string[] = []

  for (const ev of events) {
    const chaveDedup = `core_event_${ev.event_id}`

    const { error: dedupErr } = await sb
      .from('webhook_dedup')
      .insert({ message_id: chaveDedup })

    if (dedupErr) {
      duplicados++
      idsParaAck.push(ev.id) // já processado antes — ack igualmente
      continue
    }

    const normalizado = normalizarEvento(ev)
    const { error: insertErr } = await sb.from('os_eventos').insert({
      tipo:       normalizado.tipo,
      origem:     normalizado.origem,
      payload:    normalizado.payload,
      processado: normalizado.processado,
      created_at: normalizado.created_at,
    })

    if (insertErr) {
      console.error(`[sync-core] Erro ao inserir ${ev.event_id}:`, insertErr.message)
    } else {
      sincronizados++
      idsParaAck.push(ev.id)
    }
  }

  // ── 4. Ack para o Core ────────────────────────────────────────────────────
  const acknowledged = await acknowledgeCoreEventos(idsParaAck)

  console.log(
    `[sync-core] ✓ ${sincronizados} novos | ${duplicados} duplicados | ${acknowledged} acked | total Core: ${pagination.count}`
  )

  return NextResponse.json({
    ok:           true,
    sincronizados,
    duplicados,
    total:        events.length,
    acknowledged,
    has_more:     pagination.has_more,
    since,
  })
}
