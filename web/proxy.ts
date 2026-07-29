import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { perfilExigido, temAcesso } from '@/lib/auth/perfis'

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

  // Mitigação interina LGPD/RBAC: perfis de acesso por rota.
  // Sem a env ACESSO_PERFIS_JSON nada muda (fail-open) — ver lib/auth/perfis.ts
  // e docs/MITIGACAO_LGPD_RBAC_COMMAND_CENTER.md
  if (user) {
    const exigido = perfilExigido(request.nextUrl.pathname)
    if (exigido && !temAcesso(user.email, exigido)) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard/acesso-restrito'
      url.search = `area=${exigido}`
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/dashboard/:path*'],
}
