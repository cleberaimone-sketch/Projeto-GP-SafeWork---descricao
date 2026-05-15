import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as sb } from '@supabase/supabase-js'

const AGENTES_VALIDOS = ['lari', 'dieguito', 'plata', 'lui', 'secretaria']

function getDB() {
  return sb(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// GET /api/agentes/memorias?agente=lari
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const agente = req.nextUrl.searchParams.get('agente')
  if (!agente || !AGENTES_VALIDOS.includes(agente)) {
    return NextResponse.json({ error: 'agente inválido' }, { status: 400 })
  }

  const db = getDB()
  const { data, error } = await db
    .from('memorias_agentes')
    .select('id, tipo, titulo, conteudo, relevancia, created_at')
    .eq('agente', agente)
    .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
    .order('relevancia', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json({ memorias: [], migration_needed: true })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ memorias: data ?? [] })
}

// POST /api/agentes/memorias — adicionar memória manualmente
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { agente, tipo, titulo, conteudo, relevancia = 3 } = body

  if (!agente || !AGENTES_VALIDOS.includes(agente)) {
    return NextResponse.json({ error: 'agente inválido' }, { status: 400 })
  }
  const TIPOS_VALIDOS = ['decisao', 'fato', 'pendencia', 'alerta', 'aprendizado']
  if (!tipo || !TIPOS_VALIDOS.includes(tipo)) {
    return NextResponse.json({ error: 'tipo inválido' }, { status: 400 })
  }
  if (!titulo?.trim() || !conteudo?.trim()) {
    return NextResponse.json({ error: 'titulo e conteudo são obrigatórios' }, { status: 400 })
  }

  const db = getDB()
  const { data, error } = await db
    .from('memorias_agentes')
    .insert({ agente, tipo, titulo: titulo.trim(), conteudo: conteudo.trim(), relevancia: Math.min(5, Math.max(1, relevancia)) })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id })
}

// DELETE /api/agentes/memorias?id=xxx
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })

  const db = getDB()
  const { error } = await db.from('memorias_agentes').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
