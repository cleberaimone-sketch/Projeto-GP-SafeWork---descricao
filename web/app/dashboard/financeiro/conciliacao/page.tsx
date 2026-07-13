import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import ConciliacaoTabs from './ConciliacaoTabs'
import ImportarExtrato from './ImportarExtrato'
import type { TxConciliada, CobrancaItem } from '@/lib/financeiro/conciliacao'
import { conciliar, resumir, resumirCobrancas, type TxBanco, type LancErp } from '@/lib/financeiro/conciliacao'

export const maxDuration = 60

interface SP { conta?: string; status?: string }

const DIAS = 180

export default async function ConciliacaoPage({ searchParams }: { searchParams: Promise<SP> }) {
  await searchParams
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) redirect('/login')

  const sb = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const desde = new Date(Date.now() - DIAS * 86_400_000).toISOString().slice(0, 10)

  const { data: empresas } = await sb.from('empresas').select('id, nome_curto').order('nome_curto')

  // Extrato unificado (OFX/XLS importado + Pluggy). A tabela pode não existir
  // ainda (migration não aplicada) → estado vazio guiado.
  const { data: exRaw, error: exErr } = await sb
    .from('extrato_bancario')
    .select('id, conta_ref, conta_nome, data, descricao, valor, tipo, raw')
    .gte('data', desde)
    .order('data', { ascending: false })
    .range(0, 9999)

  const tabelaPronta = !exErr
  const txs: TxBanco[] = (exRaw ?? []).map(t => ({
    id: String(t.id),
    conta_ref: t.conta_ref ?? '',
    conta_nome: t.conta_nome ?? '—',
    data: (t.data ?? '').slice(0, 10),
    descricao: t.descricao ?? '',
    valor: Number(t.valor ?? 0),
    tipo: t.tipo ?? '',
  }))

  // Cobrado × Recebido (do XLS do Conta Azul: raw.valor_original vs valor recebido)
  const cobrancas: CobrancaItem[] = []
  for (const t of exRaw ?? []) {
    const raw = (t.raw ?? null) as Record<string, unknown> | null
    if (!raw || typeof raw.valor_original !== 'number') continue
    const recebido = Number(t.valor ?? 0)
    if (recebido <= 0) continue                       // foco em entradas (boletos cobrados)
    const cobrado = Math.abs(Number(raw.valor_original ?? 0))
    const diferenca = cobrado - recebido
    if (Math.abs(diferenca) < 0.01) continue          // só onde cobrado ≠ recebido
    cobrancas.push({
      id: String(t.id),
      data: (t.data ?? '').slice(0, 10),
      conta_nome: t.conta_nome ?? '—',
      descricao: t.descricao ?? '',
      categoria: String(raw.categoria ?? ''),
      cobrado,
      recebido,
      taxa: Number(raw.taxas ?? 0),
      juros: Number(raw.juros ?? 0),
      multa: Number(raw.multa ?? 0),
      desconto: Number(raw.desconto ?? 0),
      diferenca,
    })
  }
  cobrancas.sort((a, b) => b.diferenca - a.diferenca)  // maiores diferenças primeiro
  const resumoCobr = resumirCobrancas(cobrancas)

  // Lançamentos pagos do ERP na janela (paginado — foge do cap de 1000)
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
            Extrato real (arquivo OFX/XLS ou Open Finance) × lançamentos do ERP · últimos {DIAS} dias
          </p>
        </div>
      </div>
      <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6 md:py-8">
        <Suspense>
          <ImportarExtrato empresas={empresas ?? []} />
          <ConciliacaoTabs
            tabelaPronta={tabelaPronta}
            transacoes={conciliadas}
            resumo={resumo}
            cobrancas={cobrancas}
            resumoCobr={resumoCobr}
          />
        </Suspense>
      </div>
    </main>
  )
}
