import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LoginForm from './LoginForm'

export default async function LoginPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-slate-50 to-blue-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-700 to-blue-900 text-white flex items-center justify-center text-2xl font-bold mx-auto mb-4 shadow-lg">GP</div>
          <h1 className="text-xl font-bold text-slate-900">GP SafeWork</h1>
          <p className="text-slate-500 text-sm mt-1">Centro de Comando</p>
        </div>
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <LoginForm />
        </div>
      </div>
    </main>
  )
}
