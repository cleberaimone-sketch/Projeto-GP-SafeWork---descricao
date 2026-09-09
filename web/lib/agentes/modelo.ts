// Configuração de modelo dos agentes, em um lugar só.
//
// Antes cada agente tinha `const MODEL = 'claude-sonnet-4-6'` no seu próprio
// claude.ts — sete cópias para manter em sincronia, e trocar de modelo era
// editar sete arquivos.
//
// SOBRE O SONNET 4.6 QUE ESTAVA AQUI: ele custa US$ 3/US$ 15 por milhão de
// tokens. O Sonnet 5 custa US$ 2/US$ 10 e é mais capaz — o projeto pagava mais
// por menos, simplesmente porque a versão antiga foi escrita antes da nova
// existir.

import Anthropic from '@anthropic-ai/sdk'

/**
 * Fable 5.1 — o modelo mais capaz. US$ 10/US$ 50 por milhão de tokens.
 *
 * É onde o raciocínio decide a qualidade da resposta: analisar saúde
 * financeira, cruzar orçado com realizado, propor plano de ação. Custa o dobro
 * do Opus 5 e cinco vezes o Sonnet 5 — vale onde a análise vale, não em chat
 * de volume.
 */
export const MODELO_ANALISE = 'claude-fable-5-1'

/** Opus 5 — US$ 5/US$ 25. Padrão dos agentes de conversa. */
export const MODELO_CONVERSA = 'claude-opus-5'

/** Haiku 4.5 — US$ 1/US$ 5. Volume alto e resposta curta. */
export const MODELO_VOLUME = 'claude-haiku-4-5'

export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * Esforço de raciocínio. `high` é o padrão da API; `xhigh` e `max` custam mais
 * e só se pagam em problema difícil de verdade.
 */
export type Esforco = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

type Opcoes = {
  modelo?: string
  esforco?: Esforco
  maxTokens?: number
  /** Aparece no histórico do agente; o Fable pensa de qualquer forma. */
  mostrarRaciocinio?: boolean
}

/**
 * Uma chamada de agente, com os cuidados que a família Fable/Opus 5 exige.
 *
 * O que MUDA em relação ao código antigo, e por quê:
 *
 * - **Pensamento adaptativo.** No Fable 5.1 o raciocínio é sempre ligado e
 *   qualquer `thinking` explícito além de `adaptive` é recusado com 400.
 *   `budget_tokens`, que era como se pedia raciocínio nos modelos antigos,
 *   também dá 400 — não é depreciação, é erro.
 * - **Sem `temperature`.** Também rejeitado com 400 nesta família.
 * - **max_tokens folgado.** Estava em 1024, o que trunca análise no meio da
 *   frase. Análise financeira não cabe em 1024 tokens.
 * - **Fallback de recusa.** O classificador de segurança pode recusar um
 *   pedido (HTTP 200 com `stop_reason: 'refusal'`). Sem fallback a resposta
 *   volta vazia e o painel mostra silêncio; com ele a API refaz a chamada em
 *   outro modelo dentro da mesma requisição.
 */
export async function chamarAgente(
  mensagens: Anthropic.Messages.MessageParam[],
  { modelo = MODELO_CONVERSA, esforco = 'high', maxTokens = 8000, mostrarRaciocinio = false }: Opcoes = {},
): Promise<{ texto: string; tokens: number; recusado: boolean }> {
  const msg = await anthropic.beta.messages.create({
    model: modelo,
    max_tokens: maxTokens,
    thinking: { type: 'adaptive', display: mostrarRaciocinio ? 'summarized' : 'omitted' },
    output_config: { effort: esforco },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    messages: mensagens,
  })

  // Blocos de raciocínio não são resposta: pegar content[0] às cegas, como o
  // código antigo fazia, devolveria o pensamento em vez do texto.
  const texto = msg.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim()

  return {
    texto,
    tokens: msg.usage.input_tokens + msg.usage.output_tokens,
    recusado: msg.stop_reason === 'refusal',
  }
}
