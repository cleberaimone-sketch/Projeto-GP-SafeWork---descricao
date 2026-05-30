import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient as sbAdmin } from '@supabase/supabase-js'
import { buildContextoNina, contextoParaPrompt } from '@/lib/agentes/nina/context'
import { NINA_SYSTEM_PROMPT } from '@/lib/agentes/nina/system-prompt'
import { sendWhatsAppMessage } from '@/lib/lui/whatsapp'

export const maxDuration = 300

const CLEBER_WHATSAPP = process.env.CLEBER_WHATSAPP_NUMBER
const CRON_SECRET    = process.env.CRON_SECRET
const anthropic      = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function isCronAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization')
  if (authHeader === `Bearer ${CRON_SECRET}`) return true
  // Vercel Cron envia via GET sem body — aceitar GET sem auth em ambiente Vercel
  const isVercelCron = req.headers.get('x-vercel-cron') === '1'
  return isVercelCron
}

async function gerarRelatorio() {
  const supabase = sbAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Verifica se já gerou relatório hoje
  const hoje = new Date().toISOString().split('T')[0]
  const { data: existente } = await supabase
    .from('relatorios_estrategicos')
    .select('id, conteudo_full')
    .eq('data_relatorio', hoje)
    .eq('status', 'ok')
    .maybeSingle()

  if (existente) {
    return { cached: true, conteudo: existente.conteudo_full ?? '' }
  }

  // Coleta dados do SOC
  const ctx = await buildContextoNina()
  const contextoPrompt = contextoParaPrompt(ctx)

  // Gera relatório via Claude
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: NINA_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `${contextoPrompt}\n\nGere o relatório estratégico semanal completo agora.`,
      },
    ],
  })

  const conteudo = (msg.content[0] as { type: string; text: string }).text
  const tokensUsados = msg.usage.input_tokens + msg.usage.output_tokens

  // Persiste no Supabase
  const { data: salvo, error } = await supabase
    .from('relatorios_estrategicos')
    .insert({
      data_relatorio: hoje,
      status: 'ok',
      resumo: ctx.resumo_texto,
      conteudo_full: conteudo,
      oportunidades: ctx.oportunidades,
      metricas: {
        total_empresas: ctx.snapshot.total_empresas,
        empresas_com_vidas: ctx.snapshot.empresas_com_vidas,
        total_vidas: ctx.snapshot.total_vidas,
        tokens_usados: tokensUsados,
      },
    })
    .select('id')
    .single()

  if (error) {
    console.error('[Nina] Erro ao salvar relatório:', error)
  }

  // Envia WhatsApp
  let enviado = false
  if (CLEBER_WHATSAPP && salvo) {
    const msg_wa = `🎯 *RELATÓRIO ESTRATÉGICO — NINA*\n\n${ctx.resumo_texto}\n\nAcesse o dashboard para o relatório completo: /dashboard/comercial`
    enviado = await sendWhatsAppMessage(CLEBER_WHATSAPP, msg_wa).catch(() => false)

    if (enviado) {
      await supabase
        .from('relatorios_estrategicos')
        .update({ enviado_whatsapp: true, enviado_em: new Date().toISOString() })
        .eq('id', salvo.id)
    }
  }

  return {
    cached: false,
    id: salvo?.id,
    conteudo,
    resumo: ctx.resumo_texto,
    oportunidades: ctx.oportunidades.length,
    enviado_whatsapp: enviado,
  }
}

// GET — Vercel Cron (toda segunda-feira 07h BRT) ou trigger manual
export async function GET(req: NextRequest) {
  if (CRON_SECRET && !isCronAuthorized(req)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const resultado = await gerarRelatorio()
    return NextResponse.json({ ok: true, ...resultado })
  } catch (err) {
    console.error('[Nina] Erro ao gerar relatório:', err)

    // Salva registro de erro para rastreabilidade
    try {
      const supabase = sbAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
      await supabase.from('relatorios_estrategicos').insert({
        data_relatorio: new Date().toISOString().split('T')[0],
        status: 'erro',
        resumo: String(err),
      })
    } catch { /* silencioso */ }

    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// POST — trigger manual autenticado (dashboard)
export async function POST(req: NextRequest) {
  // Valida sessão do usuário
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  // Permite forçar regeneração mesmo que já exista relatório hoje
  const { forcar = false } = await req.json().catch(() => ({}))

  if (forcar) {
    // Remove relatório de hoje para forçar regeneração
    const sbSvc = sbAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const hoje = new Date().toISOString().split('T')[0]
    await sbSvc.from('relatorios_estrategicos').delete().eq('data_relatorio', hoje)
  }

  try {
    const resultado = await gerarRelatorio()
    return NextResponse.json({ ok: true, ...resultado })
  } catch (err) {
    console.error('[Nina] Erro ao gerar relatório (POST):', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
