import Anthropic from '@anthropic-ai/sdk'
import { LUI_SYSTEM_PROMPT, LUI_BRIEFING_PROMPT } from './system-prompt'
import {
  type Mensagem,
  carregarHistorico,
  salvarConversa,
  carregarMemorias,
  extrairESalvarMemorias,
  formatarMemorias,
} from '@/lib/agentes/memory'

export type { Mensagem }

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-sonnet-4-6'

export async function gerarBriefing(contexto: string): Promise<string> {
  const dataHoje = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  })

  const memorias = await carregarMemorias('lui')
  const memoriasTexto = formatarMemorias(memorias)
  const contextoCompleto = memoriasTexto ? `${contexto}\n\n${memoriasTexto}` : contexto

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: LUI_BRIEFING_PROMPT(contextoCompleto, dataHoje),
    messages: [{ role: 'user', content: 'Gere o briefing de hoje.' }],
  })

  return (msg.content[0] as { type: string; text: string }).text
}

export async function responderPergunta(
  pergunta: string,
  contexto: string,
  _historico: Mensagem[] = [],
  userId?: string
): Promise<{ resposta: string; tokensUsados: number }> {
  const [historico, memorias] = await Promise.all([
    userId ? carregarHistorico('lui', userId) : Promise.resolve([] as Mensagem[]),
    carregarMemorias('lui'),
  ])

  const memoriasTexto = formatarMemorias(memorias)
  const contextoCompleto = memoriasTexto
    ? `Contexto atual do negócio:\n\`\`\`json\n${contexto}\n\`\`\`\n\n${memoriasTexto}`
    : `Contexto atual do negócio:\n\`\`\`json\n${contexto}\n\`\`\``

  const mensagens: Anthropic.Messages.MessageParam[] = [
    ...historico.slice(-20).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: `${contextoCompleto}\n\nPergunta: ${pergunta}` },
  ]

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: LUI_SYSTEM_PROMPT,
    messages: mensagens,
  })

  const resposta = (msg.content[0] as { type: string; text: string }).text
  const tokensUsados = msg.usage.input_tokens + msg.usage.output_tokens

  if (userId) {
    const novas: Mensagem[] = [
      ...historico,
      { role: 'user', content: pergunta, timestamp: new Date().toISOString() },
      { role: 'assistant', content: resposta, timestamp: new Date().toISOString() },
    ]
    salvarConversa('lui', userId, novas, tokensUsados).catch(console.error)
    if (novas.length % 8 === 0 || novas.length <= 4) {
      extrairESalvarMemorias('lui', novas).catch(console.error)
    }
  }

  return { resposta, tokensUsados }
}
