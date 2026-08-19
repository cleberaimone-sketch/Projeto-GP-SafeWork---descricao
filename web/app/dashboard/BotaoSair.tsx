'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Botão de sair do Command Center.
 *
 * Usa scope 'global': revoga TODAS as sessões do usuário, não só a deste
 * navegador. É o que faz o RBAC valer de fato — sem isso, quem já estava
 * logado continuaria navegando indefinidamente, porque a sessão do Supabase se
 * renova sozinha (refresh rotation ligada, sem timebox nem timeout de
 * inatividade no projeto).
 *
 * Depois do signOut navega por window.location, não pelo router: força um
 * carregamento completo, garantindo que o proxy releia os cookies já limpos.
 * Com router.push o cliente poderia seguir com estado antigo em memória.
 */
export default function BotaoSair() {
  const [saindo, setSaindo] = useState(false)

  async function sair() {
    if (saindo) return
    setSaindo(true)
    try {
      await createClient().auth.signOut({ scope: 'global' })
    } catch {
      // Falha ao revogar no servidor (rede, sessão já expirada) não pode
      // prender o usuário na tela: seguimos para o login de qualquer forma.
    } finally {
      window.location.href = '/login'
    }
  }

  return (
    <button
      onClick={sair}
      disabled={saindo}
      title="Encerrar sessão em todos os dispositivos"
      className="fixed top-3 right-3 z-50 flex items-center gap-1.5 rounded-lg
                 border border-slate-300/70 bg-white/90 px-3 py-1.5 text-xs
                 font-medium text-slate-700 shadow-sm backdrop-blur
                 transition-colors hover:bg-white hover:text-slate-900
                 disabled:cursor-not-allowed disabled:opacity-60
                 dark:border-slate-600/70 dark:bg-slate-800/90 dark:text-slate-200
                 dark:hover:bg-slate-800"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" strokeWidth="2" strokeLinecap="round"
           strokeLinejoin="round" aria-hidden="true">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
      {saindo ? 'Saindo…' : 'Sair'}
    </button>
  )
}
