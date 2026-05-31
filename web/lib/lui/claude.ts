import Anthropic from '@anthropic-ai/sdk'
import { LUI_SYSTEM_PROMPT, LUI_BRIEFING_PROMPT } from './system-prompt'
import { lariResumo } from '@/lib/agentes/lari/claude'
import { dieguitorResumo } from '@/lib/agentes/dieguito/claude'
import { plataResumo } from '@/lib/agentes/plata/claude'
import { luizitoResumo } from '@/lib/agentes/luizito/claude'
import { leResumo } from '@/lib/agentes/le/claude'
import { carlitosResumo } from '@/lib/agentes/carlitos/claude'
import {
  type Mensagem,
  carregarHistorico,
  salvarConversa,
  carregarMemorias,
  extrairESalvarMemorias,
  formatarMemorias,
} from '@/lib/agentes/memory'
import { LUI_TOOLS, executarFerramenta } from './tools'

export type { Mensagem }

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-sonnet-4-6'

export interface ResumoAgentes {
  plata: string
  lari: string
  dieguito: string
  luizito: string
  le: string
  carlitos: string
  nina?: string
}

async function ninaResumo(): Promise<string | undefined> {
  // Só inclui na segunda-feira (dia 1)
  if (new Date().getDay() !== 1) return undefined

  try {
    const { createClient } = await import('@supabase/supabase-js')
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data } = await db
      .from('relatorios_estrategicos')
      .select('resumo, oportunidades, metricas, data_relatorio')
      .eq('status', 'ok')
      .order('data_relatorio', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!data) return undefined

    const ops = (data.oportunidades ?? []) as Array<{ empresa: string; tipo: string; receita_potencial_ano: number }>
    const receitaPotencial = ops.reduce((s: number, o) => s + (o.receita_potencial_ano ?? 0), 0)
    const metricas = data.metricas as { total_vidas?: number; empresas_com_vidas?: number } | null

    return `🎯 *Estratégia — Nina*\n` +
      `Carteira: ${metricas?.empresas_com_vidas ?? '—'} clientes ativos, ${(metricas?.total_vidas ?? 0).toLocaleString('pt-BR')} vidas.\n` +
      `${ops.length} oportunidades identificadas — receita potencial R$${receitaPotencial.toLocaleString('pt-BR')}/ano.\n` +
      (ops[0] ? `Top oportunidade: ${ops[0].empresa} — ${ops[0].tipo}.` : '')
  } catch {
    return undefined
  }
}

export async function coletarResumosAgentes(): Promise<ResumoAgentes> {
  const [plata, lari, dieguito, luizito, le, carlitos, nina] = await Promise.allSettled([
    plataResumo(),
    lariResumo(),
    dieguitorResumo(),
    luizitoResumo(),
    leResumo(),
    carlitosResumo(),
    ninaResumo(),
  ])

  return {
    plata:    plata.status    === 'fulfilled' ? plata.value    : '💰 *Financeiro — Plata*\n⚠️ Dados financeiros indisponíveis no momento.',
    lari:     lari.status     === 'fulfilled' ? lari.value     : '🏥 *Medicina — Lari*\n⚠️ Dados do SOC indisponíveis no momento.',
    dieguito: dieguito.status === 'fulfilled' ? dieguito.value : '⚙️ *Engenharia — Dieguito*\n⚠️ Dados do SOC indisponíveis no momento.',
    luizito:  luizito.status  === 'fulfilled' ? luizito.value  : '📈 *Comercial — Luizito*\n⚠️ Dados comerciais indisponíveis no momento.',
    le:       le.status       === 'fulfilled' ? le.value       : '👥 *RH — Le*\n⚠️ Dados de RH indisponíveis no momento.',
    carlitos: carlitos.status === 'fulfilled' ? carlitos.value : '🛠️ *Processos — Carlitos*\n⚠️ Dados de processos indisponíveis no momento.',
    nina:     nina.status     === 'fulfilled' ? nina.value     : undefined,
  }
}

export async function gerarBriefing(resumos: ResumoAgentes): Promise<string> {
  const dataHoje = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  })

  const memorias = await carregarMemorias('lui')
  const memoriasTexto = formatarMemorias(memorias)

  const systemPrompt = LUI_BRIEFING_PROMPT(dataHoje, resumos.plata, resumos.lari, resumos.dieguito, resumos.luizito, resumos.le, resumos.carlitos, resumos.nina)
  const systemComMemorias = memoriasTexto ? `${systemPrompt}\n\n${memoriasTexto}` : systemPrompt

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: systemComMemorias,
    messages: [{ role: 'user', content: 'Gere o briefing de hoje.' }],
  })

  return (msg.content[0] as { type: string; text: string }).text
}

export async function responderPergunta(
  pergunta: string,
  _contexto: string,   // mantido para compatibilidade com a route, mas não mais usado
  _historico: Mensagem[] = [],
  userId?: string
): Promise<{ resposta: string; tokensUsados: number }> {
  const [historico, memorias] = await Promise.all([
    userId ? carregarHistorico('lui', userId) : Promise.resolve([] as Mensagem[]),
    carregarMemorias('lui'),
  ])

  const memoriasTexto = formatarMemorias(memorias)
  const systemComMemorias = memoriasTexto
    ? `${LUI_SYSTEM_PROMPT}\n\n${memoriasTexto}`
    : LUI_SYSTEM_PROMPT

  // Monta o histórico de mensagens (últimas 20 trocas)
  const mensagens: Anthropic.Messages.MessageParam[] = [
    ...historico.slice(-20).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: pergunta },
  ]

  let tokensUsados = 0
  let resposta = ''
  const MAX_ITERACOES = 5

  // Loop de tool use: Claude chama ferramentas até ter a resposta completa
  for (let iter = 0; iter < MAX_ITERACOES; iter++) {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: systemComMemorias,
      tools: LUI_TOOLS,
      messages: mensagens,
    })

    tokensUsados += msg.usage.input_tokens + msg.usage.output_tokens

    // Se Claude terminou (não quer mais usar ferramentas)
    if (msg.stop_reason !== 'tool_use') {
      const textBlock = msg.content.find(b => b.type === 'text') as { type: 'text'; text: string } | undefined
      resposta = textBlock?.text ?? '(sem resposta)'
      break
    }

    // Claude pediu ferramentas — executa todas em paralelo
    const toolUseBlocks = msg.content.filter(b => b.type === 'tool_use') as Anthropic.Messages.ToolUseBlock[]
    const resultados = await Promise.all(
      toolUseBlocks.map(async tb => ({
        type: 'tool_result' as const,
        tool_use_id: tb.id,
        content: await executarFerramenta(tb.name, tb.input as Record<string, unknown>),
      }))
    )

    // Adiciona a resposta do Claude (com tool_use) e os resultados ao histórico da conversa
    mensagens.push({ role: 'assistant', content: msg.content })
    mensagens.push({ role: 'user', content: resultados })
  }

  // Persiste conversa e extrai memórias em background
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
