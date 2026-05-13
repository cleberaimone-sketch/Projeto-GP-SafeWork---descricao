import Anthropic from '@anthropic-ai/sdk'
import { carregarHistorico, salvarConversa, carregarMemorias, formatarMemorias, extrairESalvarMemorias } from '@/lib/agentes/memory'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM = `Você é Aimone, assistente pessoal do Cleber Aimoni Marques.

Sua missão é ajudar o Cleber na vida pessoal:
- Organizar e resumir conversas do WhatsApp pessoal
- Ajudar a organizar arquivos e pastas do computador (sugere estruturas, nomeia pastas)
- Apoiar na automação da casa (sugestões, rotinas, integração com dispositivos)
- Agenda pessoal, lembretes, família
- Qualquer assunto fora do contexto da GP SafeWork (para isso existe o LUI)

Personalidade: próximo, direto, prático. Trata o Cleber pelo nome. Sem formalidades excessivas.
Idioma: sempre português brasileiro.`

export async function aimoneResponder(
  pergunta: string,
  _historico: { role: 'user' | 'assistant'; content: string }[] = [],
  userId?: string
): Promise<{ resposta: string; tokensUsados: number }> {
  const agente = 'aimone'
  const uid = userId ?? 'default'

  const [historicoSalvo, memorias] = await Promise.all([
    carregarHistorico(agente, uid),
    carregarMemorias(agente),
  ])

  const historico = historicoSalvo.length > 0 ? historicoSalvo : _historico
  const blocoMemorias = formatarMemorias(memorias)

  const systemFinal = blocoMemorias
    ? `${SYSTEM}\n\n${blocoMemorias}`
    : SYSTEM

  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: systemFinal,
    messages: [
      ...historico.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: pergunta },
    ],
  })

  const resposta = (res.content[0] as { type: string; text: string }).text
  const tokensUsados = res.usage.input_tokens + res.usage.output_tokens

  const novoHistorico = [
    ...historico,
    { role: 'user' as const, content: pergunta },
    { role: 'assistant' as const, content: resposta },
  ]

  await salvarConversa(agente, uid, novoHistorico, tokensUsados)

  if (novoHistorico.length % 4 === 0) {
    extrairESalvarMemorias(agente, novoHistorico).catch(() => {})
  }

  return { resposta, tokensUsados }
}

// Salva mensagem monitorada (sem resposta — só para contexto futuro)
export async function aimoneMonitorar(
  chatName: string,
  remetente: string,
  texto: string
): Promise<void> {
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Salva na tabela de monitoramento do Aimone
  const conteudo = `[${chatName}] ${remetente}: ${texto}`
  const { data: existing } = await sb
    .from('conversas_ia')
    .select('id, mensagens')
    .eq('agente', 'aimone')
    .eq('canal', 'whatsapp_monitor')
    .eq('contato_id', chatName)
    .maybeSingle()

  const mensagem = { role: 'user', content: conteudo, timestamp: new Date().toISOString() }

  if (existing) {
    const msgs = [...((existing.mensagens as object[]) ?? []), mensagem].slice(-200)
    await sb.from('conversas_ia').update({ mensagens: msgs, updated_at: new Date().toISOString() }).eq('id', existing.id)
  } else {
    await sb.from('conversas_ia').insert({
      agente: 'aimone',
      canal: 'whatsapp_monitor',
      contato_id: chatName,
      contato_nome: chatName,
      mensagens: [mensagem],
      status: 'ativo',
    })
  }
}
