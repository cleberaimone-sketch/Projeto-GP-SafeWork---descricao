// ============================================================
// POST /api/lui/briefing
// Gera o briefing diário e envia via WhatsApp para o Cleber
// Chamado pelo cron (N8N ou Vercel Cron) às 7h
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildBusinessContext } from '@/lib/lui/context'
import { gerarBriefing } from '@/lib/lui/claude'
import { sendWhatsAppMessage } from '@/lib/lui/whatsapp'

const CRON_SECRET = process.env.CRON_SECRET
const CLEBER_WHATSAPP = process.env.CLEBER_WHATSAPP_NUMBER  // ex: 5545999990000

export async function POST(req: NextRequest) {
  // Autenticação do cron
  const auth = req.headers.get('authorization')
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const hoje = new Date().toISOString().split('T')[0]

  // Evita gerar briefing duplicado no mesmo dia
  const { data: jaGerado } = await supabase
    .from('briefings_diarios')
    .select('id')
    .eq('data_briefing', hoje)
    .single()

  if (jaGerado) {
    return NextResponse.json({ ok: true, msg: 'Briefing já gerado hoje' })
  }

  try {
    // 1. Coleta contexto do negócio
    const contexto = await buildBusinessContext()

    // 2. Gera briefing com o LUI
    const briefing = await gerarBriefing(contexto)

    // 3. Salva no banco
    const metricas = JSON.parse(contexto)
    await supabase.from('briefings_diarios').insert({
      data_briefing: hoje,
      canal: 'whatsapp',
      conteudo: briefing,
      resumo: briefing.slice(0, 200),
      metricas,
      enviado: false,
    })

    // 4. Envia via WhatsApp
    let enviado = false
    if (CLEBER_WHATSAPP) {
      enviado = await sendWhatsAppMessage(CLEBER_WHATSAPP, briefing)
      if (enviado) {
        await supabase
          .from('briefings_diarios')
          .update({ enviado: true, enviado_em: new Date().toISOString() })
          .eq('data_briefing', hoje)
      }
    }

    return NextResponse.json({ ok: true, enviado, preview: briefing.slice(0, 100) })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[LUI] Erro no briefing:', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
