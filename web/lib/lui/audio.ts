// STT via OpenAI Whisper + TTS via OpenAI TTS

const OPENAI_API_KEY = process.env.OPENAI_API_KEY

// Transcreve áudio de uma URL para texto usando Whisper
export async function transcribeAudio(audioUrl: string): Promise<string> {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY não configurado')

  const audioRes = await fetch(audioUrl)
  if (!audioRes.ok) throw new Error(`Falha ao baixar áudio: ${audioRes.status}`)
  const audioBuffer = await audioRes.arrayBuffer()

  const formData = new FormData()
  const blob = new Blob([audioBuffer], { type: 'audio/ogg' })
  formData.append('file', blob, 'audio.ogg')
  formData.append('model', 'whisper-1')
  formData.append('language', 'pt')

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: formData,
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Whisper ${res.status}: ${err}`)
  }

  const data = await res.json() as { text: string }
  return data.text.trim()
}

// Converte texto em áudio OGG/Opus (formato nativo WhatsApp)
export async function textToSpeech(text: string): Promise<Buffer> {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY não configurado')

  // OpenAI TTS tem limite de 4096 caracteres
  const input = text.length > 4000 ? text.slice(0, 4000) + '...' : text

  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1',
      input,
      voice: 'onyx',           // voz grave/masculina, adequada ao perfil do LUI
      response_format: 'opus', // OGG+Opus = formato nativo de voz do WhatsApp
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`TTS ${res.status}: ${err}`)
  }

  return Buffer.from(await res.arrayBuffer())
}
