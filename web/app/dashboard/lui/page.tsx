import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LuiChat from './LuiChat'

export default async function LuiPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const sb = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const [
    { data: conversas },
    { data: syncRecente },
  ] = await Promise.all([
    sb.from('conversas_ia')
      .select('mensagens, updated_at, tokens_usados')
      .eq('agente', 'LUI')
      .eq('canal', 'whatsapp')
      .order('updated_at', { ascending: false })
      .limit(1),
    sb.from('sync_log')
      .select('fonte, status, finalizado_em, registros_processados')
      .order('finalizado_em', { ascending: false })
      .limit(5),
  ])
  const ultimaConversa = conversas?.[0] ?? null

  type MsgObj = { role: string; content: string }
  const ultimasMensagens = (ultimaConversa?.mensagens as MsgObj[] | null) ?? []
  const ultimoMsg = ultimasMensagens[ultimasMensagens.length - 1]
  const ultimoSync = ultimaConversa?.updated_at
    ? new Date(ultimaConversa.updated_at).toLocaleString('pt-BR')
    : null

  return (
    <main className="min-h-screen bg-gray-950 text-white p-6 md:p-8">
      {/* Header */}
      <div className="mb-8">
        <a href="/dashboard" className="text-gray-500 text-sm hover:text-gray-300">← Centro de Comando</a>
        <div className="flex items-center gap-4 mt-2">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-600 to-blue-900 flex items-center justify-center text-xl font-bold">L</div>
          <div>
            <h1 className="text-2xl font-bold">LUI — Agente Estratégico</h1>
            <p className="text-gray-400 text-sm">Inteligência operacional do Grupo GP SafeWork</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-green-400">Ativo</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Chat Principal */}
        <div className="md:col-span-2">
          <h2 className="text-sm font-semibold text-gray-400 mb-3">Chat com LUI</h2>
          <LuiChat />
          <p className="text-xs text-gray-600 mt-2">Também disponível via WhatsApp · Briefing diário às 7h</p>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Identidade */}
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Perfil</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Canal</span>
                <span className="text-gray-200">WhatsApp + Web</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Modelo</span>
                <span className="text-gray-200">Claude 3.5 Sonnet</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Briefing</span>
                <span className="text-gray-200">Diário 07:00h</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Última interação</span>
                <span className="text-gray-200">{ultimoSync ?? 'Nunca'}</span>
              </div>
            </div>
          </div>

          {/* Última mensagem WhatsApp */}
          {ultimoMsg && (
            <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Última resposta WhatsApp</h3>
              <p className="text-xs text-gray-300 whitespace-pre-wrap line-clamp-8">{ultimoMsg.content}</p>
              {ultimoSync && <p className="text-xs text-gray-600 mt-2">{ultimoSync}</p>}
            </div>
          )}

          {/* Status integrações */}
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Integrações Recentes</h3>
            <div className="space-y-2">
              {(syncRecente ?? []).map((s, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-200">{s.fonte}</p>
                    <p className="text-xs text-gray-500">
                      {s.finalizado_em ? new Date(s.finalizado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </p>
                  </div>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    s.status === 'sucesso' ? 'bg-green-900/50 text-green-300' :
                    s.status === 'parcial' ? 'bg-yellow-900/50 text-yellow-300' :
                    'bg-red-900/50 text-red-300'
                  }`}>
                    {s.status}
                  </span>
                </div>
              ))}
              {(!syncRecente || syncRecente.length === 0) && (
                <p className="text-xs text-gray-500">Nenhum sync registrado</p>
              )}
            </div>
          </div>

          {/* Ações rápidas */}
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Ações</h3>
            <div className="space-y-2">
              <a
                href="/api/lui/briefing"
                className="block w-full text-center text-xs bg-blue-900/50 hover:bg-blue-800/50 text-blue-300 py-2 rounded-lg transition-colors"
              >
                Gerar briefing agora
              </a>
              <a
                href="/api/conta-azul/sync"
                className="block w-full text-center text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded-lg transition-colors"
              >
                Sync Conta Azul manual
              </a>
              <a
                href="/dashboard/financeiro"
                className="block w-full text-center text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded-lg transition-colors"
              >
                Ver dashboard financeiro
              </a>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
