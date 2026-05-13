import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { lariResponder, type Mensagem } from '@/lib/agentes/lari/claude'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { pergunta, historico = [] } = await req.json()
  if (!pergunta?.trim()) return NextResponse.json({ error: 'Pergunta vazia' }, { status: 400 })

  const { resposta, tokensUsados } = await lariResponder(pergunta, historico as Mensagem[], user.id)
  return NextResponse.json({ resposta, tokensUsados })
}
