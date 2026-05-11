// ============================================================
// LUI — WhatsApp via Z-API / Evolution API
// ============================================================

const ZAPI_BASE = process.env.ZAPI_BASE_URL       // ex: https://api.z-api.io/instances/XXX/token/YYY
const EVOLUTION_BASE = process.env.EVOLUTION_BASE_URL  // ex: http://localhost:8080
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY
const PROVIDER = process.env.WHATSAPP_PROVIDER ?? 'zapi'  // 'zapi' | 'evolution'

export async function sendWhatsAppMessage(to: string, message: string): Promise<boolean> {
  try {
    if (PROVIDER === 'evolution') {
      return await sendViaEvolution(to, message)
    }
    return await sendViaZApi(to, message)
  } catch (err) {
    console.error('[WhatsApp] Erro ao enviar:', err)
    return false
  }
}

async function sendViaZApi(to: string, message: string): Promise<boolean> {
  if (!ZAPI_BASE) throw new Error('ZAPI_BASE_URL não configurado')

  const numero = to.replace(/\D/g, '')
  const res = await fetch(`${ZAPI_BASE}/send-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: numero, message }),
  })

  return res.ok
}

async function sendViaEvolution(to: string, message: string): Promise<boolean> {
  if (!EVOLUTION_BASE || !EVOLUTION_INSTANCE) {
    throw new Error('EVOLUTION_BASE_URL ou EVOLUTION_INSTANCE não configurado')
  }

  const numero = to.replace(/\D/g, '')
  const res = await fetch(`${EVOLUTION_BASE}/message/sendText/${EVOLUTION_INSTANCE}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: EVOLUTION_API_KEY ?? '',
    },
    body: JSON.stringify({
      number: `${numero}@s.whatsapp.net`,
      text: message,
    }),
  })

  return res.ok
}

// Extrai número e texto de um webhook do Z-API ou Evolution
export function parseWebhookMessage(body: Record<string, unknown>, provider = PROVIDER): {
  de: string
  texto: string
  messageId: string
} | null {
  try {
    if (provider === 'evolution') {
      const data = body as {
        data?: {
          key?: { remoteJid?: string; id?: string }
          message?: { conversation?: string; extendedTextMessage?: { text?: string } }
        }
      }
      const texto =
        data.data?.message?.conversation ||
        data.data?.message?.extendedTextMessage?.text || ''
      const de = data.data?.key?.remoteJid?.replace('@s.whatsapp.net', '') ?? ''
      const messageId = data.data?.key?.id ?? ''
      if (!de || !texto) return null
      return { de, texto, messageId }
    }

    // Z-API
    const data = body as {
      phone?: string
      text?: { message?: string }
      messageId?: string
    }
    const de = data.phone ?? ''
    const texto = data.text?.message ?? ''
    const messageId = data.messageId ?? ''
    if (!de || !texto) return null
    return { de, texto, messageId }
  } catch {
    return null
  }
}
