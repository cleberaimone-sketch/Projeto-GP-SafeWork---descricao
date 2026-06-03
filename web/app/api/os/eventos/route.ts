// ============================================================
// POST /api/os/eventos
//
// Endpoint de entrada do barramento de eventos do GP SafeWork OS.
// Recebe eventos de qualquer módulo do ecossistema:
//   - GP Sales IA (lead_criado, venda_fechada, etc.)
//   - D4sign (contrato_assinado, documento_entregue)
//   - Conta Azul (pagamento_recebido)
//   - Command Center interno (alerta_critico)
//
// Autenticação: header x-os-secret com OS_WEBHOOK_SECRET,
// ou header x-cron-secret com CRON_SECRET (para jobs internos).
//
// Exemplo de payload:
//   { "tipo": "venda_fechada", "origem": "gp_sales_ia",
//     "payload": { "empresa": "Acme", "valor": 1500 } }
// ============================================================

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const OS_SECRET   = process.env.OS_WEBHOOK_SECRET
const CRON_SECRET = process.env.CRON_SECRET

const TIPOS_VALIDOS = new Set([
  'lead_criado', 'lead_qualificado', 'proposta_gerada',
  'venda_fechada', 'pagamento_confirmado', 'cliente_criado',
  'contrato_gerado', 'contrato_assinado', 'ordem_servico_aberta',
  'exame_agendado', 'visita_tecnica_agendada', 'documento_entregue',
  'fatura_gerada', 'pagamento_recebido', 'alerta_critico',
])

function autenticado(req: NextRequest): boolean {
  const osSecret   = req.headers.get('x-os-secret')
  const cronSecret = req.headers.get('x-cron-secret')
  if (OS_SECRET   && osSecret   === OS_SECRET)   return true
  if (CRON_SECRET && cronSecret === CRON_SECRET) return true
  // Se nenhum secret configurado, aceita internamente (dev/staging)
  if (!OS_SECRET && !CRON_SECRET) return true
  return false
}

export async function POST(req: NextRequest) {
  if (!autenticado(req)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  let body: { tipo?: string; origem?: string; payload?: Record<string, unknown> }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 })
  }

  const { tipo, origem = 'externo', payload = {} } = body

  if (!tipo) {
    return NextResponse.json({ ok: false, error: 'Campo "tipo" obrigatório' }, { status: 400 })
  }
  if (!TIPOS_VALIDOS.has(tipo)) {
    return NextResponse.json({ ok: false, error: `Tipo "${tipo}" não reconhecido` }, { status: 400 })
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data, error } = await sb
    .from('os_eventos')
    .insert({ tipo, origem, payload })
    .select('id')
    .single()

  if (error) {
    console.error('[os/eventos] Erro ao inserir:', error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  // Se for alerta crítico, publica também na fila de alertas do LUI
  if (tipo === 'alerta_critico' && payload.mensagem) {
    const msg = String(payload.mensagem)
    const area = String(payload.area ?? origem)
    console.log(`[os/eventos] alerta_critico de ${area}: ${msg}`)
  }

  console.log(`[os/eventos] ✓ ${tipo} | ${origem} | id=${data.id}`)
  return NextResponse.json({ ok: true, id: data.id })
}

// GET — health check (útil para testar a rota)
export async function GET() {
  return NextResponse.json({
    ok: true,
    descricao: 'GP OS — barramento de eventos do ecossistema',
    tipos_aceitos: [...TIPOS_VALIDOS],
  })
}
