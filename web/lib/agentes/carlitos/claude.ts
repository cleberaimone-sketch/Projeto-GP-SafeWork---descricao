import Anthropic from '@anthropic-ai/sdk'
import { CARLITOS_PERGUNTA_PROMPT, CARLITOS_RESUMO_PROMPT } from './system-prompt'
import { buildCarlitosContext } from './context'
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

export async function carlitosResponder(
  pergunta: string,
  _historico: Mensagem[] = [],
  userId?: string
): Promise<{ resposta: string; tokensUsados: number }> {
  const [contexto, historico, memorias] = await Promise.all([
    buildCarlitosContext(pergunta),
    userId ? carregarHistorico('carlitos', userId) : Promise.resolve([] as Mensagem[]),
    carregarMemorias('carlitos'),
  ])

  const memoriasTexto = formatarMemorias(memorias)
  const contextoCompleto = memoriasTexto ? `${contexto}\n\n${memoriasTexto}` : contexto

  const mensagens: Anthropic.Messages.MessageParam[] = [
    ...historico.slice(-20).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: CARLITOS_PERGUNTA_PROMPT(contextoCompleto, pergunta) },
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
    salvarConversa('carlitos', userId, novas, tokensUsados).catch(console.error)
    if (novas.length % 8 === 0 || novas.length <= 4) {
      extrairESalvarMemorias('carlitos', novas).catch(console.error)
    }
  }

  return { resposta, tokensUsados }
}

export async function carlitosResumo(): Promise<string> {
  const [contexto, memorias] = await Promise.all([buildCarlitosContext(), carregarMemorias('carlitos')])
  const memoriasTexto = formatarMemorias(memorias)
  const contextoCompleto = memoriasTexto ? `${contexto}\n\n${memoriasTexto}` : contexto
  const { texto } = await chamarAgente(
    [{ role: 'user', content: CARLITOS_RESUMO_PROMPT(contextoCompleto) }],
    { modelo: MODELO_CONVERSA, esforco: 'medium', maxTokens: 2000 },
  )
  return texto
}
