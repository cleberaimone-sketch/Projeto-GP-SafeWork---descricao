// ============================================================
// POST /api/safechat/webhook
// Recebe mensagens do WhatsApp (número dedicado SafeChat)
// e responde como o SafeChat para colaboradores
//
// Configure um segundo número/instância no Z-API ou Evolution API
// apontando este webhook: https://seudominio.vercel.app/api/safechat/webhook
// ============================================================

export const maxDuration = 60
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseWebhookMessage, sendWhatsAppMessageSafechat } from '@/lib/safechat/whatsapp'
import { safechatResponder } from '@/lib/agentes/safechat/claude'

const MENSAGEM_BEM_VINDO = `👋 Olá! Sou o *SafeChat*, assistente de SST do Grupo GP SafeWork.

Posso te ajudar com:
• Dúvidas sobre seu ASO (exame médico)
• Informações sobre NRs e EPIs
• Contatos das clínicas SafeWork
• Agendamento de exames ocupacionais

Como posso ajudar? 😊`

export async function POST(req: NextRequest) {
  const body = await req.json()
  console.log('[SafeChat webhook] payload:', JSON.stringify(body))

  const parsed = parseWebhookMessage(body)
  if (!parsed) {
    console.log('[SafeChat] payload não reconhecido — ignorando')
    return NextResponse.json({ ok: true })
  }

  const { de, messageId, texto } = parsed

  if (!texto?.trim()) return NextResponse.json({ ok: true })

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Dedup de mensagens
  if (messageId) {
    const chave = `safechat_${messageId}`
    const { error } = await sb.from('webhook_dedup').insert({ message_id: chave })
    if (error) {
      console.log(`[SafeChat] messageId ${messageId} já processado`)
      return NextResponse.json({ ok: true })
    }
  }

  // Verifica se é a primeira mensagem do colaborador (bem-vindo)
  const { data: conversa } = await sb
    .from('conversas_ia')
    .select('id')
    .eq('agente', 'safechat')
    .eq('canal', 'whatsapp')
    .eq('contato_id', de)
    .maybeSingle()

  if (!conversa) {
    await sendWhatsAppMessageSafechat(de, MENSAGEM_BEM_VINDO)
    // pequena pausa para não responder imediatamente antes da boas-vindas ser entregue
    await new Promise(r => setTimeout(r, 1500))
  }

  try {
    const { resposta } = await safechatResponder(de, texto)
    await sendWhatsAppMessageSafechat(de, resposta)
    return NextResponse.json({ ok: true, messageId })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[SafeChat] Erro:', msg)
    await sendWhatsAppMessageSafechat(de,
      '⚠️ Desculpe, estou com dificuldades técnicas no momento. Por favor, entre em contato diretamente com a clínica SafeWork mais próxima.'
    )
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
