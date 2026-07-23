import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createService } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 30

// Persiste decisões de pagamento no Caixa do Dia.
// Ações:
//   { acao: 'decidir', ids: string[], decisao: 'pagar'|'adiar'|null, data_prevista? }
//   { acao: 'prioridade', id: string, prioridade_override: 'intocavel'|'normal'|null }
export async function POST(req: NextRequest) {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const sb = createService(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const agora = new Date().toISOString()

  if (body.acao === 'decidir') {
    const ids = Array.isArray(body.ids) ? (body.ids as string[]) : []
    if (!ids.length) return NextResponse.json({ error: 'Nenhuma conta selecionada.' }, { status: 400 })
    const decisao = (body.decisao ?? null) as string | null
    const dataPrevista = (body.data_prevista ?? null) as string | null
    const rows = ids.map(id => ({
      lancamento_id: id,
      decisao,
      data_prevista: decisao === 'pagar' ? dataPrevista : null,
      decidido_por: user.id,
      decidido_em: agora,
    }))
    const { error } = await sb.from('decisoes_pagamento').upsert(rows, { onConflict: 'lancamento_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, atualizadas: ids.length })
  }

  if (body.acao === 'prioridade') {
    const id = body.id as string
    if (!id) return NextResponse.json({ error: 'Falta o id.' }, { status: 400 })
    const prio = (body.prioridade_override ?? null) as string | null
    const { error } = await sb.from('decisoes_pagamento').upsert(
      { lancamento_id: id, prioridade_override: prio, decidido_por: user.id, decidido_em: agora },
      { onConflict: 'lancamento_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (body.acao === 'categoria') {
    const categoria = body.categoria as string
    if (!categoria) return NextResponse.json({ error: 'Falta a categoria.' }, { status: 400 })
    const { error } = await sb.from('categorias_prioridade').upsert(
      { categoria, intocavel: !!body.intocavel, atualizado_em: agora },
      { onConflict: 'categoria' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Ação desconhecida.' }, { status: 400 })
}
