// Títulos em aberto de uma linha do plano de contas.
//
// Sob demanda, não junto da página: são mais de mil títulos no total e o
// usuário abre poucas linhas por vez.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'não autorizado' }, { status: 401 })

  const categoria = req.nextUrl.searchParams.get('categoria')
  if (!categoria) {
    return NextResponse.json({ error: 'categoria é obrigatória' }, { status: 400 })
  }

  const anoParam = Number(req.nextUrl.searchParams.get('ano'))
  const ano = Number.isInteger(anoParam) && anoParam > 2000 ? anoParam : null
  const empresa = req.nextUrl.searchParams.get('empresa') || null

  const sb = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data, error } = await sb.rpc('fn_divida_titulos', {
    p_categoria: categoria,
    p_ano: ano,
    p_empresa_id: empresa,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ titulos: data ?? [] })
}
