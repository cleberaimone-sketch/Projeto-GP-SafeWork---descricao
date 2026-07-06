import { NextRequest, NextResponse } from 'next/server'

const CLIENT_ID = process.env.CONTA_AZUL_CLIENT_ID!
const REDIRECT_URI = process.env.CONTA_AZUL_REDIRECT_URI!

const EMPRESAS = [
  'GP SafeWork',
  'SafeWork Medianeira',
  'SafeWork Foz do Iguaçu',
  'SafeWork Santa Helena',
  'SafeWork Londrina',
  'Safe+',
  'SafeT',
  'SafeR&S',
  'SafeHelp',
  'SafeWork Meio Ambiente',
  'SafeSolucoes',
]

// GET /api/conta-azul/authorize?empresa=NOME — redireciona para o Conta Azul
// GET /api/conta-azul/authorize — lista todos os links de autorização
export async function GET(req: NextRequest) {
  const empresa = req.nextUrl.searchParams.get('empresa')

  if (empresa) {
    const url = buildAuthUrl(empresa)
    return NextResponse.redirect(url)
  }

  // Retorna página HTML com todos os links
  const links = EMPRESAS.map(e => {
    const url = buildAuthUrl(e)
    return `<li style="margin:12px 0"><a href="${url}" style="font-size:16px;color:#2563eb">${e}</a></li>`
  }).join('')

  return new NextResponse(
    `<html>
      <head><meta charset="utf-8"><title>Autorizar Conta Azul</title></head>
      <body style="font-family:sans-serif;padding:40px;max-width:600px;margin:0 auto">
        <h1>🔑 Autorizar Conta Azul</h1>
        <p>Clique no link de cada empresa e faça login com as credenciais correspondentes:</p>
        <ul style="list-style:none;padding:0">${links}</ul>
        <hr>
        <p style="color:#888;font-size:12px">
          Cada link abre a página de login do Conta Azul.<br>
          Use o usuário/senha específico de cada empresa.
        </p>
        <hr>
        <p style="font-size:11px;color:#555">
          <strong>Callback URL:</strong><br>
          <code style="background:#f4f4f4;padding:4px 8px;border-radius:4px;display:inline-block;margin-top:4px">${REDIRECT_URI}</code>
        </p>
        <p style="font-size:11px;color:#555">
          <strong>Client ID:</strong><br>
          <code style="background:#f4f4f4;padding:4px 8px;border-radius:4px;display:inline-block;margin-top:4px">${CLIENT_ID}</code>
        </p>
        <p style="font-size:11px;color:#555">
          <strong>URL de exemplo (SafeWork Medianeira):</strong><br>
          <code style="background:#f4f4f4;padding:4px 8px;border-radius:4px;display:inline-block;margin-top:4px;word-break:break-all">${buildAuthUrl('SafeWork Medianeira')}</code>
        </p>
      </body>
    </html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
  )
}

function buildAuthUrl(empresa: string): string {
  // Usa base64url para evitar que caracteres especiais (+, &, ç) sejam
  // corrompidos pelo servidor OAuth do Conta Azul ao retornar o state.
  const stateEncoded = Buffer.from(empresa, 'utf-8').toString('base64url')
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    state: stateEncoded,
    scope: 'openid',
    // Força novo login SEMPRE, ignorando a sessão ativa do Conta Azul/Cognito.
    // Sem isto, ao reautorizar várias empresas em sequência (mesmo em aba
    // anônima) o Cognito reaproveita a 1ª conta logada e TODAS acabam
    // apontando para a mesma conta → duplicação. Ver
    // memory/feedback_sync_conta_azul_duplica.md.
    prompt: 'login',
  })
  return `https://auth.contaazul.com/oauth2/authorize?${params}`
}
