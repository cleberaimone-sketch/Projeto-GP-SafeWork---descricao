import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { EmailOtpType } from '@supabase/supabase-js'
import { destinoSeguro } from '@/lib/auth/destino-seguro'
import ConfirmarNoCliente from './ConfirmarNoCliente'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Confirmando acesso — GP SafeWork', robots: { index: false } }

/**
 * Ponto de chegada dos links de autenticação (recuperação de senha, convite).
 *
 * O Supabase entrega o token de duas formas, e a diferença decide quem consegue
 * lê-lo:
 *
 *   ?code= / ?token_hash=   → QUERY, chega ao servidor  → resolvido aqui
 *   #access_token=          → FRAGMENTO, NUNCA chega ao servidor → ver abaixo
 *
 * O fragmento existe só no navegador: o servidor recebe a requisição sem ele.
 * Foi o que quebrou o H6 — o route handler não via token nenhum e mandava todo
 * link da Admin API para /login?erro=link_invalido. Links do PKCE usam query;
 * os da Admin API (generate_link) usam fragmento.
 *
 * Por isso esta rota deixou de ser route handler e virou página: quando não há
 * token na query, delega ao cliente, que enxerga o fragmento.
 */
export default async function ConfirmarPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; token_hash?: string; type?: string; next?: string }>
}) {
  const { code, token_hash: tokenHash, type, next } = await searchParams
  const destino = destinoSeguro(next)

  // Caminho da QUERY (PKCE e OTP) — resolvido no servidor, como antes.
  if (code || (tokenHash && type)) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          },
        },
      },
    )

    const { error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({ type: type as EmailOtpType, token_hash: tokenHash! })

    // Motivo não vai na URL: mensagem de auth revela se a conta existe.
    redirect(error ? '/login?erro=link_invalido' : destino)
  }

  // Sem token na query: pode estar no fragmento, que só o navegador vê.
  return <ConfirmarNoCliente destino={destino} />
}
