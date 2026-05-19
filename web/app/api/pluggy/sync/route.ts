import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { getItem, getAccounts, updateItem, nomeExibicaoConta } from '@/lib/pluggy/client'

// Re-sincroniza items: força update na Pluggy e regrava saldos no Supabase.
// Body opcional: { itemId } → sincroniza só um. Sem body → sincroniza todos.
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const sb = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { itemId: only } = await req.json().catch(() => ({}))

  let { data: items } = await sb.from('pluggy_items').select('pluggy_item_id, empresa_id')
  if (only) items = (items ?? []).filter(i => i.pluggy_item_id === only)

  let sucesso = 0, erros = 0
  const detalhes: Array<{ itemId: string; ok: boolean; mensagem?: string }> = []

  for (const it of items ?? []) {
    try {
      // Força refresh do item no Pluggy (mais lento, mas garante saldos atuais)
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
  } catch {
    // log opcional — sync_log pode não ter coluna 'fonte=pluggy' ainda
  }

  return NextResponse.json({ ok: erros === 0, sucesso, erros, detalhes })
}
