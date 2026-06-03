// ============================================================
// POST /api/whatsapp/mirror
//
// Recebe mensagens do WhatsApp corporativo (55 45 99909-9009).
// Salva no banco apenas mensagens cujo nome de contato contenha
// "safe" ou "safework" (case-insensitive, ignora acentos).
//
// Configure no Z-API / Evolution API da linha corporativa:
//   URL webhook: https://projeto-gp-safe-work-descricao.vercel.app/api/whatsapp/mirror
//   Header opcional: x-mirror-secret: <MIRROR_WEBHOOK_SECRET>
// ============================================================

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const MIRROR_SECRET = process.env.MIRROR_WEBHOOK_SECRET

function ehContatoSafe(nome: string, numero: string): boolean {
  const n = (nome + ' ' + numero)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
  return n.includes('safe')
}

type ZApiPayload = {
  phone?: string
  connectedPhone?: string
  chatName?: string
  senderName?: string
  text?: { message?: string }
  audio?: { audioUrl?: string }
  image?: { imageUrl?: string }
  document?: { documentUrl?: string }
  messageId?: string
  fromMe?: boolean
  fromApi?: boolean
  isGroup?: boolean
  isNewsletter?: boolean
  type?: string
}

type EvolutionPayload = {
  event?: string
  data?: {
    key?: { remoteJid?: string; id?: string; fromMe?: boolean }
    pushName?: string
    message?: {
      conversation?: string
      extendedTextMessage?: { text?: string }
      audioMessage?: { url?: string }
      imageMessage?: { url?: string }
    }
  }
}

function parseMirrorPayload(body: Record<string, unknown>): {
  numero: string
  nome: string
  mensagem: string
  direcao: 'entrada' | 'saida'
  tipo: string
  messageId: string
} | null {
  try {
    // ── Evolution API ─────────────────────────────────────────────
    if ((body as EvolutionPayload).data?.key?.remoteJid !== undefined) {
      const ev = body as EvolutionPayload
      const numero = (ev.data?.key?.remoteJid ?? '').replace('@s.whatsapp.net', '').replace(/\D/g, '')
      const nome   = ev.data?.pushName ?? ''
      const fromMe = ev.data?.key?.fromMe ?? false
      const msg    = ev.data?.message
      let mensagem = msg?.conversation ?? msg?.extendedTextMessage?.text ?? ''
      let tipo = 'texto'
      if (msg?.audioMessage) { mensagem = mensagem || '[áudio]'; tipo = 'audio' }
      if (msg?.imageMessage) { mensagem = mensagem || '[imagem]'; tipo = 'imagem' }
      if (!numero || !mensagem) return null
      return { numero, nome, mensagem, direcao: fromMe ? 'saida' : 'entrada', tipo, messageId: ev.data?.key?.id ?? '' }
    }

    // ── Z-API ─────────────────────────────────────────────────────
    const z = body as ZApiPayload
    if (z.isNewsletter) return null

    let numero = z.phone ?? ''
    if (numero.endsWith('@lid') || numero.endsWith('@s.whatsapp.net')) {
      numero = z.connectedPhone ?? numero
    }
    numero = numero.replace(/\D/g, '')

    const nome      = z.chatName ?? z.senderName ?? ''
    const fromMe    = z.fromMe ?? z.fromApi ?? false
    let mensagem    = z.text?.message ?? ''
    let tipo        = 'texto'
    if (z.audio?.audioUrl)    { mensagem = mensagem || '[áudio]';    tipo = 'audio'     }
    if (z.image?.imageUrl)    { mensagem = mensagem || '[imagem]';   tipo = 'imagem'    }
    if (z.document?.documentUrl) { mensagem = mensagem || '[documento]'; tipo = 'documento' }

    if (!numero || !mensagem) return null
    return { numero, nome, mensagem, direcao: fromMe ? 'saida' : 'entrada', tipo, messageId: z.messageId ?? '' }
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  // Valida secret opcional
  if (MIRROR_SECRET) {
    const secret = req.headers.get('x-mirror-secret')
    if (secret !== MIRROR_SECRET) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 })
  }

  const parsed = parseMirrorPayload(body)
  if (!parsed) {
    return NextResponse.json({ ok: true, ignorado: 'payload sem dados suficientes' })
  }

  // Filtra: só grava se o contato tem "safe" no nome ou número
  if (!ehContatoSafe(parsed.nome, parsed.numero)) {
    return NextResponse.json({ ok: true, ignorado: 'contato fora do filtro safe' })
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Dedup por messageId
  if (parsed.messageId) {
    const chave = `mirror_${parsed.messageId}`
    const { error: dedupErr } = await sb
      .from('webhook_dedup')
      .insert({ message_id: chave })
    if (dedupErr) {
      return NextResponse.json({ ok: true, ignorado: 'duplicado' })
    }
  }

  const { error } = await sb.from('mensagens_wpp_mirror').insert({
    contato_numero: parsed.numero,
    contato_nome:   parsed.nome,
    mensagem:       parsed.mensagem,
    direcao:        parsed.direcao,
    tipo:           parsed.tipo,
  })

  if (error) {
    console.error('[mirror] Erro ao salvar:', error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  console.log(`[mirror] ✓ ${parsed.direcao} | ${parsed.nome} (${parsed.numero}) | ${parsed.mensagem.slice(0, 60)}`)
  return NextResponse.json({ ok: true })
}
