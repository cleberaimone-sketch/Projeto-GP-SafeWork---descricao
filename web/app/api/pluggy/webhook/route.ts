// ============================================================
// POST /api/pluggy/webhook
//
// Recebe notificações do Pluggy (status changes, sync completado).
// Pluggy faz POST com evento; disparamos sync do item afetado.
// ============================================================

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { syncTodosItems } from '@/lib/pluggy/sync'

// Formato do webhook Pluggy (tipos mais comuns):
// { event: 'item/updated', itemId: 'uuid', data: { ... } }
interface PluggyWebhookPayload {
  event: string
  itemId?: string
  data?: Record<string, unknown>
}

export async function POST(req: NextRequest) {
  let body: PluggyWebhookPayload
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const { event, itemId } = body
  console.log(`[pluggy/webhook] evento: ${event} | item: ${itemId ?? 'n/a'}`)

  // Ignorar eventos que não exigem sync
  const SYNC_EVENTS = ['item/updated', 'item/error', 'connector/status_update']
  if (!SYNC_EVENTS.includes(event)) {
    return NextResponse.json({ ok: true, action: 'ignored' })
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const result = await syncTodosItems(sb, itemId)
  console.log(`[pluggy/webhook] sync: ${result.sucesso} ok, ${result.erros} erro(s)`)

  return NextResponse.json({ ok: true, ...result })
}
