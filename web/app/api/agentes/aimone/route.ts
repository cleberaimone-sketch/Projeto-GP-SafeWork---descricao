import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { aimoneResponder } from '@/lib/agentes/aimone/claude'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { texto, historico = [] } = await req.json()
  if (!texto) return NextResponse.json({ error: 'Texto obrigatório' }, { status: 400 })

  try {
    const { resposta } = await aimoneResponder(texto, historico, user.id)
    return NextResponse.json({ resposta })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
