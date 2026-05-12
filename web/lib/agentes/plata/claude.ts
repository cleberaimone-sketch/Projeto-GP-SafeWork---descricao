import Anthropic from '@anthropic-ai/sdk'
import { PLATA_PERGUNTA_PROMPT, PLATA_RESUMO_PROMPT } from './system-prompt'
import { buildPlataContext } from './context'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-sonnet-4-6'

export interface Mensagem {
  role: 'user' | 'assistant'
  content: string
}

export async function plataResponder(
  pergunta: string,
  historico: Mensagem[] = []
): Promise<{ resposta: string; tokensUsados: number }> {
  const contexto = await buildPlataContext(pergunta)

  const mensagens: Anthropic.Messages.MessageParam[] = [
    ...historico.slice(-10).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: PLATA_PERGUNTA_PROMPT(contexto, pergunta) },
  ]

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: mensagens,
  })

  return {
    resposta: (msg.content[0] as { type: string; text: string }).text,
    tokensUsados: msg.usage.input_tokens + msg.usage.output_tokens,
  }
}

// Chamado pelo LUI para o briefing diário
export async function plataResumo(): Promise<string> {
  const contexto = await buildPlataContext()

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: [{ role: 'user', content: PLATA_RESUMO_PROMPT(contexto) }],
  })

  return (msg.content[0] as { type: string; text: string }).text
}
