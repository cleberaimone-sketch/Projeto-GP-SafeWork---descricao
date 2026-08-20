'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const MINIMO = 8

export default function RedefinirSenhaForm() {
  const [senha, setSenha] = useState('')
  const [confirma, setConfirma] = useState('')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')

    if (senha.length < MINIMO) {
      setErro(`A senha precisa ter ao menos ${MINIMO} caracteres.`)
      return
    }
    if (senha !== confirma) {
      setErro('As senhas não conferem.')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: senha })
    if (error) {
      setErro('Não foi possível alterar a senha. O link pode ter expirado.')
      setLoading(false)
      return
    }

    // Encerra as demais sessões: se a senha estava comprometida, trocar sem
    // derrubar o resto deixaria o acesso antigo vivo.
    await supabase.auth.signOut({ scope: 'others' })
    window.location.href = '/dashboard'
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm text-slate-500 mb-1">Nova senha</label>
        <input
          type="password"
          value={senha}
          onChange={e => setSenha(e.target.value)}
          required
          autoFocus
          minLength={MINIMO}
          className="w-full bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          placeholder="ao menos 8 caracteres"
        />
      </div>
      <div>
        <label className="block text-sm text-slate-500 mb-1">Repita a senha</label>
        <input
          type="password"
          value={confirma}
          onChange={e => setConfirma(e.target.value)}
          required
          className="w-full bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          placeholder="••••••••"
        />
      </div>
      {erro && <p className="text-red-700 text-sm">{erro}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors shadow-sm"
      >
        {loading ? 'Salvando...' : 'Salvar nova senha'}
      </button>
      <p className="text-xs text-slate-500 text-center pt-1">
        As outras sessões desta conta serão encerradas.
      </p>
    </form>
  )
}
