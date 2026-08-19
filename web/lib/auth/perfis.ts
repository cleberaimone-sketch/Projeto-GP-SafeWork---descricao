// Perfis de acesso — mitigação LGPD/RBAC do GP Command Center.
// Ver docs/MITIGACAO_LGPD_RBAC_COMMAND_CENTER.md
//
// SEM BANCO: a configuração vem da env ACESSO_PERFIS_JSON, um JSON de
// e-mail → perfis. Exemplo:
//   ACESSO_PERFIS_JSON={"cleber@gp.com":["executivo"]}
//
// ─── F1 — DEFAULT DENY (19/08/2026) ────────────────────────────────────────
//
// O modelo anterior era allowlist: só bloqueava as rotas listadas em
// ROTA_PERFIL. Na prática isso deixou /dashboard, /dashboard/comercial,
// /dashboard/lui, /dashboard/processos, /dashboard/aimone e
// /dashboard/command-center abertos a QUALQUER usuário autenticado, mesmo sem
// perfil nenhum. A /dashboard/comercial expõe carteira de clientes (CNPJ, nº de
// vidas) e lançamentos financeiros — o oposto da decisão de manter o Command
// Center restrito.
//
// Agora é o contrário: **tudo sob /dashboard exige perfil**, e rota nova nasce
// bloqueada em vez de aberta. Único caminho livre é a própria tela de bloqueio,
// senão o redirect não teria para onde ir.
//
// FAIL-OPEN PRESERVADO PARA ROLLBACK: sem a env definida (ou com JSON inválido),
// nada é bloqueado — o sistema volta a se comportar como antes. É o que permite
// desfazer removendo a env, sem reverter código.

export type Perfil = 'executivo' | 'financeiro' | 'saude' | 'rh' | 'admin'

/** Perfis que atravessam qualquer rota. */
const PERFIS_TOTAIS: Perfil[] = ['executivo', 'admin']

/**
 * Área temática de cada prefixo — hoje usada apenas para a MENSAGEM da tela de
 * bloqueio ("você não tem acesso a Saúde Ocupacional"). Não decide mais o
 * acesso: em F1 toda rota do Command Center exige executivo/admin.
 *
 * Preservado porque é o mapa que volta a valer em F2, quando perfis
 * departamentais forem liberados.
 */
const ROTA_AREA: Array<[string, Perfil]> = [
  ['/dashboard/medicina', 'saude'],        // nomes de trabalhadores, ASO, licenças/CID
  ['/dashboard/engenharia', 'saude'],      // treinamentos NR por trabalhador
  ['/dashboard/rh', 'rh'],                 // folha, custo por vínculo, turnover
  ['/dashboard/financeiro', 'financeiro'], // lançamentos, saldos, Caixa do Dia
  ['/dashboard/sistema', 'admin'],         // status de integrações e tokens
  ['/dashboard/os', 'admin'],              // eventos do GP OS Core
]

/**
 * Rotas sob /dashboard que NÃO exigem perfil.
 *
 * Só a tela de bloqueio: se ela exigisse perfil, o redirect cairia nela mesma e
 * o usuário ficaria preso sem nunca ver a mensagem.
 */
const ROTAS_LIVRES = ['/dashboard/acesso-restrito']

function casaPrefixo(pathname: string, prefixo: string): boolean {
  return pathname === prefixo || pathname.startsWith(prefixo + '/')
}

/** A rota pertence ao Command Center (e portanto é coberta pelo guard)? */
export function ehRotaProtegida(pathname: string): boolean {
  if (!casaPrefixo(pathname, '/dashboard')) return false
  return !ROTAS_LIVRES.some(livre => casaPrefixo(pathname, livre))
}

/**
 * Área da rota, para a mensagem da tela de bloqueio. `null` quando a rota não
 * tem área específica — a tela cai no texto genérico.
 */
export function areaDaRota(pathname: string): Perfil | null {
  for (const [prefixo, area] of ROTA_AREA) {
    if (casaPrefixo(pathname, prefixo)) return area
  }
  return null
}

function carregarConfig(): Record<string, Perfil[]> | null {
  const raw = process.env.ACESSO_PERFIS_JSON
  if (!raw || !raw.trim()) return null // env ausente → fail-open (rollback)
  try {
    const obj = JSON.parse(raw) as Record<string, Perfil[]>
    return Object.fromEntries(
      Object.entries(obj).map(([email, perfis]) => [email.toLowerCase().trim(), perfis]),
    )
  } catch {
    // JSON inválido → fail-open, mas deixa rastro no log (sem dado pessoal)
    console.error('[perfis] ACESSO_PERFIS_JSON inválido — restrições NÃO aplicadas')
    return null
  }
}

/** O RBAC está ativo? (falso = fail-open, comportamento pré-F0) */
export function rbacAtivo(): boolean {
  return carregarConfig() !== null
}

/** Perfis configurados para um e-mail. Vazio se não estiver no JSON. */
export function perfisDe(email: string | null | undefined): Perfil[] {
  const config = carregarConfig()
  if (!config) return []
  return config[(email ?? '').toLowerCase().trim()] ?? []
}

/**
 * Decide o acesso a uma rota — é o que o proxy consulta.
 *
 * F1: quem não tem executivo ou admin não entra em nada do Command Center,
 * inclusive nas rotas que antes eram gerais.
 */
export function podeAcessar(email: string | null | undefined, pathname: string): boolean {
  if (!ehRotaProtegida(pathname)) return true // fora do Command Center ou tela de bloqueio
  const config = carregarConfig()
  if (!config) return true // sem env → fail-open, permite o rollback operacional

  const perfis = config[(email ?? '').toLowerCase().trim()] ?? []
  return PERFIS_TOTAIS.some(total => perfis.includes(total))
}
