// ============================================================
// GP OS Core v0 — SDK do Command Center
//
// Baseado na spec oficial do GP OS Core (INTEGRACAO_GP_OS_CORE_API.md).
// Escopo: read + ack (token CORE_READ_TOKEN).
// ============================================================

const CORE_URL        = process.env.CORE_URL         ?? 'https://gp-os-core.vercel.app'
const CORE_READ_TOKEN = process.env.CORE_READ_TOKEN

export function coreConfigurado(): boolean {
  return !!CORE_READ_TOKEN
}

// ── Tipos canônicos do Core ────────────────────────────────────────────────────

export type CoreEventType =
  | 'lead_criado'               | 'lead_qualificado'
  | 'proposta_gerada'           | 'venda_fechada'
  | 'pagamento_confirmado'      | 'intervencao_humana_criada'
  | 'followup_agendado'         | 'lead_recuperado'
  | 'lead_perdido'              | 'cliente_criado'
  | 'contrato_gerado'           | 'contrato_assinado'
  | 'alerta_critico'

export interface CoreEvento {
  id:             string        // UUID interno do Core (usado no ack)
  event_id:       string        // chave de idempotência da origem
  event_type:     CoreEventType
  source:         string
  schema_version: string
  occurred_at:    string
  received_at:    string
  payload:        Record<string, unknown>
  status:         'received' | 'processed' | 'failed' | 'ignored'
  correlation_id: string | null
  created_at:     string
  updated_at:     string
}

export interface ListEventsParams {
  event_type?:    CoreEventType
  source?:        string
  status?:        string
  correlation_id?: string
  since?:         string   // ISO-8601 — retorna received_at > since (cursor incremental)
  limit?:         number
  offset?:        number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function coreRequest<T>(
  path: string,
  init: { method: string; body?: string; skipAuth?: boolean },
  maxRetries = 3,
  retryBaseMs = 300,
): Promise<T> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 10_000)
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (!init.skipAuth) headers['Authorization'] = `Bearer ${CORE_READ_TOKEN}`
      const res = await fetch(`${CORE_URL}${path}`, {
        method: init.method,
        headers,
        ...(init.body ? { body: init.body } : {}),
        signal: ctrl.signal,
      })
      const text = await res.text()
      const json = text ? JSON.parse(text) : null
      if (res.ok) return json as T
      // Não retentar em erros do cliente
      if (res.status < 500 && res.status !== 429) {
        throw new Error(`Core HTTP ${res.status} em ${path}: ${text}`)
      }
      lastErr = new Error(`Core HTTP ${res.status} em ${path}`)
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Core HTTP 4')) throw err
      lastErr = err
    } finally { clearTimeout(timer) }
    if (attempt < maxRetries) {
      const backoff = retryBaseMs * 2 ** (attempt - 1)
      await sleep(backoff + Math.floor(Math.random() * retryBaseMs))
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`Falha após ${maxRetries} tentativas em ${path}`)
}

// ── API pública ───────────────────────────────────────────────────────────────

export async function coreHealth(): Promise<{ ok: boolean; latency_ms: number } | null> {
  try {
    const res = await coreRequest<{ ok: boolean; data: { status: string; latency_ms: number } }>(
      '/api/health', { method: 'GET', skipAuth: true }
    )
    return { ok: res.data?.status === 'healthy', latency_ms: res.data?.latency_ms ?? -1 }
  } catch { return null }
}

export async function getCoreEventos(params: ListEventsParams = {}): Promise<{
  events: CoreEvento[]
  pagination: { count: number; limit: number; offset: number; has_more: boolean }
}> {
  if (!coreConfigurado()) return { events: [], pagination: { count: 0, limit: 50, offset: 0, has_more: false } }

  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v != null) qs.set(k, String(v))
  }
  const path = `/api/events${qs.toString() ? `?${qs}` : ''}`

  const res = await coreRequest<{
    ok: boolean
    data: {
      events: CoreEvento[]
      pagination: { count: number; limit: number; offset: number; has_more: boolean }
    }
  }>(path, { method: 'GET' })

  return res.data ?? { events: [], pagination: { count: 0, limit: 50, offset: 0, has_more: false } }
}

// Confirma consumo de um batch de eventos (pelos IDs internos do Core)
export async function acknowledgeCoreEventos(eventIds: string[]): Promise<number> {
  if (!coreConfigurado() || eventIds.length === 0) return 0
  try {
    const res = await coreRequest<{ ok: boolean; data: { acknowledged: number } }>(
      '/api/events/ack',
      { method: 'POST', body: JSON.stringify({ consumer: 'command_center', event_ids: eventIds }) }
    )
    return res.data?.acknowledged ?? 0
  } catch (err) {
    console.error('[core-client] ack falhou:', err)
    return 0
  }
}

// Normaliza CoreEvento → formato compatível com os_eventos local
export function normalizarEvento(ev: CoreEvento) {
  return {
    core_internal_id: ev.id,
    tipo:             ev.event_type,
    origem:           ev.source,
    payload:          { ...ev.payload, _core_event_id: ev.event_id, _core_id: ev.id },
    processado:       ev.status === 'processed',
    created_at:       ev.occurred_at ?? ev.received_at ?? ev.created_at,
  }
}
