import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { getItem, getAccounts, nomeExibicaoConta } from '@/lib/pluggy/client'

// POST: Callback do Widget após conexão bem-sucedida.
// Recebe { itemId, empresaId } → busca dados na Pluggy → salva no Supabase.
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { itemId, empresaId } = await req.json().catch(() => ({}))
  if (!itemId) return NextResponse.json({ error: 'itemId obrigatório' }, { status: 400 })

  const sb = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    // 1. Busca item na Pluggy
    const item = await getItem(itemId)

    // 2. Upsert do item
    await sb.from('pluggy_items').upsert({
      empresa_id: empresaId ?? null,
      pluggy_item_id: item.id,
      connector_id: item.connector.id,
      instituicao_nome: item.connector.name,
      instituicao_imagem: item.connector.imageUrl ?? null,
      status: item.status,
      execution_status: item.executionStatus ?? null,
      status_detail: item.statusDetail ?? null,
      last_updated_at: item.lastUpdatedAt ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'pluggy_item_id' })

    // 3. Busca contas
    const accounts = await getAccounts(itemId)

    // 4. Upsert das contas
    for (const acc of accounts) {
      await sb.from('pluggy_accounts').upsert({
        pluggy_item_id: itemId,
        empresa_id: empresaId ?? null,
        pluggy_account_id: acc.id,
        tipo: acc.type,
        subtipo: acc.subtype,
        numero: acc.number ?? null,
        agencia: acc.agency ?? null,
        marca: acc.marketingName ?? item.connector.name,
        nome_titular: acc.owner ?? null,
        nome_exibicao: nomeExibicaoConta(acc, item.connector.name),
        saldo: acc.balance ?? 0,
        saldo_disponivel: acc.bankData?.closingBalance ?? acc.balance ?? null,
        limite_credito: acc.creditData?.creditLimit ?? null,
        moeda: acc.currencyCode ?? 'BRL',
        atualizado_em: new Date().toISOString(),
      }, { onConflict: 'pluggy_account_id' })
    }

    return NextResponse.json({
      ok: true,
      item: { id: item.id, status: item.status, banco: item.connector.name },
      contas: accounts.length,
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

// GET: Lista items conectados do usuário (com accounts juntas)
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const sb = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const [{ data: items }, { data: accounts }] = await Promise.all([
    sb.from('pluggy_items').select('*').order('created_at', { ascending: false }),
    sb.from('pluggy_accounts').select('*').order('marca'),
  ])

  return NextResponse.json({ items: items ?? [], accounts: accounts ?? [] })
}
