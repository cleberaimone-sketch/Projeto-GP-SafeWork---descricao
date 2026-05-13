import Anthropic from '@anthropic-ai/sdk'
import { PLATA_PERGUNTA_PROMPT, PLATA_RESUMO_PROMPT } from './system-prompt'
import { buildPlataContext } from './context'
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

export async function plataResponder(
  pergunta: string,
  _historico: Mensagem[] = [],
  userId?: string
): Promise<{ resposta: string; tokensUsados: number }> {
  const [contexto, historico, memorias] = await Promise.all([
    buildPlataContext(pergunta),
    userId ? carregarHistorico('plata', userId) : Promise.resolve([] as Mensagem[]),
    carregarMemorias('plata'),
  ])

  const memoriasTexto = formatarMemorias(memorias)
  const contextoCompleto = memoriasTexto ? `${contexto}\n\n${memoriasTexto}` : contexto

  const mensagens: Anthropic.Messages.MessageParam[] = [
    ...historico.slice(-20).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: PLATA_PERGUNTA_PROMPT(contextoCompleto, pergunta) },
  ]

  const msg = await anthropic.messages.create({ model: MODEL, max_tokens: 1024, messages: mensagens })
  const resposta = (msg.content[0] as { type: string; text: string }).text
  const tokensUsados = msg.usage.input_tokens + msg.usage.output_tokens

  if (userId) {
    const novas: Mensagem[] = [
      ...historico,
      { role: 'user', content: pergunta, timestamp: new Date().toISOString() },
      { role: 'assistant', content: resposta, timestamp: new Date().toISOString() },
    ]
    salvarConversa('plata', userId, novas, tokensUsados).catch(console.error)
    if (novas.length % 8 === 0 || novas.length <= 4) {
      extrairESalvarMemorias('plata', novas).catch(console.error)
    }
  }

  return { resposta, tokensUsados }
}

export async function plataResumo(): Promise<string> {
  const [contexto, memorias] = await Promise.all([buildPlataContext(), carregarMemorias('plata')])
  const memoriasTexto = formatarMemorias(memorias)
  const contextoCompleto = memoriasTexto ? `${contexto}\n\n${memoriasTexto}` : contexto
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: [{ role: 'user', content: PLATA_RESUMO_PROMPT(contextoCompleto) }],
  })
  return (msg.content[0] as { type: string; text: string }).text
}
