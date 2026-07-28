// Perfis de acesso interinos — mitigação LGPD/RBAC do GP Command Center.
// Ver docs/MITIGACAO_LGPD_RBAC_COMMAND_CENTER.md
//
// SEM BANCO: a configuração vem da env ACESSO_PERFIS_JSON, um JSON de
// e-mail → perfis. Exemplo:
//   ACESSO_PERFIS_JSON={"cleber@gp.com":["executivo"],"evelyn@gp.com":["financeiro"]}
//
// FAIL-OPEN por design: sem a env definida (ou inválida), NADA muda —
// todo usuário autenticado continua vendo tudo, como hoje. A restrição
// só passa a valer quando a env for configurada (Vercel + .env.local).

export type Perfil = 'executivo' | 'financeiro' | 'saude' | 'rh' | 'admin'

// Prefixo de rota → perfil exigido. Rotas fora da lista são gerais
// (qualquer usuário autenticado). 'executivo' e 'admin' veem tudo.
const ROTA_PERFIL: Array<[string, Perfil]> = [
  ['/dashboard/medicina', 'saude'],       // nomes de trabalhadores, ASO, licenças/CID
  ['/dashboard/engenharia', 'saude'],     // treinamentos NR por trabalhador
  ['/dashboard/rh', 'rh'],                // folha, custo por vínculo, turnover
  ['/dashboard/financeiro', 'financeiro'],// lançamentos, saldos, Caixa do Dia
  ['/dashboard/sistema', 'admin'],        // status de integrações e tokens
  ['/dashboard/os', 'admin'],             // eventos do GP OS Core
]

/** Perfil exigido para um pathname, ou null se a rota é geral. */
export function perfilExigido(pathname: string): Perfil | null {
  for (const [prefixo, perfil] of ROTA_PERFIL) {
    if (pathname === prefixo || pathname.startsWith(prefixo + '/')) return perfil
  }
  return null
}

function carregarConfig(): Record<string, Perfil[]> | null {
  const raw = process.env.ACESSO_PERFIS_JSON
  if (!raw || !raw.trim()) return null // env ausente → fail-open (comportamento atual)
  try {
    const obj = JSON.parse(raw) as Record<string, Perfil[]>
    return Object.fromEntries(
      Object.entries(obj).map(([email, perfis]) => [email.toLowerCase().trim(), perfis]),
    )
  } catch {
    // JSON inválido → fail-open, mas deixa rastro no log do servidor (sem dado pessoal)
    console.error('[perfis] ACESSO_PERFIS_JSON inválido — restrições de perfil NÃO aplicadas')
    return null
  }
}

/** O usuário (por e-mail) tem acesso a rotas do perfil dado? */
export function temAcesso(email: string | null | undefined, perfil: Perfil): boolean {
  const config = carregarConfig()
  if (!config) return true // sem config → sem restrição (fail-open)
  const perfis = config[(email ?? '').toLowerCase().trim()] ?? []
  if (perfis.includes('executivo') || perfis.includes('admin')) return true
  return perfis.includes(perfil)
}
