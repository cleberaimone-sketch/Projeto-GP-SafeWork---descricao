import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createService } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import { parseExtrato } from '@/lib/financeiro/extrato-parser'

export const runtime = 'nodejs'
export const maxDuration = 60

// Importa um extrato (OFX ou XLS) para extrato_bancario. Idempotente por
// hash_dedup → reenviar o mesmo arquivo (ou período sobreposto) não duplica.
export async function POST(req: NextRequest) {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const form = await req.formData()
  const file = form.get('arquivo') as File | null
  const empresaId = (form.get('empresa_id') as string) || null
  const contaNome = ((form.get('conta_nome') as string) || '').trim()
  if (!file) return NextResponse.json({ error: 'Arquivo não enviado.' }, { status: 400 })
  if (!contaNome) return NextResponse.json({ error: 'Informe o nome da conta (ex: "Conta Azul Digital").' }, { status: 400 })

  let parsed
  try {
    parsed = parseExtrato(file.name, await file.arrayBuffer())
  } catch (e) {
    return NextResponse.json({ error: `Falha ao ler o arquivo: ${(e as Error).message}` }, { status: 422 })
  }
  const { formato, parse } = parsed
  if (parse.transacoes.length === 0) {
    return NextResponse.json({ error: parse.aviso ?? 'Nenhuma transação lida do arquivo.' }, { status: 422 })
  }

  const contaRef = `${contaNome}${parse.conta ? '·' + parse.conta : ''}`
  const rows = parse.transacoes.map(t => {
    // FITID (OFX) garante unicidade; sem ele (XLS) hash pelos campos.
    const base = t.documento
      ? `${formato}|${contaRef}|${t.documento}`
      : `${formato}|${contaRef}|${t.data}|${t.valor}|${t.descricao}`
    return {
      fonte: formato,
      conta_ref: contaRef,
      conta_nome: contaNome,
      empresa_id: empresaId,
      data: t.data || null,
      descricao: t.descricao,
      valor: t.valor,
      tipo: t.tipo,
      documento: t.documento || null,
      hash_dedup: createHash('sha1').update(base).digest('hex'),
    }
  })

  const sb = createService(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  let novos = 0
  for (let i = 0; i < rows.length; i += 500) {
    const { data, error } = await sb.from('extrato_bancario')
      .upsert(rows.slice(i, i + 500), { onConflict: 'hash_dedup', ignoreDuplicates: true })
      .select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    novos += data?.length ?? 0
  }

  return NextResponse.json({
    formato,
    total: rows.length,
    novos,
    duplicados: rows.length - novos,
    aviso: parse.aviso ?? null,
  })
}
