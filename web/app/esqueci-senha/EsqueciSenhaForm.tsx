'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function EsqueciSenhaForm() {
  const [email, setEmail] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    // O destino passa pelo /auth/confirm, que troca o token por sessão antes de
    // levar ao formulário de nova senha.
    await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/confirm?next=/redefinir-senha`,
    })
    // Mesma resposta com ou sem erro, de propósito: retorno diferente revelaria
    // quais e-mails existem no sistema.
    setEnviado(true)
    setLoading(false)
  }

  if (enviado) {
    return (
      <div className="text-center">
        <div className="text-3xl mb-3">📧</div>
        <p className="text-sm text-slate-700 leading-relaxed mb-2">
          Se houver uma conta com esse e-mail, enviamos um link para redefinir a
          senha.
        </p>
        <p className="text-xs text-slate-500 mb-5">
          O link vale por 1 hora. Confira também a caixa de spam.
        </p>
        <a href="/login" className="text-sm text-blue-700 hover:text-blue-900 font-medium">
          ← Voltar ao login
        </a>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-slate-600 leading-relaxed">
        Informe o e-mail da sua conta. Enviaremos um link para você definir uma
        nova senha.
      </p>
      <div>
        <label className="block text-sm text-slate-500 mb-1">E-mail</label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          autoFocus
          className="w-full bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          placeholder="seu@email.com"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors shadow-sm"
      >
        {loading ? 'Enviando...' : 'Enviar link'}
      </button>
      <div className="text-center pt-1">
        <a href="/login" className="text-sm text-slate-500 hover:text-slate-700">
          ← Voltar ao login
        </a>
      </div>
    </form>
  )
}
