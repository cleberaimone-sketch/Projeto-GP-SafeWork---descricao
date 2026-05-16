// API para gerenciar metas orçamentárias.
// POST   /api/financeiro/metas       — upsert de 1 ou mais metas
// DELETE /api/financeiro/metas?id=X  — remove uma meta

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

interface MetaInput {
  empresa_id: string | null
  ano: number
  mes: number
  categoria: string
  tipo: 'receita' | 'despesa'
  valor_meta: number
  observacao?: string | null
}

export async function POST(req: NextRequest) {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  // Aceita 1 meta ou array de metas (batch)
  const metas: MetaInput[] = Array.isArray(body) ? body : [body]

  for (const m of metas) {
    if (typeof m.ano !== 'number' || m.ano < 2024 || m.ano > 2100)
      return NextResponse.json({ error: `Ano inválido: ${m.ano}` }, { status: 400 })
    if (typeof m.mes !== 'number' || m.mes < 1 || m.mes > 12)
      return NextResponse.json({ error: `Mês inválido: ${m.mes}` }, { status: 400 })
    if (!m.categoria || typeof m.categoria !== 'string')
      return NextResponse.json({ error: 'Categoria obrigatória' }, { status: 400 })
    if (m.tipo !== 'receita' && m.tipo !== 'despesa')
      return NextResponse.json({ error: `Tipo inválido: ${m.tipo}` }, { status: 400 })
    if (typeof m.valor_meta !== 'number' || !isFinite(m.valor_meta))
      return NextResponse.json({ error: 'Valor inválido' }, { status: 400 })
  }

  const sb = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const agora = new Date().toISOString()
  const rows = metas.map(m => ({
    empresa_id:  m.empresa_id || null,
    ano:         m.ano,
    mes:         m.mes,
    categoria:   m.categoria.trim(),
    tipo:        m.tipo,
    valor_meta:  m.valor_meta,
    observacao:  m.observacao ?? null,
    atualizado_em: agora,
  }))

  // Upsert: substitui se já existe pela chave única
  // Como o UNIQUE usa COALESCE, vamos fazer delete + insert por chave (mais simples e seguro)
  const erros: string[] = []
  let processadas = 0

  for (const r of rows) {
    // Apaga existente
    let q = sb.from('metas_orcamentarias').delete()
      .eq('ano', r.ano).eq('mes', r.mes).eq('categoria', r.categoria)
    q = r.empresa_id ? q.eq('empresa_id', r.empresa_id) : q.is('empresa_id', null)
    const { error: errDel } = await q
    if (errDel) { erros.push(`del: ${errDel.message}`); continue }

    // Insere nova (se valor > 0; valor = 0 fica como "sem meta")
    if (r.valor_meta !== 0) {
      const { error: errIns } = await sb.from('metas_orcamentarias').insert(r)
      if (errIns) { erros.push(`ins: ${errIns.message}`); continue }
    }
    processadas += 1
  }

  if (erros.length > 0) {
    return NextResponse.json({ processadas, erros }, { status: 207 })
  }
  return NextResponse.json({ processadas })
}

export async function DELETE(req: NextRequest) {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 })

  const sb = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await sb.from('metas_orcamentarias').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
