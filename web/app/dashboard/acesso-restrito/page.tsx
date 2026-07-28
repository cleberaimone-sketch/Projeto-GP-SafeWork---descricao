// Tela de acesso restrito — mitigação interina LGPD/RBAC.
// Mostrada quando o usuário autenticado não tem o perfil exigido pela rota
// (ver lib/auth/perfis.ts). Não exibe nenhum dado de negócio.

const AREAS: Record<string, string> = {
  saude: 'Saúde Ocupacional (Medicina / Engenharia)',
  financeiro: 'Financeiro',
  rh: 'RH / Pessoas',
  admin: 'Administração do Sistema',
}

export default async function AcessoRestritoPage({
  searchParams,
}: {
  searchParams: Promise<{ area?: string }>
}) {
  const { area } = await searchParams
  const nomeArea = AREAS[area ?? ''] ?? 'esta área'

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-6">
      <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
        <div className="text-4xl mb-4">🔒</div>
        <h1 className="text-xl font-bold mb-2">Acesso restrito</h1>
        <p className="text-slate-400 text-sm leading-relaxed mb-6">
          Seu usuário não tem permissão para acessar <strong className="text-slate-200">{nomeArea}</strong>.
          Este conteúdo contém dados protegidos (LGPD) e está limitado a perfis autorizados.
          Se você precisa deste acesso, fale com o administrador do Centro de Comando.
        </p>
        <a
          href="/dashboard"
          className="inline-block px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium"
        >
          ← Voltar ao Centro de Comando
        </a>
      </div>
    </main>
  )
}
