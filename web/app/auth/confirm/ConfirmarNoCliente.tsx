'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/** Tempo máximo esperando o Supabase processar o fragmento. */
const LIMITE_MS = 8000

/**
 * Consome o token que veio no FRAGMENTO da URL (#access_token=…).
 *
 * O fragmento nunca chega ao servidor, então este é o único lugar capaz de
 * lê-lo. O createBrowserClient do @supabase/ssr já vem com detectSessionInUrl
 * ligado: ao ser instanciado numa página cujo hash carrega tokens, ele
 * estabelece a sessão e limpa a URL sozinho. O trabalho aqui é aguardar esse
 * efeito e então seguir para o destino.
 *
 * Não lê, não registra e não transmite o token — apenas espera a sessão existir.
 * Sem sessão dentro do limite, trata como link inválido.
 */
export default function ConfirmarNoCliente({ destino }: { destino: string }) {
  const [demorou, setDemorou] = useState(false)
  const navegou = useRef(false)

  useEffect(() => {
    const supabase = createClient()

    const ir = (url: string) => {
      if (navegou.current) return
      navegou.current = true
      window.location.replace(url)
    }

    // Se o hash nem parece um retorno de auth, nem vale esperar.
    const hash = window.location.hash
    const pareceToken = hash.includes('access_token=') || hash.includes('error=')
    if (!pareceToken) {
      supabase.auth.getSession().then(({ data }) => {
        // Sessão já ativa: o link é redundante, mas o destino continua válido.
        ir(data.session ? destino : '/login?erro=link_invalido')
      })
      return
    }

    // O Supabase devolve o próprio erro no hash quando o link expirou.
    if (hash.includes('error=')) {
      ir('/login?erro=link_invalido')
      return
    }

    const { data: inscricao } = supabase.auth.onAuthStateChange((_evento, sessao) => {
      if (sessao) ir(destino)
    })

    // detectSessionInUrl pode ter concluído antes do listener entrar.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) ir(destino)
    })

    const aviso = setTimeout(() => setDemorou(true), 3000)
    const desistir = setTimeout(() => ir('/login?erro=link_invalido'), LIMITE_MS)

    return () => {
      inscricao.subscription.unsubscribe()
      clearTimeout(aviso)
      clearTimeout(desistir)
    }
  }, [destino])

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-slate-50 to-blue-100 flex items-center justify-center p-4">
      <div className="text-center">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-700 to-blue-900 text-white flex items-center justify-center text-2xl font-bold mx-auto mb-5 shadow-lg">
          GP
        </div>
        <p className="text-slate-700 text-sm font-medium">Confirmando seu acesso…</p>
        {demorou && (
          <p className="text-slate-500 text-xs mt-2">
            Está demorando mais que o normal. Aguarde um instante.
          </p>
        )}
        <noscript>
          <p className="text-red-700 text-sm mt-4 max-w-xs">
            Este link precisa de JavaScript para ser concluído. Ative-o e abra o
            link novamente.
          </p>
        </noscript>
      </div>
    </main>
  )
}
