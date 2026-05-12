import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const CLIENT_ID = process.env.CONTA_AZUL_CLIENT_ID!
const CLIENT_SECRET = process.env.CONTA_AZUL_CLIENT_SECRET!
const REDIRECT_URI = process.env.CONTA_AZUL_REDIRECT_URI!

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state') // empresa nome
  const error = searchParams.get('error')

  if (error) {
    return new NextResponse(`<html><body><h2>Erro: ${error}</h2></body></html>`, {
      headers: { 'Content-Type': 'text/html' },
    })
  }

  if (!code) {
    return new NextResponse('<html><body><h2>Código de autorização não encontrado.</h2></body></html>', {
      headers: { 'Content-Type': 'text/html' },
    })
  }

  const empresaNome = state || 'desconhecida'

  // Troca o código pelo access_token + refresh_token
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
  const tokenRes = await fetch('https://auth.contaazul.com/oauth2/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
    }).toString(),
  })

  if (!tokenRes.ok) {
    const err = await tokenRes.text()
    return new NextResponse(`<html><body><h2>Erro ao trocar token</h2><pre>${err}</pre></body></html>`, {
      headers: { 'Content-Type': 'text/html' },
    })
  }

  const tokens = await tokenRes.json()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Busca o empresa_id pelo nome
  const { data: empresa } = await supabase
    .from('empresas')
    .select('id')
    .ilike('nome', `%${empresaNome}%`)
    .maybeSingle()

  // Upsert na tabela dedicada de tokens
  await supabase.from('conta_azul_tokens').upsert(
    {
      empresa_nome: empresaNome,
      empresa_id: empresa?.id ?? null,
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: 'empresa_nome' }
  )

  // Registra no sync_log para auditoria
  await supabase.from('sync_log').insert({
    fonte: 'conta_azul',
    empresa_id: empresa?.id ?? null,
    tipo_sync: 'oauth_token',
    status: 'sucesso',
    metadados: {
      empresa: empresaNome,
      capturado_em: new Date().toISOString(),
    },
  })

  return new NextResponse(
    `<html>
      <head><meta charset="utf-8"></head>
      <body style="font-family:sans-serif;padding:40px;text-align:center">
        <h1>✅ ${empresaNome} autorizado!</h1>
        <p>Tokens salvos com sucesso. Pode fechar esta aba.</p>
        <p style="color:#888;font-size:12px">refresh_token salvo em conta_azul_tokens</p>
      </body>
    </html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )
}
