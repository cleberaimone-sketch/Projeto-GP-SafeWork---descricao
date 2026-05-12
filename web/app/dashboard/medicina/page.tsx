import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function MedicinaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <main className="min-h-screen bg-gray-950 text-white p-6 md:p-8">
      <div className="mb-8">
        <a href="/dashboard" className="text-gray-500 text-sm hover:text-gray-300">← Centro de Comando</a>
        <h1 className="text-2xl font-bold mt-1">Medicina Ocupacional</h1>
        <p className="text-gray-400 text-sm">ASOs · Consultas · PCMSO · 4 clínicas</p>
      </div>

      <div className="bg-gray-900 rounded-xl p-8 border border-gray-800 text-center">
        <p className="text-4xl mb-4">🏥</p>
        <h2 className="text-lg font-semibold mb-2">Integração SOC em desenvolvimento</h2>
        <p className="text-gray-400 text-sm">Os dados de ASOs, consultas e PCMSO serão exibidos aqui após a integração com o sistema SOC.</p>
        <div className="mt-6 grid grid-cols-3 gap-4 max-w-md mx-auto">
          <div className="bg-gray-800 rounded-lg p-4">
            <p className="text-2xl font-bold text-gray-300">—</p>
            <p className="text-xs text-gray-500 mt-1">ASOs vencendo</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <p className="text-2xl font-bold text-gray-300">—</p>
            <p className="text-xs text-gray-500 mt-1">Consultas/mês</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <p className="text-2xl font-bold text-gray-300">—</p>
            <p className="text-xs text-gray-500 mt-1">Clínicas ativas</p>
          </div>
        </div>
      </div>
    </main>
  )
}
