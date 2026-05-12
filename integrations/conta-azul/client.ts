// ============================================================
// Conta Azul API — Cliente HTTP
// Nova API v2: api-v2.contaazul.com/v1
// Auth: Cognito via auth.contaazul.com (refresh_token flow)
// ============================================================

import type { ContaAzulCredentials } from './types'

const BASE_URL = 'https://api-v2.contaazul.com/v1'
const TOKEN_URL = 'https://auth.contaazul.com/oauth2/token'

interface TokenCache {
  accessToken: string
  expiresAt: number
}

const tokenCache = new Map<string, TokenCache>()

// Callback opcional para persistir o novo refresh_token quando renovado
let onTokenRefreshed: ((empresaNome: string, newRefreshToken: string) => Promise<void>) | null = null

export function setTokenRefreshCallback(cb: typeof onTokenRefreshed) {
  onTokenRefreshed = cb
}

async function getAccessToken(creds: ContaAzulCredentials): Promise<string> {
  const cached = tokenCache.get(creds.empresaNome)
  if (cached && Date.now() < cached.expiresAt - 60_000) {
    return cached.accessToken
  }

  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64')
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: creds.refreshToken,
    }).toString(),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`[ContaAzul] Auth falhou para ${creds.empresaNome}: ${res.status} ${err}`)
  }

  const data = await res.json()

  tokenCache.set(creds.empresaNome, {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  })

  // Se Cognito retornou novo refresh_token (rotação habilitada), persiste
  if (data.refresh_token && data.refresh_token !== creds.refreshToken && onTokenRefreshed) {
    await onTokenRefreshed(creds.empresaNome, data.refresh_token)
  }

  return data.access_token
}

async function apiFetch<T>(
  creds: ContaAzulCredentials,
  method: 'GET' | 'POST',
  endpoint: string,
  body?: Record<string, unknown>
): Promise<T> {
  const token = await getAccessToken(creds)
  const url = `${BASE_URL}${endpoint}`

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    throw new Error(`[ContaAzul] ${method} ${endpoint} falhou: ${res.status} ${await res.text()}`)
  }

  return res.json()
}

export class ContaAzulClient {
  constructor(private creds: ContaAzulCredentials) {}

  async getContasReceber(dataInicio: string, dataFim: string) {
    return apiFetch<ContaAzulContaReceberResponse>(
      this.creds,
      'POST',
      '/financeiro/eventos-financeiros/contas-a-receber',
      { dataVencimentoInicio: dataInicio, dataVencimentoFim: dataFim }
    )
  }

  async getContasPagar(dataInicio: string, dataFim: string) {
    return apiFetch<ContaAzulContaPagarResponse>(
      this.creds,
      'POST',
      '/financeiro/eventos-financeiros/contas-a-pagar',
      { dataVencimentoInicio: dataInicio, dataVencimentoFim: dataFim }
    )
  }

  async getContasBancarias() {
    return apiFetch<ContaAzulContaBancariaResponse>(
      this.creds,
      'GET',
      '/financeiro/contas-bancarias'
    )
  }
}

// Tipos de resposta internos (a API v2 pode variar; ajustar após primeiro teste)
interface ContaAzulContaReceberResponse {
  itens?: unknown[]
  content?: unknown[]
  [key: string]: unknown
}
interface ContaAzulContaPagarResponse {
  itens?: unknown[]
  content?: unknown[]
  [key: string]: unknown
}
interface ContaAzulContaBancariaResponse {
  itens?: unknown[]
  content?: unknown[]
  [key: string]: unknown
}
