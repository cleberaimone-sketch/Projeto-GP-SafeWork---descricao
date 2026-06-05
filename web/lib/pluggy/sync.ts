import { SupabaseClient } from '@supabase/supabase-js'
import { getItem, getAccounts, updateItem, nomeExibicaoConta } from './client'

export interface SyncResult {
  sucesso: number
  erros: number
  detalhes: Array<{ itemId: string; ok: boolean; mensagem?: string }>
}

export async function syncTodosItems(
  sb: SupabaseClient,
  soItemId?: string,
): Promise<SyncResult> {
  let { data: items } = await sb.from('pluggy_items').select('pluggy_item_id, empresa_id')
  if (soItemId) items = (items ?? []).filter(i => i.pluggy_item_id === soItemId)

  let sucesso = 0, erros = 0
  const detalhes: SyncResult['detalhes'] = []

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
