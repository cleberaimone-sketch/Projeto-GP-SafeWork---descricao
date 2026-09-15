// ============================================================
// LUI — WhatsApp via Z-API / Evolution API
// ============================================================

const ZAPI_BASE = process.env.ZAPI_BASE_URL
const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN
const EVOLUTION_BASE = process.env.EVOLUTION_BASE_URL
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY
const PROVIDER = process.env.WHATSAPP_PROVIDER ?? 'zapi'  // 'zapi' | 'evolution'

// ─── Registro de falha de envio ──────────────────────────────────────────────
//
// Em 14/09/2026 descobri 94 briefings gerados desde 26/05 e ZERO enviados —
// nenhum, nunca. A causa estava fora do código: a assinatura da instância do
// Z-API venceu ("you must subscribe to this instance again"). Mas o motivo de
// não ter sido notado em três meses e meio estava aqui: o erro era capturado,
// escrito no console de uma função serverless que ninguém lê, e a função
// devolvia `false`. O briefing ficava com enviado = false, indistinguível de
// "ainda não é hora de enviar", e nenhuma tela dizia nada.
//
// Toda falha de envio passa a virar uma linha em sync_log com fonte
// 'whatsapp'. É a mesma tabela que o painel de Sistema e o Carlitos já leem
// por fonte, então o problema aparece sozinho onde já se olha.

/** Espaço entre registros da MESMA falha, para não encher a tabela. */
const JANELA_DEDUPE_MS = 30 * 60_000

async function registrarFalhaEnvio(motivo: string, destino: string) {
  try {
    const { createClient: criar } = await import('@supabase/supabase-js')
    const db = criar(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

    // Instância caída faz TODA tentativa falhar, e o webhook responde a cada
    // mensagem recebida: sem dedupe, uma noite ruim enche o sync_log e esconde
    // o resto. Mensagem diferente registra na hora — é falha nova.
    const { data: ultima } = await db.from('sync_log')
      .select('iniciado_em, mensagem_erro')
      .eq('fonte', 'whatsapp').eq('status', 'erro')
      .order('iniciado_em', { ascending: false })
      .limit(1).maybeSingle()

    if (ultima?.mensagem_erro === motivo &&
        Date.now() - new Date(ultima.iniciado_em as string).getTime() < JANELA_DEDUPE_MS) {
      return
    }

    const agora = new Date().toISOString()
    await db.from('sync_log').insert({
      fonte: 'whatsapp', tipo_sync: 'envio', status: 'erro',
      registros_processados: 0, registros_erro: 1,
      mensagem_erro: motivo.slice(0, 2000),
      iniciado_em: agora, finalizado_em: agora,
      // Só os 4 últimos dígitos: identifica o destino sem guardar o número.
      metadados: { provider: PROVIDER, destino_final: destino.replace(/\D/g, '').slice(-4) },
    })
  } catch (e) {
    console.error('[WhatsApp] não consegui registrar a falha:', e)
  }
}

export async function sendWhatsAppMessage(to: string, message: string): Promise<boolean> {
  try {
    const ok = PROVIDER === 'evolution'
      ? await sendViaEvolution(to, message)
      : await sendViaZApi(to, message)
    // sendViaEvolution devolve `res.ok` sem lançar: false também é falha.
    if (!ok) await registrarFalhaEnvio('provedor respondeu sem sucesso', to)
    return ok
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err)
    console.error('[WhatsApp] Erro ao enviar:', motivo)
    await registrarFalhaEnvio(motivo, to)
    return false
  }
}

export async function sendWhatsAppAudio(to: string, audioBuffer: Buffer): Promise<boolean> {
  try {
    const ok = PROVIDER === 'evolution'
      ? await sendAudioViaEvolution(to, audioBuffer)
      : await sendAudioViaZApi(to, audioBuffer)
    if (!ok) await registrarFalhaEnvio('provedor respondeu sem sucesso (áudio)', to)
    return ok
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err)
    console.error('[WhatsApp] Erro ao enviar áudio:', motivo)
    await registrarFalhaEnvio(`áudio: ${motivo}`, to)
    return false
  }
}

async function sendAudioViaZApi(to: string, audioBuffer: Buffer): Promise<boolean> {
  if (!ZAPI_BASE) throw new Error('ZAPI_BASE_URL não configurado')

  // Z-API requer URL pública — faz upload no Supabase Storage e envia a URL
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const fileName = `lui-${Date.now()}.ogg`
  const { error: uploadError } = await sb.storage
    .from('audio-temp')
    .upload(fileName, audioBuffer, { contentType: 'audio/ogg', upsert: true })

  if (uploadError) throw new Error(`Upload Supabase falhou: ${uploadError.message}`)

  const { data: { publicUrl } } = sb.storage.from('audio-temp').getPublicUrl(fileName)

  const numero = to.replace(/\D/g, '')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (ZAPI_CLIENT_TOKEN) headers['Client-Token'] = ZAPI_CLIENT_TOKEN

  const res = await fetch(`${ZAPI_BASE}/send-audio`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ phone: numero, audio: publicUrl }),
  })

  // Remove o arquivo após 5 minutos
  setTimeout(() => {
    sb.storage.from('audio-temp').remove([fileName]).catch(() => {})
  }, 5 * 60 * 1000)

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
  chatName: string
  audioUrl?: string
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
      return { de, texto, messageId, chatName: '', audioUrl }
    }

    // Z-API payload completo
    const data = body as {
      phone?: string
      connectedPhone?: string
      chatName?: string
      text?: { message?: string }
      audio?: { audioUrl?: string; mimeType?: string; seconds?: number; ptt?: boolean }
      messageId?: string
      fromMe?: boolean
      fromApi?: boolean
      isGroup?: boolean
      isNewsletter?: boolean
    }
    if (data.isNewsletter) return null
    if (data.fromApi) return null

    let de = data.phone ?? ''
    if (de.endsWith('@lid') || de.endsWith('@s.whatsapp.net')) {
      de = data.connectedPhone ?? de
    }
    de = de.replace(/\D/g, '')

    const texto = data.text?.message ?? ''
    const audioUrl = data.audio?.audioUrl
    const messageId = data.messageId ?? ''
    const chatName = data.chatName ?? ''

    if (!de || (!texto && !audioUrl)) return null
    return { de, texto, messageId, chatName, audioUrl }
  } catch {
    return null
  }
}
