// ============================================================
// LUI — WhatsApp via Z-API / Evolution API
// ============================================================

const ZAPI_BASE = process.env.ZAPI_BASE_URL
const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN
const EVOLUTION_BASE = process.env.EVOLUTION_BASE_URL
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

export async function sendWhatsAppAudio(to: string, audioBuffer: Buffer): Promise<boolean> {
  try {
    if (PROVIDER === 'evolution') {
      return await sendAudioViaEvolution(to, audioBuffer)
    }
    return await sendAudioViaZApi(to, audioBuffer)
  } catch (err) {
    console.error('[WhatsApp] Erro ao enviar áudio:', err)
    return false
  }
}

async function sendAudioViaZApi(to: string, audioBuffer: Buffer): Promise<boolean> {
  if (!ZAPI_BASE) throw new Error('ZAPI_BASE_URL não configurado')

  const numero = to.replace(/\D/g, '')
  const base64 = audioBuffer.toString('base64')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (ZAPI_CLIENT_TOKEN) headers['Client-Token'] = ZAPI_CLIENT_TOKEN

  const res = await fetch(`${ZAPI_BASE}/send-audio`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ phone: numero, audio: base64 }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Z-API send-audio falhou ${res.status}: ${body}`)
  }
  return true
}

async function sendAudioViaEvolution(to: string, audioBuffer: Buffer): Promise<boolean> {
  if (!EVOLUTION_BASE || !EVOLUTION_INSTANCE) {
    throw new Error('EVOLUTION_BASE_URL ou EVOLUTION_INSTANCE não configurado')
  }

  const numero = to.replace(/\D/g, '')
  const base64 = audioBuffer.toString('base64')

  const res = await fetch(`${EVOLUTION_BASE}/message/sendWhatsAppAudio/${EVOLUTION_INSTANCE}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: EVOLUTION_API_KEY ?? '',
    },
    body: JSON.stringify({
      number: `${numero}@s.whatsapp.net`,
      encoding: true,
      audio: base64,
    }),
  })

  return res.ok
}

async function sendViaZApi(to: string, message: string): Promise<boolean> {
  if (!ZAPI_BASE) throw new Error('ZAPI_BASE_URL não configurado')

  const numero = to.replace(/\D/g, '')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (ZAPI_CLIENT_TOKEN) headers['Client-Token'] = ZAPI_CLIENT_TOKEN

  const res = await fetch(`${ZAPI_BASE}/send-text`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ phone: numero, message }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Z-API send-text falhou ${res.status}: ${body}`)
  }

  return true
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

// Extrai número, texto e (se for áudio) URL do áudio de um webhook do Z-API ou Evolution
export function parseWebhookMessage(body: Record<string, unknown>, provider = PROVIDER): {
  de: string
  texto: string
  messageId: string
  audioUrl?: string  // presente quando a mensagem é um áudio/voz
} | null {
  try {
    if (provider === 'evolution') {
      // Evolution API v2: { event, instance, data: { key, message, ... } }
      const data = body as {
        data?: {
          key?: { remoteJid?: string; id?: string; fromMe?: boolean }
          message?: {
            conversation?: string
            extendedTextMessage?: { text?: string }
            audioMessage?: { url?: string; mimetype?: string }
          }
        }
      }
      if (data.data?.key?.fromMe) return null

      const audioMsg = data.data?.message?.audioMessage
      const audioUrl = audioMsg?.url

      const texto =
        data.data?.message?.conversation ||
        data.data?.message?.extendedTextMessage?.text || ''
      const de = (data.data?.key?.remoteJid ?? '').replace('@s.whatsapp.net', '')
      const messageId = data.data?.key?.id ?? ''

      // Precisa ter remetente e (texto ou áudio)
      if (!de || (!texto && !audioUrl)) return null
      return { de, texto, messageId, audioUrl }
    }

    // Z-API payload completo
    const data = body as {
      phone?: string
      connectedPhone?: string
      text?: { message?: string }
      audio?: { audioUrl?: string; mimeType?: string; seconds?: number }
      messageId?: string
      fromMe?: boolean
      fromApi?: boolean
      isGroup?: boolean
      isNewsletter?: boolean
    }
    if (data.isGroup || data.isNewsletter) return null
    if (data.fromApi) return null

    let de = data.phone ?? ''
    if (de.endsWith('@lid') || de.endsWith('@s.whatsapp.net')) {
      de = data.connectedPhone ?? de
    }
    de = de.replace(/\D/g, '')

    const texto = data.text?.message ?? ''
    const audioUrl = data.audio?.audioUrl
    const messageId = data.messageId ?? ''

    if (!de || (!texto && !audioUrl)) return null
    return { de, texto, messageId, audioUrl }
  } catch {
    return null
  }
}
