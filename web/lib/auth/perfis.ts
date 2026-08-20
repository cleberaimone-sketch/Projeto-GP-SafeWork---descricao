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

/**
 * Estado da configuração de acesso.
 *
 * Os três casos precisam ser distintos porque significam coisas diferentes:
 * `ausente` é decisão deliberada (o rollback operacional), `invalida` é
 * acidente. Tratar os dois como "sem restrição" era o que fazia um typo no JSON
 * abrir o Command Center inteiro em silêncio.
 */
type EstadoConfig =
  | { modo: 'ausente' }
  | { modo: 'valida'; mapa: Record<string, Perfil[]> }
  | { modo: 'invalida'; motivo: string }

/**
 * Valida a FORMA, não só a sintaxe.
 *
 * `{"executivo":["cleber@x.com"]}` é JSON perfeitamente válido — e é o formato
 * invertido, que ativa a restrição e bloqueia todo mundo. Como as duas formas
 * são `Record<string, string[]>`, o que as separa é a chave: aqui ela é sempre
 * um e-mail. Chave sem "@" reprova o arquivo.
 */
function validarForma(obj: unknown): { ok: true; mapa: Record<string, Perfil[]> } | { ok: false; motivo: string } {
  if (obj === null || typeof obj !== 'object') {
    return { ok: false, motivo: 'o conteúdo não é um objeto' }
  }
  if (Array.isArray(obj)) {
    return { ok: false, motivo: 'o conteúdo é um array, e deveria ser um objeto e-mail → perfis' }
  }

  const mapa: Record<string, Perfil[]> = {}
  for (const [chave, valor] of Object.entries(obj as Record<string, unknown>)) {
    const email = chave.toLowerCase().trim()
    if (!email.includes('@')) {
      // Pega o formato invertido: a chave seria um perfil, não um e-mail.
      return { ok: false, motivo: `a chave "${chave}" não é um e-mail (formato invertido?)` }
    }
    if (!Array.isArray(valor) || valor.some(v => typeof v !== 'string')) {
      return { ok: false, motivo: `o valor de "${chave}" não é uma lista de perfis` }
    }
    mapa[email] = valor as Perfil[]
  }
  return { ok: true, mapa }
}

function carregarConfig(): EstadoConfig {
  const raw = process.env.ACESSO_PERFIS_JSON
  // Ausente, vazia ou só espaços: mesma coisa — é o rollback operacional.
  if (!raw || !raw.trim()) return { modo: 'ausente' }

  let bruto: unknown
  try {
    bruto = JSON.parse(raw)
  } catch {
    // O motivo não carrega o conteúdo da env, que pode ter e-mails.
    console.error('[perfis] ACESSO_PERFIS_JSON não é JSON válido — acesso BLOQUEADO até correção')
    return { modo: 'invalida', motivo: 'não é JSON válido' }
  }

  const forma = validarForma(bruto)
  if (!forma.ok) {
    console.error(`[perfis] ACESSO_PERFIS_JSON com formato inesperado (${forma.motivo}) — acesso BLOQUEADO até correção`)
    return { modo: 'invalida', motivo: forma.motivo }
  }

  return { modo: 'valida', mapa: forma.mapa }
}

/** O RBAC está aplicando restrições? (falso = fail-open por env ausente) */
export function rbacAtivo(): boolean {
  return carregarConfig().modo !== 'ausente'
}

/**
 * A env existe mas está quebrada?
 *
 * O proxy usa isto para diferenciar a mensagem: "você não tem permissão" manda o
 * administrador procurar no lugar errado quando o problema é configuração.
 */
export function configInvalida(): boolean {
  return carregarConfig().modo === 'invalida'
}

/** Perfis configurados para um e-mail. Vazio se não estiver no JSON. */
export function perfisDe(email: string | null | undefined): Perfil[] {
  const estado = carregarConfig()
  if (estado.modo !== 'valida') return []
  return estado.mapa[(email ?? '').toLowerCase().trim()] ?? []
}

/**
 * Decide o acesso a uma rota — é o que o proxy consulta.
 *
 * F1: quem não tem executivo ou admin não entra em nada do Command Center.
 * H5: configuração quebrada bloqueia todos, inclusive quem teria acesso — falhar
 * fechado e visível é melhor que abrir tudo em silêncio.
 */
export function podeAcessar(email: string | null | undefined, pathname: string): boolean {
  if (!ehRotaProtegida(pathname)) return true // fora do Command Center ou tela de bloqueio

  const estado = carregarConfig()
  if (estado.modo === 'ausente') return true   // rollback operacional
  if (estado.modo === 'invalida') return false // H5: fail-closed

  const perfis = estado.mapa[(email ?? '').toLowerCase().trim()] ?? []
  return PERFIS_TOTAIS.some(total => perfis.includes(total))
}
