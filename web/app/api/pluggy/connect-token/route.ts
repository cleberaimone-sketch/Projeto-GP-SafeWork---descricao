import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { criarConnectToken, pluggyConfigurado } from '@/lib/pluggy/client'

// Gera token para o Connect Widget abrir no browser.
// Pode receber itemId no body para REconectar um item existente (recuperar credenciais).
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  if (!pluggyConfigurado()) {
    return NextResponse.json({
      error: 'Pluggy não configurado',
      detalhe: 'Defina PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no Vercel/.env.local',
    }, { status: 503 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const itemId = body.itemId as string | undefined
    const token = await criarConnectToken(itemId)
    return NextResponse.json({ accessToken: token.accessToken })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
