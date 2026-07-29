import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Endpoint de debug do webhook LUI.
// Mitigação LGPD: era público e logava o payload completo (podia conter
// mensagem/telefone). Agora exige usuário autenticado e loga só as chaves.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'não autorizado' }, { status: 401 })

  const body = await req.json()
  console.log('[DEBUG] payload recebido — chaves:', Object.keys(body ?? {}).join(', '))
  return NextResponse.json({ ok: true, received: body })
}
