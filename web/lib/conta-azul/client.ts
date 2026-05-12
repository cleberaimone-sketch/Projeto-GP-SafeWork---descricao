// ============================================================
// Conta Azul API — Cliente HTTP
// Nova API: api-v2.contaazul.com
// Auth: Cognito via auth.contaazul.com (refresh_token flow)
// ============================================================

import type { ContaAzulCredentials } from './types'

const BASE_URL = 'https://api-v2.contaazul.com'
const TOKEN_URL = 'https://auth.contaazul.com/oauth2/token'

interface TokenCache {
  accessToken: string
  expiresAt: number
}

const tokenCache = new Map<string, TokenCache>()

// Callback para persistir novo refresh_token quando Cognito rotaciona
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

  if (data.refresh_token && data.refresh_token !== creds.refreshToken && onTokenRefreshed) {
    await onTokenRefreshed(creds.empresaNome, data.refresh_token)
  }

  return data.access_token
}

async function apiGet<T>(
  creds: ContaAzulCredentials,
  path: string,
  params: Record<string, string> = {}
): Promise<T> {
  const token = await getAccessToken(creds)
  const url = new URL(`${BASE_URL}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    throw new Error(`[ContaAzul] GET ${path} falhou: ${res.status} ${await res.text()}`)
  }

  return res.json()
}

async function fetchAllPages<T>(
  creds: ContaAzulCredentials,
  path: string,
  params: Record<string, string> = {}
): Promise<T[]> {
  const results: T[] = []
  let pagina = 1

  while (true) {
    const data = await apiGet<{ itens?: T[] }>(creds, path, {
      ...params,
      pagina: String(pagina),
      tamanho_pagina: '100',
    })

    const itens = data.itens ?? []
    results.push(...itens)
    if (itens.length < 100) break
    pagina++
  }

  return results
}

export class ContaAzulClient {
  constructor(private creds: ContaAzulCredentials) {}

  getContasReceber(dataInicio: string, dataFim: string) {
    return fetchAllPages<ContaAzulItemFinanceiro>(
      this.creds,
      '/v1/financeiro/eventos-financeiros/contas-a-receber/buscar',
      { data_vencimento_de: dataInicio, data_vencimento_ate: dataFim }
    )
  }

  getContasPagar(dataInicio: string, dataFim: string) {
    return fetchAllPages<ContaAzulItemFinanceiro>(
      this.creds,
      '/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar',
      { data_vencimento_de: dataInicio, data_vencimento_ate: dataFim }
    )
  }

  getContasBancarias() {
    return fetchAllPages<ContaAzulContaFinanceira>(
      this.creds,
      '/v1/conta-financeira',
      { apenas_ativo: 'true' }
    )
  }

  getSaldoConta(contaId: string) {
    return apiGet<{ saldo: number }>(this.creds, `/v1/conta-financeira/${contaId}/saldo-atual`)
  }
}

export interface ContaAzulItemFinanceiro {
  id: string
  status: string
  status_traduzido: string
  total: number
  pago: number
  nao_pago: number
  descricao: string
  data_vencimento: string
  data_competencia?: string
  categorias?: { id: string; nome: string }[]
  centros_de_custo?: { id: string; nome: string }[]
  cliente?: { id: string; nome: string }
  fornecedor?: { id: string; nome: string }
}

export interface ContaAzulContaFinanceira {
  id: string
  nome: string
  banco: string
  codigo_banco: number
  tipo: string
  ativo: boolean
  agencia?: string
  numero?: string
}
