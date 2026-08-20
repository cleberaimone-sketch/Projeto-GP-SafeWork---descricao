import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import RedefinirSenhaForm from './RedefinirSenhaForm'

export const metadata = { title: 'Definir nova senha — GP SafeWork' }
export const dynamic = 'force-dynamic'

export default async function RedefinirSenhaPage() {
  // Só chega aqui quem veio pelo /auth/confirm com token válido — de lá sai com
  // sessão de recuperação. Sem sessão, não há o que redefinir.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?erro=link_invalido')

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-slate-50 to-blue-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-700 to-blue-900 text-white flex items-center justify-center text-2xl font-bold mx-auto mb-4 shadow-lg">GP</div>
          <h1 className="text-xl font-bold text-slate-900">Definir nova senha</h1>
          <p className="text-slate-500 text-sm mt-1">{user.email}</p>
        </div>
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <RedefinirSenhaForm />
        </div>
      </div>
    </main>
  )
}
