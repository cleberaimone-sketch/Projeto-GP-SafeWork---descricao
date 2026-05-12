import { NextRequest, NextResponse } from 'next/server'

const CLIENT_ID = process.env.CONTA_AZUL_CLIENT_ID!
const REDIRECT_URI = process.env.CONTA_AZUL_REDIRECT_URI!

const EMPRESAS = [
  'SafeWork Medianeira',
  'SafeWork Foz do Iguacu',
  'SafeWork Santa Helena',
  'SafeWork Londrina',
  'Safe Plus',
  'SafeT',
  'SafeR&S',
  'SafeHelp',
  'SafeMeioAmbiente',
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
      </body>
    </html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )
}

function buildAuthUrl(empresa: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    state: empresa,
    scope: 'openid profile aws.cognito.signin.user.admin',
  })
  return `https://auth.contaazul.com/login?${params}`
}
