import Anthropic from '@anthropic-ai/sdk'
import { SAFECHAT_PERGUNTA_PROMPT } from './system-prompt'
import { buildSafechatContext } from './context'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-haiku-4-5-20251001'  // Haiku: mais rápido + barato para volume de colaboradores

function getDB() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

type Mensagem = { role: 'user' | 'assistant'; content: string }

export async function safechatResponder(
  telefone: string,
  pergunta: string,
): Promise<{ resposta: string; tokensUsados: number }> {
  const db = getDB()

  // Busca histórico da conversa (últimas 10 mensagens)
  const { data: convData } = await db
    .from('conversas_ia')
    .select('id, mensagens, tokens_usados')
    .eq('agente', 'safechat')
    .eq('canal', 'whatsapp')
    .eq('contato_id', telefone)
    .eq('status', 'ativo')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const historico: Mensagem[] = ((convData?.mensagens ?? []) as Mensagem[]).slice(-10)

  const contexto = await buildSafechatContext()

  const mensagens: Anthropic.Messages.MessageParam[] = [
    ...historico.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: SAFECHAT_PERGUNTA_PROMPT(contexto, pergunta) },
  ]

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: mensagens,
  })

  const resposta = (msg.content[0] as { type: string; text: string }).text
  const tokensUsados = msg.usage.input_tokens + msg.usage.output_tokens

  // Salva/atualiza conversa
  const novoHistorico: Mensagem[] = [
    ...historico,
    { role: 'user', content: pergunta },
    { role: 'assistant', content: resposta },
  ]

  if (convData) {
    db.from('conversas_ia').update({
      mensagens: novoHistorico,
      tokens_usados: (convData.tokens_usados ?? 0) + tokensUsados,
      updated_at: new Date().toISOString(),
    }).eq('id', convData.id).then(() => {})
  } else {
    db.from('conversas_ia').insert({
      agente: 'safechat',
      canal: 'whatsapp',
      contato_id: telefone,
      mensagens: novoHistorico,
      tokens_usados: tokensUsados,
      status: 'ativo',
    }).then(() => {})
  }

  return { resposta, tokensUsados }
}
