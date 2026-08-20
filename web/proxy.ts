import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { podeAcessar, areaDaRota, configInvalida } from '@/lib/auth/perfis'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Protege rotas do dashboard — redireciona para /login se não autenticado
  if (!user && request.nextUrl.pathname.startsWith('/dashboard')) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // RBAC do Command Center — F1: DEFAULT DENY.
  // Todo /dashboard exige perfil executivo/admin; só a tela de bloqueio fica
  // livre. Rota nova nasce bloqueada. Sem a env ACESSO_PERFIS_JSON nada muda
  // (fail-open), o que preserva o rollback por env — ver lib/auth/perfis.ts e
  // docs/MITIGACAO_LGPD_RBAC_COMMAND_CENTER.md
  if (user && !podeAcessar(user.email, request.nextUrl.pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard/acesso-restrito'
    // A área serve só para a mensagem. 'config' distingue env quebrada de falta
    // de permissão — senão o administrador procura no lugar errado.
    const area = configInvalida() ? 'config' : areaDaRota(request.nextUrl.pathname)
    url.search = area ? `area=${area}` : ''
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/dashboard/:path*'],
}
