import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import SyncClient from './SyncClient'
import PluggyConnect from './PluggyConnect'
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
    { data: empresasList },
  ] = await Promise.all([
    sb.from('conta_azul_tokens').select('empresa_nome, empresa_id, atualizado_em'),
    sb.from('lancamentos_financeiros').select('empresa_id'),
    sb.from('sync_log')
      .select('empresa_id, status, registros_processados, mensagem_erro, finalizado_em, tipo_sync')
      .eq('fonte', 'conta_azul')
      .eq('tipo_sync', 'financeiro')
      .order('finalizado_em', { ascending: false })
      .limit(50),
    sb.from('empresas').select('id, nome_curto').order('nome_curto'),
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
    <main className="min-h-screen bg-slate-50 text-slate-800">

      {/* Header banner */}
      <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white">
        <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6">
          <div className="flex items-center gap-3 mb-2">
            <a href="/dashboard/financeiro" className="text-blue-200/80 text-sm hover:text-white">← Financeiro</a>
            <span className="text-blue-300">·</span>
            <a href="/dashboard" className="text-blue-200/80 text-sm hover:text-white">Centro de Comando</a>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Integrações Financeiras</h1>
          <p className="text-blue-100/90 text-sm">
            Conta Azul (lançamentos) · Pluggy / Open Finance (saldos reais)
          </p>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6 md:py-8 space-y-6">

        {/* Pluggy — saldos bancários reais */}
        <PluggyConnect empresas={empresasList ?? []} />

        {/* Conta Azul — lançamentos */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-slate-900">Conta Azul · Lançamentos</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {status.length} {status.length === 1 ? 'empresa autorizada' : 'empresas autorizadas'} ·
              Sincronize individualmente para evitar erros em cascata
            </p>
          </div>
          <Suspense>
            <SyncClient empresas={status} />
          </Suspense>
        </div>

      </div>
    </main>
  )
}
