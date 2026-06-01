// ============================================================
// SafeChat — WhatsApp para o número dedicado dos colaboradores
//
// Usa as mesmas variáveis de Z-API/Evolution do LUI por padrão,
// mas pode usar uma instância separada via SAFECHAT_INSTANCE_ID.
//
// Vars de ambiente (opcional — se não definidas, usa as do LUI):
//   SAFECHAT_ZAPI_INSTANCE_ID  → instância Z-API dedicada SafeChat
//   SAFECHAT_EVOLUTION_INSTANCE → instância Evolution dedicada SafeChat
// ============================================================

import { parseWebhookMessage as luiParse } from '@/lib/lui/whatsapp'

const ZAPI_BASE       = process.env.ZAPI_BASE_URL
const ZAPI_TOKEN      = process.env.ZAPI_CLIENT_TOKEN
const ZAPI_INSTANCE   = process.env.SAFECHAT_ZAPI_INSTANCE_ID ?? process.env.ZAPI_INSTANCE_ID

const EVOLUTION_BASE     = process.env.EVOLUTION_BASE_URL
const EVOLUTION_API_KEY  = process.env.EVOLUTION_API_KEY
const EVOLUTION_INSTANCE = process.env.SAFECHAT_EVOLUTION_INSTANCE ?? process.env.EVOLUTION_INSTANCE

const PROVIDER = process.env.WHATSAPP_PROVIDER ?? 'zapi'

// Reutiliza o mesmo parser do LUI — formato de payload é idêntico
export { luiParse as parseWebhookMessage }

export async function sendWhatsAppMessageSafechat(to: string, message: string): Promise<boolean> {
  try {
    if (PROVIDER === 'evolution') {
      return await sendViaEvolution(to, message)
    }
    return await sendViaZApi(to, message)
  } catch (err) {
    console.error('[SafeChat WhatsApp] Erro ao enviar:', err)
    return false
  }
}

async function sendViaZApi(to: string, message: string): Promise<boolean> {
  if (!ZAPI_BASE || !ZAPI_INSTANCE || !ZAPI_TOKEN) {
    console.warn('[SafeChat] Z-API não configurado — mensagem não enviada')
    return false
  }
  const url = `${ZAPI_BASE}/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-text`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: to, message }),
  })
  return res.ok
}

async function sendViaEvolution(to: string, message: string): Promise<boolean> {
  if (!EVOLUTION_BASE || !EVOLUTION_INSTANCE || !EVOLUTION_API_KEY) {
    console.warn('[SafeChat] Evolution API não configurada — mensagem não enviada')
    return false
  }
  const url = `${EVOLUTION_BASE}/message/sendText/${EVOLUTION_INSTANCE}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_KEY },
    body: JSON.stringify({ number: to, text: message }),
  })
  return res.ok
}
