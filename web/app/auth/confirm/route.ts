import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import type { EmailOtpType } from '@supabase/supabase-js'

/**
 * Troca o token do e-mail por uma sessão e encaminha para o destino.
 *
 * É o ponto de chegada dos links de autenticação (recuperação de senha, convite,
 * troca de e-mail). O Supabase manda o usuário para cá de duas formas conforme o
 * fluxo do projeto, e as duas são tratadas:
 *
 *   ?code=…                    → PKCE, padrão do @supabase/ssr
 *   ?token_hash=…&type=recovery → verificação por OTP
 *
 * Sem esta rota o link abre a aplicação, o token fica no ar e nada acontece —
 * era exatamente o estado anterior: e-mail chegava, link "funcionava" e a senha
 * seguia a mesma.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  // Só caminho relativo: 'next' vindo da URL não pode virar redirect aberto.
  const bruto = searchParams.get('next') ?? '/redefinir-senha'
  const next = bruto.startsWith('/') && !bruto.startsWith('//') ? bruto : '/redefinir-senha'

  const resposta = NextResponse.redirect(new URL(next, origin))

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            resposta.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
      : { error: { message: 'link sem token' } as { message: string } }

  if (error) {
    // Motivo não vai na URL: mensagem de auth pode revelar se a conta existe.
    return NextResponse.redirect(new URL('/login?erro=link_invalido', origin))
  }

  return resposta
}
