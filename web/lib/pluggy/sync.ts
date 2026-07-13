import { SupabaseClient } from '@supabase/supabase-js'
import { getItem, getAccounts, getAllTransactions, updateItem, nomeExibicaoConta } from './client'

export interface SyncResult {
  sucesso: number
  erros: number
  transacoes: number
  detalhes: Array<{ itemId: string; ok: boolean; transacoes?: number; mensagem?: string }>
}

// Quantos dias de extrato puxar por padrão (janela para conciliação)
const DIAS_EXTRATO = 180

export async function syncTodosItems(
  sb: SupabaseClient,
  soItemId?: string,
): Promise<SyncResult> {
  let { data: items } = await sb.from('pluggy_items').select('pluggy_item_id, empresa_id')
  if (soItemId) items = (items ?? []).filter(i => i.pluggy_item_id === soItemId)

  let sucesso = 0, erros = 0, transacoes = 0
  const detalhes: SyncResult['detalhes'] = []
  const desdeExtrato = new Date(Date.now() - DIAS_EXTRATO * 86_400_000).toISOString().slice(0, 10)

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

      let txItem = 0
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

        // Extrato (transações) da conta — base da conciliação bancária.
        // onConflict: pluggy_transaction_id → idempotente; NÃO sobrescreve
        // conciliado/lancamento_id (esses campos ficam fora do upsert).
        const txs = await getAllTransactions(acc.id, desdeExtrato)
        const agora = new Date().toISOString()
        const rows = txs.map(t => ({
          pluggy_transaction_id: t.id,
          pluggy_account_id: acc.id,
          empresa_id: it.empresa_id,
          data: (t.date ?? '').slice(0, 10) || null,
          descricao: t.description ?? t.descriptionRaw ?? null,
          valor: t.amount ?? 0,
          tipo: t.type ?? ((t.amount ?? 0) < 0 ? 'DEBIT' : 'CREDIT'),
          categoria: t.category ?? null,
          saldo_apos: t.balance ?? null,
          status: t.status ?? null,
          atualizado_em: agora,
        }))
        for (let i = 0; i < rows.length; i += 500) {
          await sb.from('pluggy_transactions')
            .upsert(rows.slice(i, i + 500), { onConflict: 'pluggy_transaction_id' })
        }
        txItem += rows.length
      }

      transacoes += txItem
      sucesso++
      detalhes.push({ itemId: it.pluggy_item_id, ok: true, transacoes: txItem })
    } catch (err) {
      erros++
      detalhes.push({ itemId: it.pluggy_item_id, ok: false, mensagem: (err as Error).message })
    }
  }

  try {
    await sb.from('sync_log').insert({
      fonte: 'pluggy',
      status: erros === 0 ? 'sucesso' : (sucesso > 0 ? 'parcial' : 'erro'),
      registros_processados: transacoes,
      mensagem_erro: erros > 0 ? `${erros} erro(s)` : null,
      finalizado_em: new Date().toISOString(),
    })
  } catch { /* sync_log opcional */ }

  return { sucesso, erros, transacoes, detalhes }
}
