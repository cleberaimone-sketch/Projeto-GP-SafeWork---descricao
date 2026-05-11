// ============================================================
// POST /api/lui/webhook
// Recebe mensagens do WhatsApp (Z-API ou Evolution API)
// e responde como o LUI
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseWebhookMessage, sendWhatsAppMessage } from '@/../../integrations/lui/whatsapp'
import { buildQueryContext } from '@/../../integrations/lui/context'
import { responderPergunta, type Mensagem } from '@/../../integrations/lui/claude'

const CLEBER_WHATSAPP = process.env.CLEBER_WHATSAPP_NUMBER?.replace(/\D/g, '')

export async function POST(req: NextRequest) {
  const body = await req.json()

  const parsed = parseWebhookMessage(body)
  if (!parsed) return NextResponse.json({ ok: true })

  const { de, texto, messageId } = parsed
  const numeroLimpo = de.replace(/\D/g, '')

  // Só responde ao Cleber
  if (CLEBER_WHATSAPP && numeroLimpo !== CLEBER_WHATSAPP) {
    console.log(`[LUI] Ignorando mensagem de ${numeroLimpo} (não é o Cleber)`)
    return NextResponse.json({ ok: true })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Busca ou cria conversa ativa
  const { data: conversaExistente } = await supabase
    .from('conversas_ia')
    .select('id, mensagens')
    .eq('agente', 'LUI')
    .eq('canal', 'whatsapp')
    .eq('contato_id', de)
    .eq('status', 'ativo')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

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
          tokens_usados: (conversaExistente as { tokens_usados?: number }).tokens_usados ?? 0 + tokensUsados,
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

    // Envia resposta
    await sendWhatsAppMessage(de, resposta)

    return NextResponse.json({ ok: true, messageId })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[LUI] Erro no webhook:', msg)
    await sendWhatsAppMessage(de, '⚠️ Erro interno. Tente novamente em instantes.')
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
