import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LoginForm from './LoginForm'

export default async function LoginPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-600 to-blue-900 flex items-center justify-center text-2xl font-bold mx-auto mb-4">GP</div>
          <h1 className="text-xl font-bold text-white">GP SafeWork</h1>
          <p className="text-gray-400 text-sm mt-1">Centro de Comando</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <LoginForm />
        </div>
      </div>
    </main>
  )
}
