// Memória persistente dos agentes — Supabase
// Duas camadas:
//   1. conversas_ia      — histórico completo de mensagens (por agente + usuário)
//   2. memorias_agentes  — memórias de longo prazo extraídas por Claude (decisões, fatos, pendências)

import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface Mensagem {
  role: 'user' | 'assistant'
  content: string
  timestamp?: string
}

export interface Memoria {
  id?: string
  agente: string
  tipo: 'decisao' | 'fato' | 'pendencia' | 'alerta' | 'aprendizado'
  titulo: string
  conteudo: string
  relevancia: number
  created_at?: string
}

// ─── Histórico de conversa ────────────────────────────────────────────────────

export async function carregarHistorico(agente: string, userId: string): Promise<Mensagem[]> {
  const { data } = await sb
    .from('conversas_ia')
    .select('mensagens')
    .eq('agente', agente)
    .eq('canal', 'dashboard')
    .eq('contato_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (data?.mensagens as Mensagem[]) ?? []
}

export async function salvarConversa(
  agente: string,
  userId: string,
  mensagens: Mensagem[],
  tokensUsados = 0
): Promise<void> {
  const { data: existing } = await sb
    .from('conversas_ia')
    .select('id')
    .eq('agente', agente)
    .eq('canal', 'dashboard')
    .eq('contato_id', userId)
    .maybeSingle()

  if (existing?.id) {
    await sb
      .from('conversas_ia')
      .update({ mensagens, tokens_usados: tokensUsados, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
  } else {
    await sb
      .from('conversas_ia')
      .insert({ agente, canal: 'dashboard', contato_id: userId, mensagens, tokens_usados: tokensUsados })
  }
}

// ─── Memórias de longo prazo ──────────────────────────────────────────────────

export async function carregarMemorias(agente: string, limite = 20): Promise<Memoria[]> {
  const { data, error } = await sb
    .from('memorias_agentes')
    .select('id, agente, tipo, titulo, conteudo, relevancia, created_at')
    .eq('agente', agente)
    .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
    .order('relevancia', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limite)

  if (error) return [] // tabela ainda não existe ou outro erro — falha silenciosa
  return (data ?? []) as Memoria[]
}

export async function salvarMemoria(memoria: Omit<Memoria, 'id' | 'created_at'>): Promise<void> {
  const { error } = await sb.from('memorias_agentes').insert(memoria)
  if (error) return // falha silenciosa até a migration ser aplicada
}

// Extrai memórias de uma conversa usando Claude e salva no banco
// Chamada de forma assíncrona (não bloqueia a resposta ao usuário)
export async function extrairESalvarMemorias(agente: string, mensagens: Mensagem[]): Promise<void> {
  if (mensagens.length < 2) return

  const conversa = mensagens
    .slice(-20)
    .map(m => `${m.role === 'user' ? 'Cleber' : agente}: ${m.content}`)
    .join('\n\n')

  try {
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `Analise esta conversa entre o Cleber e o agente "${agente}" e extraia memórias importantes para que o agente lembre no futuro.

Tipos de memória:
- decisao: algo foi decidido ou acordado ("vamos fazer X", "ficou definido que Y")
- fato: informação importante descoberta sobre a empresa, processos ou pessoas
- pendencia: tarefa ou follow-up que ficou em aberto
- alerta: algo que merece atenção contínua
- aprendizado: preferência do Cleber ou comportamento esperado do agente

Retorne SOMENTE um JSON array. Se não houver memórias relevantes, retorne [].
Formato: [{"tipo":"decisao","titulo":"Título curto","conteudo":"Descrição completa","relevancia":4}]

Conversa:
${conversa}`,
      }],
    })

    const text = (res.content[0] as { type: string; text: string }).text.trim()
    const match = text.match(/\[[\s\S]*\]/)
    if (!match) return

    const memorias = JSON.parse(match[0]) as Array<{
      tipo: Memoria['tipo']; titulo: string; conteudo: string; relevancia: number
    }>

    for (const m of memorias) {
      if (!m.titulo || !m.conteudo) continue
      await salvarMemoria({ agente, tipo: m.tipo, titulo: m.titulo, conteudo: m.conteudo, relevancia: m.relevancia ?? 3 })
    }
  } catch {
    // extração de memória é best-effort, não bloqueia
  }
}

// Formata memórias para incluir no prompt do agente
export function formatarMemorias(memorias: Memoria[]): string {
  if (memorias.length === 0) return ''

  const porTipo: Record<string, Memoria[]> = {}
  for (const m of memorias) {
    ;(porTipo[m.tipo] ??= []).push(m)
  }

  const labels: Record<string, string> = {
    decisao: 'Decisões tomadas', fato: 'Fatos relevantes',
    pendencia: 'Pendências em aberto', alerta: 'Alertas contínuos', aprendizado: 'Preferências do Cleber',
  }

  const linhas = ['## MEMÓRIAS (lembre sempre)']
  for (const [tipo, lista] of Object.entries(porTipo)) {
    linhas.push(`\n### ${labels[tipo] ?? tipo}`)
    for (const m of lista) {
      linhas.push(`- **${m.titulo}**: ${m.conteudo}`)
    }
  }
  return linhas.join('\n')
}
