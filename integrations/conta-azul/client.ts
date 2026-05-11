// ============================================================
// Conta Azul API — Cliente HTTP
// OAuth2 com refresh automático de token
// ============================================================

import type {
  ContaAzulCredentials,
  ContaAzulLancamento,
  ContaAzulContaReceber,
  ContaAzulContaPagar,
  ContaAzulContaBancaria,
} from './types'

const BASE_URL = 'https://api.contaazul.com/v1'
const AUTH_URL = 'https://api.contaazul.com/auth/token'

interface TokenCache {
  accessToken: string
  expiresAt: number
}

const tokenCache = new Map<string, TokenCache>()

async function getAccessToken(creds: ContaAzulCredentials): Promise<string> {
  const cached = tokenCache.get(creds.companyId)
  if (cached && Date.now() < cached.expiresAt - 60_000) {
    return cached.accessToken
  }

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
  })

  const res = await fetch(AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  if (!res.ok) {
    throw new Error(`[ContaAzul] Auth falhou para ${creds.empresaNome}: ${res.status}`)
  }

  const data = await res.json()
  tokenCache.set(creds.companyId, {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  })

  return data.access_token
}

async function fetchAll<T>(
  creds: ContaAzulCredentials,
  endpoint: string,
  params: Record<string, string> = {}
): Promise<T[]> {
  const token = await getAccessToken(creds)
  const results: T[] = []
  let page = 0
  const pageSize = 100

  while (true) {
    const url = new URL(`${BASE_URL}${endpoint}`)
    url.searchParams.set('page', String(page))
    url.searchParams.set('size', String(pageSize))
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v)
    }

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok) {
      throw new Error(`[ContaAzul] ${endpoint} falhou: ${res.status} ${await res.text()}`)
    }

    const data: T[] = await res.json()
    results.push(...data)

    if (data.length < pageSize) break
    page++
  }

  return results
}

export class ContaAzulClient {
  constructor(private creds: ContaAzulCredentials) {}

  async getContasReceber(dataInicio: string, dataFim: string) {
    return fetchAll<ContaAzulContaReceber>(this.creds, '/receivables', {
      startDueDate: dataInicio,
      endDueDate: dataFim,
    })
  }

  async getContasPagar(dataInicio: string, dataFim: string) {
    return fetchAll<ContaAzulContaPagar>(this.creds, '/payables', {
      startDueDate: dataInicio,
      endDueDate: dataFim,
    })
  }

  async getLancamentos(dataInicio: string, dataFim: string) {
    return fetchAll<ContaAzulLancamento>(this.creds, '/transactions', {
      startDate: dataInicio,
      endDate: dataFim,
    })
  }

  async getContasBancarias() {
    return fetchAll<ContaAzulContaBancaria>(this.creds, '/bank-accounts')
  }
}
