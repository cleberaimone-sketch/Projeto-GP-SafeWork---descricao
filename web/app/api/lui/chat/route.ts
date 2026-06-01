export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildQueryContext } from '@/lib/lui/context'
import { responderPergunta, type Mensagem } from '@/lib/lui/claude'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { texto, historico = [] } = await req.json()
  if (!texto?.trim()) return NextResponse.json({ error: 'Texto vazio' }, { status: 400 })

  const contexto = await buildQueryContext(texto)
  const { resposta } = await responderPergunta(texto, contexto, historico as Mensagem[], user.id)

  return NextResponse.json({ resposta })
}
