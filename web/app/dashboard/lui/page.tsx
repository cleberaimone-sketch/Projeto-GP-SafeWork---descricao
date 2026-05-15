import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LuiChat from './LuiChat'
import BriefingActions from './BriefingActions'
import MemoriasPanel from '../components/MemoriasPanel'

type Briefing = {
  id: string
  data_briefing: string
  conteudo: string
  resumo: string
  enviado: boolean
  enviado_em: string | null
  created_at: string
}

export default async function LuiPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const sb = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const [
    { data: conversaDashboard },
    { data: syncRecente },
    { data: briefingsRaw },
    { data: conversaWhatsapp },
  ] = await Promise.all([
    sb.from('conversas_ia')
      .select('mensagens')
      .eq('agente', 'lui')
      .eq('canal', 'dashboard')
      .eq('contato_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1),
    sb.from('sync_log')
      .select('fonte, status, finalizado_em, registros_processados')
      .order('finalizado_em', { ascending: false })
      .limit(5),
    sb.from('briefings_diarios')
      .select('id, data_briefing, conteudo, resumo, enviado, enviado_em, created_at')
      .order('data_briefing', { ascending: false })
      .limit(7),
    sb.from('conversas_ia')
      .select('updated_at, tokens_usados')
      .eq('agente', 'LUI')
      .eq('canal', 'whatsapp')
      .order('updated_at', { ascending: false })
      .limit(1),
  ])

  const initialMessages = ((conversaDashboard?.[0]?.mensagens ?? []) as { role: 'user' | 'assistant'; content: string }[]).slice(-30)
  const briefings = (briefingsRaw ?? []) as Briefing[]
  const ultimaInteracaoWpp = conversaWhatsapp?.[0]?.updated_at
    ? new Date(conversaWhatsapp[0].updated_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null
  const hoje = new Date().toISOString().split('T')[0]
  const briefingHoje = briefings.find(b => b.data_briefing === hoje)

  return (
    <main className="min-h-screen bg-gray-950 text-white p-6 md:p-8">
      {/* Header */}
      <div className="mb-8">
        <a href="/dashboard" className="text-gray-500 text-sm hover:text-gray-300">← Centro de Comando</a>
        <div className="flex items-center gap-4 mt-2">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-600 to-blue-900 flex items-center justify-center text-xl font-bold">L</div>
          <div>
            <h1 className="text-2xl font-bold">LUI — Agente Estratégico</h1>
            <p className="text-gray-400 text-sm">Inteligência operacional · Briefing diário · WhatsApp + Web</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-green-400">Ativo</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Chat — 2/3 */}
        <div className="md:col-span-2 space-y-6">
          <div>
            <h2 className="text-sm font-semibold text-gray-400 mb-3">Chat com LUI</h2>
            <LuiChat initialMessages={initialMessages} />
            <p className="text-xs text-gray-600 mt-2">Também disponível via WhatsApp · Briefing diário às 7h</p>
          </div>

          {/* Histórico de briefings */}
          <div className="bg-gray-900 rounded-xl border border-gray-800">
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <div>
                <h3 className="text-sm font-semibold text-gray-200">Briefings Diários</h3>
                <p className="text-xs text-gray-500 mt-0.5">Últimos 7 dias</p>
              </div>
              {briefingHoje && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-900/40 text-green-400 border border-green-800/40">
                  ✓ Gerado hoje
                </span>
              )}
            </div>

            {briefings.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm text-gray-500">Nenhum briefing gerado ainda</p>
                <p className="text-xs text-gray-600 mt-1">Use o botão abaixo para gerar o primeiro</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-800">
                {briefings.map((b) => (
                  <details key={b.id} className="group">
                    <summary className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-800/50 transition-colors list-none">
                      <div className="flex items-center gap-3">
                        <div className="text-center min-w-[40px]">
                          <p className="text-lg font-bold text-white leading-none">
                            {new Date(b.data_briefing + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit' })}
                          </p>
                          <p className="text-[10px] text-gray-500">
                            {new Date(b.data_briefing + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short' })}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-300 line-clamp-2">{b.resumo || b.conteudo?.slice(0, 120)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${b.enviado ? 'bg-green-900/40 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
                          {b.enviado ? '✓ Enviado' : 'Local'}
                        </span>
                        <span className="text-gray-600 text-xs group-open:rotate-180 transition-transform">▾</span>
                      </div>
                    </summary>
                    <div className="px-4 pb-4">
                      <div className="bg-gray-800/60 rounded-xl p-4 text-xs text-gray-300 whitespace-pre-wrap leading-relaxed border border-gray-700/50">
                        {b.conteudo}
                      </div>
                      {b.enviado_em && (
                        <p className="text-[10px] text-gray-600 mt-2">
                          Enviado via WhatsApp em {new Date(b.enviado_em).toLocaleString('pt-BR')}
                        </p>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar — 1/3 */}
        <div className="space-y-4">
          {/* Briefing actions — disparo manual */}
          <BriefingActions briefingHojeExiste={!!briefingHoje} />

          {/* Memórias do LUI */}
          <MemoriasPanel agente="lui" />

          {/* Perfil */}
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Perfil</h3>
            <div className="space-y-2 text-xs">
              {[
                { label: 'Canal', val: 'WhatsApp + Web' },
                { label: 'Modelo', val: 'Claude Sonnet 4.6' },
                { label: 'Briefing', val: 'Diário 07:00h' },
                { label: 'Agentes', val: 'Plata · Lari · Dieguito' },
                { label: 'Última interação', val: ultimaInteracaoWpp ?? 'Nunca' },
              ].map(row => (
                <div key={row.label} className="flex justify-between">
                  <span className="text-gray-500">{row.label}</span>
                  <span className="text-gray-200">{row.val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Status integrações */}
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Integrações Recentes</h3>
            <div className="space-y-2">
              {(syncRecente ?? []).map((s, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-200">{s.fonte}</p>
                    <p className="text-xs text-gray-500">
                      {s.finalizado_em
                        ? new Date(s.finalizado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </p>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    s.status === 'sucesso'  ? 'bg-green-900/50 text-green-300' :
                    s.status === 'parcial'  ? 'bg-yellow-900/50 text-yellow-300' :
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

          {/* Links rápidos */}
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Acesso Rápido</h3>
            <div className="space-y-2">
              {[
                { label: 'Dashboard Financeiro', href: '/dashboard/financeiro', color: 'text-amber-400' },
                { label: 'Plata — CFO IA', href: '/dashboard/financeiro/plata', color: 'text-amber-300' },
                { label: 'Lari — Medicina', href: '/dashboard/medicina', color: 'text-emerald-400' },
                { label: 'Dieguito — Engenharia', href: '/dashboard/engenharia', color: 'text-orange-400' },
                { label: 'Centro de Comando', href: '/dashboard', color: 'text-blue-400' },
              ].map(link => (
                <a key={link.href} href={link.href} className={`block text-xs ${link.color} hover:underline`}>
                  {link.label} →
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
