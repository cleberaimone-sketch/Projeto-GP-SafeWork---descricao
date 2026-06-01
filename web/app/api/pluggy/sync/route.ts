export const maxDuration = 60
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { getItem, getAccounts, updateItem, nomeExibicaoConta } from '@/lib/pluggy/client'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function syncTodos(sb: ReturnType<typeof getServiceClient>, soItemId?: string) {
  let { data: items } = await sb.from('pluggy_items').select('pluggy_item_id, empresa_id')
  if (soItemId) items = (items ?? []).filter(i => i.pluggy_item_id === soItemId)

  let sucesso = 0, erros = 0
  const detalhes: Array<{ itemId: string; ok: boolean; mensagem?: string }> = []

  for (const it of items ?? []) {
    try {
      await updateItem(it.pluggy_item_id).catch(() => null)
      const item = await getItem(it.pluggy_item_id)

      await sb.from('pluggy_items').update({
        status: item.status,
        execution_status: item.executionStatus ?? null,
        last_updated_at: item.lastUpdatedAt ?? null,
      }).eq('pluggy_item_id', it.pluggy_item_id)

      const accounts = await getAccounts(it.pluggy_item_id)

      for (const acc of accounts) {
        await sb.from('pluggy_accounts').upsert({
          pluggy_item_id: it.pluggy_item_id,
          empresa_id: it.empresa_id,
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
          atualizado_em: new Date().toISOString(),
        }, { onConflict: 'pluggy_account_id' })
      }

      sucesso++
      detalhes.push({ itemId: it.pluggy_item_id, ok: true })
    } catch (err) {
      erros++
      detalhes.push({ itemId: it.pluggy_item_id, ok: false, mensagem: (err as Error).message })
    }
  }

  try {
    await sb.from('sync_log').insert({
      fonte: 'pluggy',
      status: erros === 0 ? 'sucesso' : (sucesso > 0 ? 'parcial' : 'erro'),
      registros_processados: sucesso,
      mensagem_erro: erros > 0 ? `${erros} erro(s)` : null,
      finalizado_em: new Date().toISOString(),
    })
  } catch { /* sync_log opcional */ }

  return { sucesso, erros, detalhes }
}

// GET — Vercel Cron (sincroniza todos os items automaticamente)
export async function GET(req: NextRequest) {
  const isCron = req.headers.get('x-vercel-cron') === '1' ||
                 req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
  if (!isCron) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const sb = getServiceClient()
  const result = await syncTodos(sb)
  console.log(`[pluggy/sync cron] ${result.sucesso} ok, ${result.erros} erro(s)`)
  return NextResponse.json({ ok: result.erros === 0, ...result })
}

// POST — acionamento manual (requer autenticação)
// Body opcional: { itemId } → sincroniza só um. Sem body → sincroniza todos.
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { itemId } = await req.json().catch(() => ({}))
  const sb = getServiceClient()
  const result = await syncTodos(sb, itemId)
  return NextResponse.json({ ok: result.erros === 0, ...result })
}
