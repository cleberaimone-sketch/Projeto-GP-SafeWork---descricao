import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import SyncClient from './SyncClient'
import type { EmpresaSyncStatus } from './SyncClient'

export default async function SyncPage() {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) redirect('/login')

  const sb = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // ── Carrega status sem tocar no Conta Azul ────────────────────────────────
  const [
    { data: tokens },
    { data: lancCount },
    { data: syncLogs },
  ] = await Promise.all([
    sb.from('conta_azul_tokens').select('empresa_nome, empresa_id, atualizado_em'),
    // Contagem de lançamentos por empresa
    sb.from('lancamentos_financeiros').select('empresa_id'),
    // Último sync por empresa
    sb.from('sync_log')
      .select('empresa_id, status, registros_processados, mensagem_erro, finalizado_em, tipo_sync')
      .eq('fonte', 'conta_azul')
      .eq('tipo_sync', 'financeiro')
      .order('finalizado_em', { ascending: false })
      .limit(50),
  ])

  // Contar lançamentos por empresa
  const lancPorEmpresa: Record<string, number> = {}
  for (const l of lancCount ?? []) {
    if (l.empresa_id) lancPorEmpresa[l.empresa_id] = (lancPorEmpresa[l.empresa_id] ?? 0) + 1
  }

  // Último sync por empresa (já vem ordenado, só pega o 1º de cada)
  const ultimoSyncPorEmpresa: Record<string, NonNullable<typeof syncLogs>[number]> = {}
  for (const s of syncLogs ?? []) {
    if (!s.empresa_id) continue
    if (!ultimoSyncPorEmpresa[s.empresa_id]) ultimoSyncPorEmpresa[s.empresa_id] = s
  }

  const status: EmpresaSyncStatus[] = (tokens ?? []).map(t => {
    const ultimo = t.empresa_id ? ultimoSyncPorEmpresa[t.empresa_id] : undefined
    return {
      empresa_nome: t.empresa_nome,
      empresa_id: t.empresa_id,
      token_atualizado_em: t.atualizado_em,
      qtd_lancamentos: t.empresa_id ? (lancPorEmpresa[t.empresa_id] ?? 0) : 0,
      ultimo_sync_em: ultimo?.finalizado_em ?? null,
      ultimo_sync_status: (ultimo?.status as 'sucesso' | 'parcial' | 'erro' | undefined) ?? null,
      ultimo_sync_registros: ultimo?.registros_processados ?? 0,
      ultimo_sync_erro: ultimo?.mensagem_erro ?? null,
    }
  }).sort((a, b) => a.empresa_nome.localeCompare(b.empresa_nome))

  return (
    <main className="min-h-screen bg-slate-50 text-white p-6 md:p-8">

      <div className="mb-6">
        <div className="flex items-center gap-3">
          <a href="/dashboard/financeiro" className="text-slate-500 text-sm hover:text-slate-700">← Financeiro</a>
          <span className="text-slate-700">·</span>
          <a href="/dashboard" className="text-slate-500 text-sm hover:text-slate-700">Centro de Comando</a>
        </div>
        <h1 className="text-2xl font-bold mt-2">Sincronização Conta Azul</h1>
        <p className="text-slate-500 text-sm">
          {status.length} {status.length === 1 ? 'empresa autorizada' : 'empresas autorizadas'} ·
          Sincronize individualmente para evitar erros em cascata
        </p>
      </div>

      <Suspense>
        <SyncClient empresas={status} />
      </Suspense>

    </main>
  )
}
