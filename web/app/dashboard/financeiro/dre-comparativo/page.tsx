import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DreComparativoClient from './DreComparativoClient'

export const maxDuration = 60

export default async function DreComparativoPage() {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) redirect('/login')

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white">
        <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6">
          <div className="flex items-center gap-3 mb-2">
            <a href="/dashboard/financeiro" className="text-blue-200/80 text-sm hover:text-white">← Financeiro</a>
            <span className="text-blue-300">·</span>
            <a href="/dashboard" className="text-blue-200/80 text-sm hover:text-white">Centro de Comando</a>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">DRE Comparativo</h1>
          <p className="text-blue-100/90 text-sm">Contabilidade (arquivo DRE) × Centro de Comando (Conta Azul) — por empresa</p>
        </div>
      </div>
      <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6 md:py-8">
        <DreComparativoClient />
      </div>
    </main>
  )
}
