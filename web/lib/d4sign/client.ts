// ============================================================
// D4sign — cliente REST para assinatura digital de contratos
//
// Vars de ambiente necessárias:
//   D4SIGN_TOKEN_API  → token de acesso da conta D4sign
//   D4SIGN_CRYPT_KEY  → chave de criptografia da conta
//   D4SIGN_BASE_URL   → (opcional) padrão: https://secure.d4sign.com.br/api/v1
//
// Status dos documentos:
//   1 = Processando | 2 = Aguardando assinaturas | 3 = Assinado
//   4 = Cancelado   | 7 = Recusado
// ============================================================

const BASE   = process.env.D4SIGN_BASE_URL ?? 'https://secure.d4sign.com.br/api/v1'
const TOKEN  = process.env.D4SIGN_TOKEN_API
const CRYPT  = process.env.D4SIGN_CRYPT_KEY

export const STATUS_D4SIGN: Record<string, string> = {
  '1': 'Processando',
  '2': 'Aguardando assinaturas',
  '3': 'Assinado',
  '4': 'Cancelado',
  '7': 'Recusado',
}

export interface DocumentoD4sign {
  uuidDoc: string
  nameDoc: string
  statusId: string
  statusName: string
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

export interface D4signWebhookPayload {
  uuid_document: string
  type_post: string
  uuid_signatary?: string
  email?: string
}

export function d4signConfigurado(): boolean {
  return !!(TOKEN && CRYPT)
}

async function req<T>(path: string): Promise<T> {
  if (!TOKEN || !CRYPT) throw new Error('D4sign não configurado')
  const url = `${BASE}${path}?tokenAPI=${encodeURIComponent(TOKEN)}&cryptKey=${encodeURIComponent(CRYPT)}`
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    next: { revalidate: 0 },
  })
  if (!res.ok) throw new Error(`D4sign HTTP ${res.status}: ${path}`)
  return res.json() as Promise<T>
}

// Lista documentos paginada (página 1 = mais recentes, ~50 por página)
export async function listarDocumentos(page = 1): Promise<DocumentoD4sign[]> {
  const data = await req<DocumentoD4sign[] | { documents?: DocumentoD4sign[] }>(`/documents/list/${page}`)
  if (Array.isArray(data)) return data
  return (data as { documents?: DocumentoD4sign[] }).documents ?? []
}

// Documentos aguardando assinatura (statusId = "2")
export async function documentosAguardando(): Promise<DocumentoD4sign[]> {
  const docs = await listarDocumentos()
  return docs.filter(d => d.statusId === '2')
}

// Documentos aguardando há mais de N dias (para alertas de abandono)
export async function documentosParados(diasMin = 7): Promise<DocumentoD4sign[]> {
  const docs = await documentosAguardando()
  const corte = Date.now() - diasMin * 86_400_000
  return docs.filter(d => {
    if (!d.created_at) return false
    return new Date(d.created_at).getTime() < corte
  })
}

// Parse do webhook D4sign (POST que D4sign envia ao nosso endpoint)
export function parseWebhookD4sign(body: unknown): D4signWebhookPayload | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  if (!b.uuid_document || !b.type_post) return null
  return {
    uuid_document: String(b.uuid_document),
    type_post:     String(b.type_post),
    uuid_signatary: b.uuid_signatary ? String(b.uuid_signatary) : undefined,
    email:          b.email          ? String(b.email)          : undefined,
  }
}
