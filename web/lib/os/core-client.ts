// ============================================================
// GP OS Core — cliente de leitura
//
// Consome a API do GP OS Core (https://gp-os-core.vercel.app).
// Token de leitura via env var CORE_READ_TOKEN.
// Usado para sincronizar eventos do ecossistema para o local.
// ============================================================

const CORE_URL        = process.env.CORE_URL         ?? 'https://gp-os-core.vercel.app'
const CORE_READ_TOKEN = process.env.CORE_READ_TOKEN

export function coreConfigurado(): boolean {
  return !!CORE_READ_TOKEN
}

// ── Tipos da API do Core ──────────────────────────────────────────────────────

export interface CoreEventoMeta {
  lead_id?:       string
  actor_id?:      string
  actor_type?:    string
  company_id?:    string
  source_module?: string
  amount?:        number | null
}

export interface CoreEvento {
  id:              string
  event_id:        string   // chave de idempotência
  event_type:      string
  source:          string
  schema_version:  string
  occurred_at:     string
  received_at:     string
  payload:         { _meta?: CoreEventoMeta } & Record<string, unknown>
  status:          'received' | 'processed' | 'error'
  correlation_id:  string | null
  created_at:      string
  updated_at:      string
}

interface CorePagination {
  count:    number
  limit:    number
  offset:   number
  has_more: boolean
}

interface CoreEventosResponse {
  ok:   boolean
  data: { events: CoreEvento[]; pagination: CorePagination }
}

interface CoreHealthResponse {
  ok:   boolean
  data: { service: string; version: string; status: string; latency_ms: number }
}

// ── Funções públicas ──────────────────────────────────────────────────────────

export async function coreHealth(): Promise<{ ok: boolean; latency_ms: number } | null> {
  try {
    const res = await fetch(`${CORE_URL}/api/health`, { cache: 'no-store' })
    if (!res.ok) return null
    const json: CoreHealthResponse = await res.json()
    return { ok: json.data?.status === 'healthy', latency_ms: json.data?.latency_ms ?? -1 }
  } catch {
    return null
  }
}

export async function getCoreEventos(params?: {
  limit?:      number
  offset?:     number
  event_type?: string
  source?:     string
}): Promise<CoreEvento[]> {
  if (!coreConfigurado()) return []

  try {
    const url = new URL(`${CORE_URL}/api/events`)
    if (params?.limit)      url.searchParams.set('limit',      String(params.limit))
    if (params?.offset)     url.searchParams.set('offset',     String(params.offset))
    if (params?.event_type) url.searchParams.set('event_type', params.event_type)
    if (params?.source)     url.searchParams.set('source',     params.source)

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${CORE_READ_TOKEN}` },
      next: { revalidate: 30 },
    })

    if (!res.ok) {
      console.error(`[core-client] GET /api/events falhou: ${res.status}`)
      return []
    }

    const json: CoreEventosResponse = await res.json()
    return json.data?.events ?? []
  } catch (err) {
    console.error('[core-client] Exceção:', err)
    return []
  }
}

// Normaliza CoreEvento → formato compatível com OsEvento local
export function normalizarEvento(ev: CoreEvento) {
  return {
    core_event_id: ev.event_id,
    tipo:          ev.event_type,
    origem:        ev.source,
    payload:       ev.payload,
    processado:    ev.status === 'processed',
    created_at:    ev.occurred_at ?? ev.created_at,
  }
}
