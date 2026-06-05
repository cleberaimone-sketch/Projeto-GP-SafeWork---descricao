export const maxDuration = 60
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { syncTodosItems } from '@/lib/pluggy/sync'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET — Vercel Cron (sincroniza todos os items automaticamente)
export async function GET(req: NextRequest) {
  const isCron = req.headers.get('x-vercel-cron') === '1' ||
                 req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
  if (!isCron) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const sb = getServiceClient()
  const result = await syncTodosItems(sb)
  console.log(`[pluggy/sync cron] ${result.sucesso} ok, ${result.erros} erro(s)`)
  return NextResponse.json({ ok: result.erros === 0, ...result })
}

// POST — acionamento manual (requer autenticação)
// Body opcional: { itemId } → sincroniza só um. Sem body → sincroniza todos.
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { itemId } = await req.json().catch(() => ({}))
  const sb = getServiceClient()
  const result = await syncTodosItems(sb, itemId)
  return NextResponse.json({ ok: result.erros === 0, ...result })
}
