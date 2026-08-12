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

// Refreshes em andamento, por empresa.
//
// O sync chama getContasReceber/getContasPagar/getContasBancarias dentro de um
// Promise.all. Com o cache frio, as três caem em getAccessToken ao mesmo tempo,
// passam juntas pelo teste do cache e disparam três refresh simultâneos com o
// MESMO refresh_token. Como o Cognito rotaciona a cada uso, a primeira consome
// e invalida o token — as outras recebem invalid_grant, ou persistem um token
// que o Cognito já descartou. Em qualquer dos casos a empresa queima no run
// seguinte e exige reautorização manual.
//
// Guardando a promise em voo, as chamadas concorrentes da mesma empresa
// aguardam o mesmo refresh em vez de abrir um novo.
const refreshEmVoo = new Map<string, Promise<string>>()

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

  const emVoo = refreshEmVoo.get(creds.empresaNome)
  if (emVoo) return emVoo

  const promessa = renovarAccessToken(creds).finally(() => {
    refreshEmVoo.delete(creds.empresaNome)
  })
  refreshEmVoo.set(creds.empresaNome, promessa)
  return promessa
}

async function renovarAccessToken(creds: ContaAzulCredentials): Promise<string> {
  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64')

  // Retry com backoff para 429 (rate limit do Cognito)
  let lastErr = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, attempt * 10_000))

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

    if (res.status === 429) {
      lastErr = `429 rate limit`
      continue
    }

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
      // CRÍTICO: o Cognito JÁ rotacionou — se o token novo não for persistido,
      // a empresa queima no próximo run (invalid_grant). Retry com backoff;
      // falha definitiva vira log CRÍTICO mas não derruba o sync em andamento.
      let persistiu = false
      let ultimoErro: unknown = null
      for (let tent = 0; tent < 3 && !persistiu; tent++) {
        try {
          if (tent > 0) await new Promise(r => setTimeout(r, 1500 * tent))
          await onTokenRefreshed(creds.empresaNome, data.refresh_token)
          persistiu = true
        } catch (e) { ultimoErro = e }
      }
      if (!persistiu) {
        console.error(
          `[ContaAzul] CRÍTICO: refresh_token novo de ${creds.empresaNome} NÃO foi persistido após 3 tentativas — reautorização será necessária.`,
          ultimoErro,
        )
      }
    }

    return data.access_token
  }

  throw new Error(`[ContaAzul] Auth falhou para ${creds.empresaNome} após 3 tentativas: ${lastErr}`)
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
