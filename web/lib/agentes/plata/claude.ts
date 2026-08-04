import Anthropic from '@anthropic-ai/sdk'
import { PLATA_PERGUNTA_PROMPT, PLATA_RESUMO_PROMPT, PLATA_SYSTEM_PROMPT } from './system-prompt'
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

// Análise curta da EVOLUÇÃO diária (snapshot de hoje vs dias anteriores).
// Usada pelo cron do snapshot — gravada em snapshots_financeiros_diarios.analise
// e exibida no card "Evolução Diária" do dashboard.
// NOTA: o prompt abaixo está sem acentos de propósito — o minifier do
// Turbopack (SWC) deu panic de char boundary num travessão desta string
// (build SIGABRT). A Plata entende normalmente e responde acentuado.
export async function plataAnaliseEvolucao(snapshotsJson: string): Promise<string> {
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 400,
    messages: [{
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
    }],
  })
  return (msg.content[0] as { type: string; text: string }).text
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
