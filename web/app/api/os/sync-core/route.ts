// ============================================================
// GET /api/os/sync-core
//
// Sincroniza eventos do GP OS Core para a tabela local os_eventos.
// Roda via Vercel Cron a cada 5 minutos (ver vercel.json).
//
// Lógica:
//   1. Busca os últimos 50 eventos do Core
//   2. Para cada um, tenta inserir core_event_{event_id} no webhook_dedup
//   3. Se é a 1ª vez (insert ok), insere em os_eventos
//   4. Retorna quantos foram sincronizados
//
// O Supabase Realtime dispara o OSEventsFeed no Centro de Comando
// automaticamente para cada novo evento inserido.
// ============================================================

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCoreEventos, normalizarEvento, coreConfigurado } from '@/lib/os/core-client'

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
    return NextResponse.json({ ok: true, msg: 'CORE_READ_TOKEN não configurado — sync ignorado', sincronizados: 0 })
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Busca os últimos 50 eventos do Core (os mais recentes primeiro)
  const eventos = await getCoreEventos({ limit: 50 })

  if (eventos.length === 0) {
    return NextResponse.json({ ok: true, sincronizados: 0, msg: 'Core sem eventos novos' })
  }

  let sincronizados = 0
  let duplicados = 0

  for (const ev of eventos) {
    const chaveDedup = `core_event_${ev.event_id}`

    // Tenta reservar (insert falha se já existe = duplicado)
    const { error: dedupErr } = await sb
      .from('webhook_dedup')
      .insert({ message_id: chaveDedup })

    if (dedupErr) {
      duplicados++
      continue
    }

    // Novo evento — insere em os_eventos
    const normalizado = normalizarEvento(ev)
    const { error: insertErr } = await sb.from('os_eventos').insert({
      tipo:       normalizado.tipo,
      origem:     normalizado.origem,
      payload:    { ...normalizado.payload, _core_event_id: ev.event_id },
      processado: normalizado.processado,
      created_at: normalizado.created_at,
    })

    if (insertErr) {
      console.error(`[sync-core] Erro ao inserir evento ${ev.event_id}:`, insertErr.message)
    } else {
      sincronizados++
    }
  }

  console.log(`[sync-core] ✓ ${sincronizados} novos | ${duplicados} duplicados`)
  return NextResponse.json({ ok: true, sincronizados, duplicados, total: eventos.length })
}
