import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Buscar totais gerais (Centro de Comando)
  const { data: empresas } = await supabase
    .from('empresas')
    .select('id, nome_curto, status')
    .eq('status', 'ativa')
    .order('nome')

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <h1 className="text-3xl font-bold mb-2">Centro de Comando</h1>
      <p className="text-gray-400 mb-8">GP SafeWork — Visão Holding</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {empresas?.map(e => (
          <div key={e.id} className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <p className="text-sm text-gray-400">{e.nome_curto}</p>
            <span className="inline-block mt-1 text-xs bg-green-900 text-green-300 px-2 py-0.5 rounded-full">
              {e.status}
            </span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <a href="/dashboard/financeiro" className="bg-gray-900 rounded-xl p-6 border border-gray-800 hover:border-blue-500 transition-colors">
          <h2 className="text-lg font-semibold mb-1">Financeiro</h2>
          <p className="text-sm text-gray-400">A/R · A/P · Saldos · Inadimplência</p>
        </a>
        <a href="/dashboard/medicina" className="bg-gray-900 rounded-xl p-6 border border-gray-800 hover:border-blue-500 transition-colors">
          <h2 className="text-lg font-semibold mb-1">Medicina</h2>
          <p className="text-sm text-gray-400">Consultas · ASOs · PCMSO</p>
        </a>
        <a href="/dashboard/engenharia" className="bg-gray-900 rounded-xl p-6 border border-gray-800 hover:border-blue-500 transition-colors">
          <h2 className="text-lg font-semibold mb-1">Engenharia</h2>
          <p className="text-sm text-gray-400">Laudos · PGR · Conformidade NR</p>
        </a>
      </div>
    </main>
  )
}
