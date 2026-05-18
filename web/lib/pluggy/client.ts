// Cliente Pluggy / Open Finance
// Docs: https://docs.pluggy.ai
//
// Fluxo:
//   1. Backend autentica via clientId/clientSecret → recebe apiKey (válido 2h)
//   2. Backend gera connectToken para o widget abrir no browser
//   3. Usuário conecta no widget → callback retorna itemId
//   4. Backend salva itemId + busca accounts + grava no Supabase
//   5. Periodicamente: refresh dos saldos via getItem/getAccounts

const BASE_URL = 'https://api.pluggy.ai'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type PluggyItem = {
  id: string
  connector: {
    id: number
    name: string
    imageUrl?: string
    institutionUrl?: string
    primaryColor?: string
  }
  status: 'UPDATED' | 'UPDATING' | 'LOGIN_ERROR' | 'OUTDATED' | 'WAITING_USER_INPUT' | 'CREATED'
  executionStatus?: string
  statusDetail?: Record<string, unknown>
  lastUpdatedAt?: string
  createdAt: string
  updatedAt?: string
}

export type PluggyAccount = {
  id: string
  type: 'BANK' | 'CREDIT'
  subtype: 'CHECKING_ACCOUNT' | 'SAVINGS_ACCOUNT' | 'CREDIT_CARD'
  number?: string
  agency?: string
  marketingName?: string
  taxNumber?: string
  owner?: string
  name?: string
  balance: number
  bankData?: {
    transferNumber?: string
    closingBalance?: number
  }
  creditData?: {
    level?: string
    brand?: string
    creditLimit?: number
    availableCreditLimit?: number
  }
  currencyCode: string
  itemId: string
}

export type ConnectTokenResponse = {
  accessToken: string
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

let _apiKey: string | null = null
let _apiKeyExpiresAt = 0
const API_KEY_TTL_MS = 110 * 60_000  // 110 min (Pluggy expira em 2h)

function pluggyConfigurado(): boolean {
  return !!(process.env.PLUGGY_CLIENT_ID && process.env.PLUGGY_CLIENT_SECRET)
}

export { pluggyConfigurado }

async function getApiKey(): Promise<string> {
  if (!pluggyConfigurado()) {
    throw new Error('Pluggy não configurado: defina PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET')
  }

  if (_apiKey && Date.now() < _apiKeyExpiresAt) return _apiKey

  const res = await fetch(`${BASE_URL}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: process.env.PLUGGY_CLIENT_ID,
      clientSecret: process.env.PLUGGY_CLIENT_SECRET,
    }),
  })

  if (!res.ok) {
    const erro = await res.text()
    throw new Error(`Pluggy auth falhou (${res.status}): ${erro}`)
  }

  const data = await res.json() as { apiKey: string }
  _apiKey = data.apiKey
  _apiKeyExpiresAt = Date.now() + API_KEY_TTL_MS
  return _apiKey
}

// ─── Helper genérico ──────────────────────────────────────────────────────────

async function pluggyFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const apiKey = await getApiKey()
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey,
    },
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Pluggy ${path} falhou (${res.status}): ${txt}`)
  }

  return await res.json() as T
}

// ─── Connect Token (para o widget) ────────────────────────────────────────────

export async function criarConnectToken(itemId?: string): Promise<ConnectTokenResponse> {
  const body: Record<string, unknown> = {}
  if (itemId) body.itemId = itemId
  body.options = { clientUserId: 'gp-safework' }

  return await pluggyFetch<ConnectTokenResponse>('/connect_token', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

// ─── Items ────────────────────────────────────────────────────────────────────

export async function getItem(itemId: string): Promise<PluggyItem> {
  return await pluggyFetch<PluggyItem>(`/items/${itemId}`)
}

export async function deleteItem(itemId: string): Promise<void> {
  await pluggyFetch(`/items/${itemId}`, { method: 'DELETE' })
}

// Força atualização dos saldos/transações (re-sincroniza com banco)
export async function updateItem(itemId: string): Promise<PluggyItem> {
  return await pluggyFetch<PluggyItem>(`/items/${itemId}`, { method: 'PATCH' })
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

export async function getAccounts(itemId: string): Promise<PluggyAccount[]> {
  const res = await pluggyFetch<{ results: PluggyAccount[] }>(`/accounts?itemId=${itemId}`)
  return res.results
}

// ─── Helpers de exibição ──────────────────────────────────────────────────────

export function nomeExibicaoConta(acc: PluggyAccount, instituicaoNome?: string): string {
  const banco = instituicaoNome ?? acc.marketingName ?? acc.creditData?.brand ?? '?'
  const numero = acc.number ?? '?'
  return `${banco} · ${numero}`
}
