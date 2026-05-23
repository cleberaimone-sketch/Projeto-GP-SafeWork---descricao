import { createClient } from '@/lib/supabase/server'
import { createClient as sb } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import AimoneChat from './AimoneChat'

export default async function AimonePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = sb(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const [{ data: convData }, { data: monitorData }] = await Promise.all([
    service.from('conversas_ia').select('mensagens').eq('agente', 'aimone').eq('canal', 'dashboard').eq('contato_id', user.id).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    service.from('conversas_ia').select('contato_nome, mensagens, updated_at').eq('agente', 'aimone').eq('canal', 'whatsapp_monitor').order('updated_at', { ascending: false }).limit(20),
  ])

  const initialMessages = ((convData?.mensagens ?? []) as { role: 'user' | 'assistant'; content: string }[]).slice(-30)

  type MonitorRow = { contato_nome: string; mensagens: { content: string; timestamp?: string }[]; updated_at: string }
  const conversasMonitoradas = (monitorData ?? []) as MonitorRow[]

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white">
        <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6">
          <a href="/dashboard" className="text-blue-200/80 text-sm hover:text-white inline-block mb-2">← Centro de Comando</a>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-400 to-violet-700 text-white flex items-center justify-center text-xl font-bold shadow-lg">Ai</div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Aimone — Assistente Pessoal</h1>
              <p className="text-blue-100/90 text-sm">Organização pessoal · WhatsApp · Casa · Computador</p>
            </div>
            <div className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-full border bg-violet-500/20 border-violet-300/40 text-violet-100">
              <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
              <span className="text-xs font-medium">Monitorando</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6 md:py-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <h2 className="text-sm font-semibold text-slate-500 mb-3">Chat com Aimone</h2>
          <AimoneChat initialMessages={initialMessages} />
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-xl p-4 border border-slate-200">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              WhatsApp Monitorado ({conversasMonitoradas.length})
            </h3>
            {conversasMonitoradas.length === 0 ? (
              <p className="text-xs text-slate-500">Nenhuma conversa pessoal monitorada ainda</p>
            ) : (
              <div className="space-y-3">
                {conversasMonitoradas.map((c, i) => {
                  const msgs = c.mensagens ?? []
                  const ultima = msgs[msgs.length - 1]
                  return (
                    <div key={i} className="border-b border-slate-200 pb-2 last:border-0">
                      <p className="text-xs font-medium text-violet-700">{c.contato_nome}</p>
                      {ultima && (
                        <p className="text-xs text-slate-500 truncate mt-0.5">{ultima.content.slice(0, 80)}</p>
                      )}
                      <p className="text-xs text-slate-500 mt-0.5">
                        {new Date(c.updated_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl p-4 border border-slate-200">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Pergunte ao Aimone</h3>
            <div className="space-y-1 text-xs text-slate-500">
              <p>• "Resuma minhas mensagens de hoje"</p>
              <p>• "Alguma mensagem importante pendente?"</p>
              <p>• "Sugira estrutura de pastas para projetos"</p>
              <p>• "Crie uma rotina de automação para casa"</p>
            </div>
          </div>
        </div>
      </div>
      </div>
    </main>
  )
}
