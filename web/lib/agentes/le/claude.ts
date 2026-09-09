import Anthropic from '@anthropic-ai/sdk'
import { LE_PERGUNTA_PROMPT, LE_RESUMO_PROMPT } from './system-prompt'
import { buildLeContext } from './context'
import { chamarAgente, MODELO_CONVERSA } from '@/lib/agentes/modelo'
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
// Modelo e parâmetros: lib/agentes/modelo

export async function leResponder(
  pergunta: string,
  _historico: Mensagem[] = [],
  userId?: string
): Promise<{ resposta: string; tokensUsados: number }> {
  const [contexto, historico, memorias] = await Promise.all([
    buildLeContext(pergunta),
    userId ? carregarHistorico('le', userId) : Promise.resolve([] as Mensagem[]),
    carregarMemorias('le'),
  ])

  const memoriasTexto = formatarMemorias(memorias)
  const contextoCompleto = memoriasTexto ? `${contexto}\n\n${memoriasTexto}` : contexto

  const mensagens: Anthropic.Messages.MessageParam[] = [
    ...historico.slice(-20).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: LE_PERGUNTA_PROMPT(contextoCompleto, pergunta) },
  ]

  // 1024 tokens truncava resposta no meio da frase.
  const { texto: resposta, tokens: tokensUsados, recusado } = await chamarAgente(mensagens, {
    modelo: MODELO_CONVERSA, esforco: 'high', maxTokens: 8000,
  })
  if (recusado) {
    return { resposta: 'Não consegui responder a essa pergunta. Reformule com outro recorte.', tokensUsados }
  }

  if (userId) {
    const novas: Mensagem[] = [
      ...historico,
      { role: 'user', content: pergunta, timestamp: new Date().toISOString() },
      { role: 'assistant', content: resposta, timestamp: new Date().toISOString() },
    ]
    salvarConversa('le', userId, novas, tokensUsados).catch(console.error)
    if (novas.length % 8 === 0 || novas.length <= 4) {
      extrairESalvarMemorias('le', novas).catch(console.error)
    }
  }

  return { resposta, tokensUsados }
}

export async function leResumo(): Promise<string> {
  const [contexto, memorias] = await Promise.all([buildLeContext(), carregarMemorias('le')])
  const memoriasTexto = formatarMemorias(memorias)
  const contextoCompleto = memoriasTexto ? `${contexto}\n\n${memoriasTexto}` : contexto
  const { texto } = await chamarAgente(
    [{ role: 'user', content: LE_RESUMO_PROMPT(contextoCompleto) }],
    { modelo: MODELO_CONVERSA, esforco: 'medium', maxTokens: 2000 },
  )
  return texto
}
