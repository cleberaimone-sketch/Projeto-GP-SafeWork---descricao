export const maxDuration = 300

// ============================================================
// GET  /api/lui/briefing  — chamado pelo Vercel Cron às 10h UTC (7h BRT)
//                          OU disparo manual pelo dashboard (sessão autenticada)
// POST /api/lui/briefing  — disparo via N8N / webhook com CRON_SECRET
// Orquestra Plata + Lari + Dieguito + Luizito + Le → consolida → envia WhatsApp
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { coletarResumosAgentes, gerarBriefing } from '@/lib/lui/claude'
import { sendWhatsAppMessage } from '@/lib/lui/whatsapp'

const CRON_SECRET      = process.env.CRON_SECRET
const CLEBER_WHATSAPP  = process.env.CLEBER_WHATSAPP_NUMBER

function getDB() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function executarBriefing(forcarEnvio = false) {
  const db  = getDB()
  const hoje = new Date().toISOString().split('T')[0]

  // Evita duplicado no mesmo dia (exceto forçado)
  if (!forcarEnvio) {
    const { data: jaGerado } = await db
      .from('briefings_diarios')
      .select('id')
      .eq('data_briefing', hoje)
      .maybeSingle()
    if (jaGerado) return { ok: true, msg: 'Briefing já gerado hoje', duplicado: true }
  }

  // 1. Coleta resumos dos agentes em paralelo
  const inicio = Date.now()
  const resumos = await coletarResumosAgentes()
  const tempoColeta = Date.now() - inicio

  // 2. LUI consolida o briefing
  const briefing = await gerarBriefing(resumos)

  // 3. Salva no banco
  const { data: salvo, error: errSalvo } = await db
    .from('briefings_diarios')
    .upsert({
      data_briefing: hoje,
      canal: 'whatsapp',
      conteudo: briefing,
      resumo: briefing.slice(0, 300),
      metricas: { resumo_plata: resumos.plata, resumo_lari: resumos.lari, resumo_dieguito: resumos.dieguito, resumo_luizito: resumos.luizito, resumo_le: resumos.le, resumo_carlitos: resumos.carlitos, tempo_coleta_ms: tempoColeta },
      enviado: false,
    }, { onConflict: 'data_briefing' })
    .select('id')
    .single()

  if (errSalvo) console.error('[briefing] Erro ao salvar:', errSalvo)

  // 4. Envia via WhatsApp
  let enviado = false
  if (CLEBER_WHATSAPP) {
    enviado = await sendWhatsAppMessage(CLEBER_WHATSAPP, briefing)
    if (enviado && salvo?.id) {
      await db
        .from('briefings_diarios')
        .update({ enviado: true, enviado_em: new Date().toISOString() })
        .eq('id', salvo.id)
    }
  }

  return { ok: true, enviado, briefing, resumos, tempo_ms: Date.now() - inicio }
}

// Cron (POST com CRON_SECRET) ou disparado pelo N8N
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const forcar = (body as { forcar?: boolean }).forcar === true
    const result = await executarBriefing(forcar)
    return NextResponse.json(result)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[LUI briefing] Erro:', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

// Disparo via Vercel Cron (GET com User-Agent vercel-cron) OU manual pelo dashboard (sessão).
// Vercel Cron envia User-Agent "vercel-cron/1.0" e, se CRON_SECRET configurado, Authorization Bearer.
export async function GET(req: NextRequest) {
  const userAgent = req.headers.get('user-agent') ?? ''
  const auth = req.headers.get('authorization')
  const isVercelCron =
    userAgent.startsWith('vercel-cron') ||
    (CRON_SECRET && auth === `Bearer ${CRON_SECRET}`)

  if (!isVercelCron) {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const forcar = req.nextUrl.searchParams.get('forcar') === '1'

  try {
    const result = await executarBriefing(forcar)
    return NextResponse.json(result)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[LUI briefing GET] Erro:', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
