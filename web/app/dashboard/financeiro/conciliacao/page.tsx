import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import ConciliacaoClient from './ConciliacaoClient'
import type { TxConciliada } from '@/lib/financeiro/conciliacao'
import { conciliar, resumir, type TxBanco, type LancErp } from '@/lib/financeiro/conciliacao'

export const maxDuration = 60

interface SP { conta?: string; status?: string }

const DIAS = 180

export default async function ConciliacaoPage({ searchParams }: { searchParams: Promise<SP> }) {
  const filters = await searchParams
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) redirect('/login')

  const sb = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const desde = new Date(Date.now() - DIAS * 86_400_000).toISOString().slice(0, 10)

  // ── Extrato (pluggy_transactions) + nomes das contas ──────────────────────
  const { data: contas } = await sb.from('pluggy_accounts').select('pluggy_account_id, nome_exibicao, marca')
  const nomeConta: Record<string, string> = {}
  for (const c of contas ?? []) nomeConta[c.pluggy_account_id] = c.nome_exibicao ?? c.marca ?? '—'

  // A tabela pode não existir ainda (migration não aplicada) → estado vazio guiado.
  const { data: txRaw, error: txErr } = await sb
    .from('pluggy_transactions')
    .select('pluggy_transaction_id, pluggy_account_id, data, descricao, valor, tipo')
    .gte('data', desde)
    .order('data', { ascending: false })
    .range(0, 4999)

  const tabelaPronta = !txErr
  const txs: TxBanco[] = (txRaw ?? []).map(t => ({
    id: t.pluggy_transaction_id,
    pluggy_account_id: t.pluggy_account_id,
    conta_nome: nomeConta[t.pluggy_account_id] ?? '—',
    data: (t.data ?? '').slice(0, 10),
    descricao: t.descricao ?? '',
    valor: Number(t.valor ?? 0),
    tipo: t.tipo ?? '',
  }))

  // ── Lançamentos pagos do ERP na janela (paginado — foge do cap de 1000) ───
  const lancs: LancErp[] = []
  if (txs.length > 0) {
    const LOTE = 1000
    for (let off = 0; ; off += LOTE) {
      const { data } = await sb.from('lancamentos_financeiros')
        .select('id, valor, tipo, data_pagamento, descricao, categoria')
        .in('status', ['pago', 'parcial'])
        .not('data_pagamento', 'is', null)
        .gte('data_pagamento', desde)
        .order('id')
        .range(off, off + LOTE - 1)
      if (!data || data.length === 0) break
      for (const l of data) lancs.push({
        id: String(l.id),
        valor: Number(l.valor ?? 0),
        tipo: l.tipo ?? '',
        data_pagamento: (l.data_pagamento ?? '').slice(0, 10),
        descricao: l.descricao ?? '',
        categoria: l.categoria ?? '',
      })
      if (data.length < LOTE) break
    }
  }

  const conciliadas: TxConciliada[] = conciliar(txs, lancs)
  const resumo = resumir(conciliadas)

  const qtdContas = (contas ?? []).length

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white">
        <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6">
          <div className="flex items-center gap-3 mb-2">
            <a href="/dashboard/financeiro" className="text-blue-200/80 text-sm hover:text-white">← Financeiro</a>
            <span className="text-blue-300">·</span>
            <a href="/dashboard" className="text-blue-200/80 text-sm hover:text-white">Centro de Comando</a>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Conciliação Bancária</h1>
          <p className="text-blue-100/90 text-sm">
            Extrato real (Open Finance) × lançamentos do ERP · últimos {DIAS} dias · {qtdContas} conta{qtdContas === 1 ? '' : 's'} conectada{qtdContas === 1 ? '' : 's'}
          </p>
        </div>
      </div>
      <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6 md:py-8">
        <Suspense>
          <ConciliacaoClient
            tabelaPronta={tabelaPronta}
            transacoes={conciliadas}
            resumo={resumo}
            contaSelecionada={filters.conta ?? ''}
            statusSelecionado={filters.status ?? ''}
          />
        </Suspense>
      </div>
    </main>
  )
}
