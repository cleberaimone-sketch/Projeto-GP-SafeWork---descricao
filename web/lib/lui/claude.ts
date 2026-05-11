// ============================================================
// LUI — Chamadas ao Claude API (Anthropic)
// ============================================================

import Anthropic from '@anthropic-ai/sdk'
import { LUI_SYSTEM_PROMPT, LUI_BRIEFING_PROMPT } from './system-prompt'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const MODEL = 'claude-sonnet-4-6'

export interface Mensagem {
  role: 'user' | 'assistant'
  content: string
}

// Gera o briefing diário
export async function gerarBriefing(contexto: string): Promise<string> {
  const dataHoje = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: LUI_BRIEFING_PROMPT(contexto, dataHoje),
    messages: [{ role: 'user', content: 'Gere o briefing de hoje.' }],
  })

  return (msg.content[0] as { type: string; text: string }).text
}

// Responde uma pergunta interativa do Cleber
export async function responderPergunta(
  pergunta: string,
  contexto: string,
  historico: Mensagem[] = []
): Promise<{ resposta: string; tokensUsados: number }> {
  const mensagens: Anthropic.Messages.MessageParam[] = [
    // Histórico da conversa (últimas 10 mensagens)
    ...historico.slice(-10).map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    // Mensagem atual com contexto injetado
    {
      role: 'user',
      content: `Contexto atual do negócio:\n\`\`\`json\n${contexto}\n\`\`\`\n\nPergunta: ${pergunta}`,
    },
  ]

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: LUI_SYSTEM_PROMPT,
    messages: mensagens,
  })

  const resposta = (msg.content[0] as { type: string; text: string }).text
  const tokensUsados = msg.usage.input_tokens + msg.usage.output_tokens

  return { resposta, tokensUsados }
}
