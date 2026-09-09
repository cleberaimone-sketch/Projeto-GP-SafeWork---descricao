import Anthropic from '@anthropic-ai/sdk'
import { PLATA_PERGUNTA_PROMPT, PLATA_RESUMO_PROMPT, PLATA_SYSTEM_PROMPT } from './system-prompt'
import { buildPlataContext } from './context'
import { chamarAgente, MODELO_ANALISE } from '@/lib/agentes/modelo'
import {
  type Mensagem,
  carregarHistorico,
  salvarConversa,
  carregarMemorias,
  extrairESalvarMemorias,
  formatarMemorias,
} from '@/lib/agentes/memory'

export type { Mensagem }

// Modelo e parâmetros vêm de lib/agentes/modelo — ver lá por que Fable na
// análise e por que o Sonnet 4.6 que estava aqui saiu.

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

  // Pergunta sobre dinheiro merece o modelo que raciocina melhor, e espaço
  // para responder: o teto era 1024 tokens, que corta uma análise no meio.
  const { texto: resposta, tokens: tokensUsados, recusado } = await chamarAgente(mensagens, {
    modelo: MODELO_ANALISE, esforco: 'high', maxTokens: 8000,
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
    salvarConversa('plata', userId, novas, tokensUsados).catch(console.error)
    if (novas.length % 8 === 0 || novas.length <= 4) {
      extrairESalvarMemorias('plata', novas).catch(console.error)
    }
  }

  return { resposta, tokensUsados }
}

// Análise curta da EVOLUÇÃO diária (snapshot de hoje vs dias anteriores).
// Usada pelo cron do snapshot — gravada em snapshots_financeiros_diarios.analise
// e exibida no card "Evolução Diária" do dashboard.
// NOTA: o prompt abaixo está sem acentos de propósito — o minifier do
// Turbopack (SWC) deu panic de char boundary num travessão desta string
// (build SIGABRT). A Plata entende normalmente e responde acentuado.
export async function plataAnaliseEvolucao(snapshotsJson: string): Promise<string> {
  const { texto } = await chamarAgente([{
      role: 'user',
      content: `${PLATA_SYSTEM_PROMPT}

---
Abaixo estao os snapshots DIARIOS da saude financeira do grupo (janela movel de 30 dias - receita_30d/despesa_30d/margem_30d sao comparaveis dia a dia; saldo, atrasados e proximos 7 dias sao posicoes do dia).

${snapshotsJson}

Analise a EVOLUCAO (hoje vs ontem e vs inicio da serie) em no maximo 4 bullets curtos, direto ao ponto, numero-first:
- Esta melhorando ou piorando? O que puxou o movimento?
- Destaque variacoes relevantes (margem, atrasados, saldo).
- Feche com UMA recomendacao pratica para hoje.
Sem introducao, sem despedida - so os bullets.`,
    }], { modelo: MODELO_ANALISE, esforco: 'medium', maxTokens: 1500 })
  return texto
}

export async function plataResumo(): Promise<string> {
  const [contexto, memorias] = await Promise.all([buildPlataContext(), carregarMemorias('plata')])
  const memoriasTexto = formatarMemorias(memorias)
  const contextoCompleto = memoriasTexto ? `${contexto}\n\n${memoriasTexto}` : contexto
  const { texto } = await chamarAgente(
    [{ role: 'user', content: PLATA_RESUMO_PROMPT(contextoCompleto) }],
    { modelo: MODELO_ANALISE, esforco: 'medium', maxTokens: 2000 },
  )
  return texto
}
