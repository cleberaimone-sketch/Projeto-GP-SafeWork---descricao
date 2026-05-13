// ============================================================
// POST /api/lui/webhook
// Recebe mensagens do WhatsApp (Z-API ou Evolution API)
// e responde como o LUI
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseWebhookMessage, sendWhatsAppMessage, sendWhatsAppAudio } from '@/lib/lui/whatsapp'
import { transcribeAudio, textToSpeech } from '@/lib/lui/audio'
import { buildQueryContext } from '@/lib/lui/context'
import { responderPergunta, type Mensagem } from '@/lib/lui/claude'

const CLEBER_WHATSAPP = process.env.CLEBER_WHATSAPP_NUMBER?.replace(/\D/g, '')

export async function POST(req: NextRequest) {
  const body = await req.json()

  // Log completo para debug
  console.log('[LUI webhook] payload:', JSON.stringify(body))

  const parsed = parseWebhookMessage(body)
  if (!parsed) {
    console.log('[LUI webhook] payload não reconhecido — ignorando')
    return NextResponse.json({ ok: true })
  }

  const { de, messageId, audioUrl } = parsed
  let { texto } = parsed
  const isAudio = !!audioUrl
  const numeroLimpo = de.replace(/\D/g, '')
  console.log(`[LUI webhook] de=${numeroLimpo} isAudio=${isAudio} texto="${texto.slice(0, 80)}"`)

  const fromApi = (body as { fromApi?: boolean }).fromApi
  if (fromApi) return NextResponse.json({ ok: true })

  // Transcreve áudio antes de processar
  if (isAudio && audioUrl) {
    try {
      texto = await transcribeAudio(audioUrl)
      console.log(`[LUI] Áudio transcrito: "${texto.slice(0, 80)}"`)
    } catch (err) {
      console.error('[LUI] Falha na transcrição Whisper:', err)
      await sendWhatsAppMessage(de, '⚠️ Não consegui entender o áudio. Pode escrever?')
      return NextResponse.json({ ok: true })
    }
  }

  if (!texto.trim()) return NextResponse.json({ ok: true })

  // Só responde ao Cleber — compara últimos 8 dígitos (tolera formato 12/13 e extra-9 BR)
  if (CLEBER_WHATSAPP) {
    const sufixoEnviado = numeroLimpo.slice(-8)
    const sufixoCleber = CLEBER_WHATSAPP.slice(-8)
    if (sufixoEnviado !== sufixoCleber) {
      console.log(`[LUI] Ignorando ${numeroLimpo} (não é o Cleber: ...${sufixoEnviado} !== ...${sufixoCleber})`)
      return NextResponse.json({ ok: true })
    }
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Busca ou cria conversa ativa (.single() omitido — throw se vazio)
  const { data: conversas } = await supabase
    .from('conversas_ia')
    .select('id, mensagens, tokens_usados')
    .eq('agente', 'LUI')
    .eq('canal', 'whatsapp')
    .eq('contato_id', de)
    .eq('status', 'ativo')
    .order('created_at', { ascending: false })
    .limit(1)

  const conversaExistente = conversas?.[0] ?? null
  const historico: Mensagem[] = (conversaExistente?.mensagens as Mensagem[]) ?? []

  try {
    // Coleta contexto relevante à pergunta
    const contexto = await buildQueryContext(texto)

    // Gera resposta com o LUI
    const { resposta, tokensUsados } = await responderPergunta(texto, contexto, historico)

    // Atualiza histórico
    const novoHistorico: Mensagem[] = [
      ...historico,
      { role: 'user', content: texto },
      { role: 'assistant', content: resposta },
    ]

    // Salva/atualiza conversa
    if (conversaExistente) {
      await supabase
        .from('conversas_ia')
        .update({
          mensagens: novoHistorico,
          tokens_usados: (conversaExistente.tokens_usados ?? 0) + tokensUsados,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversaExistente.id)
    } else {
      await supabase.from('conversas_ia').insert({
        agente: 'LUI',
        canal: 'whatsapp',
        contato_nome: 'Cleber',
        contato_id: de,
        mensagens: novoHistorico,
        tokens_usados: tokensUsados,
        status: 'ativo',
      })
    }

    // Envia resposta — áudio se o usuário enviou áudio, texto caso contrário
    if (isAudio) {
      try {
        const audioBuffer = await textToSpeech(resposta)
        await sendWhatsAppAudio(de, audioBuffer)
      } catch (ttsErr) {
        console.error('[LUI] Falha no TTS, enviando texto como fallback:', ttsErr)
        await sendWhatsAppMessage(de, resposta)
      }
    } else {
      await sendWhatsAppMessage(de, resposta)
    }

    return NextResponse.json({ ok: true, messageId })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[LUI] Erro no webhook:', msg)
    await sendWhatsAppMessage(de, '⚠️ Erro interno. Tente novamente em instantes.')
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
