import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { deleteItem as deletePluggyItem } from '@/lib/pluggy/client'

// DELETE: Desconecta item da Pluggy + remove do Supabase (cascade nas accounts)
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id: itemId } = await ctx.params
  if (!itemId) return NextResponse.json({ error: 'itemId obrigatório' }, { status: 400 })

  const sb = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    // 1. Tenta deletar na Pluggy (best effort — pode falhar se já deletado)
    await deletePluggyItem(itemId).catch(() => null)

    // 2. Remove do Supabase (accounts caem por cascade)
    await sb.from('pluggy_items').delete().eq('pluggy_item_id', itemId)

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
