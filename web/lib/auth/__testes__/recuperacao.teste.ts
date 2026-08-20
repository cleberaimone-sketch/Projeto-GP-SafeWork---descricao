// Testes do fluxo de recuperação de senha (H6 + H6.1).
//
// Rodar: node --experimental-strip-types lib/auth/__testes__/recuperacao.teste.ts

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Import por URL: o tsconfig proíbe a extensão .ts no caminho e o Node ESM a
// exige. A URL satisfaz os dois.
const { destinoSeguro, DESTINO_PADRAO } = await import(
  pathToFileURL(resolve(import.meta.dirname, '../destino-seguro.ts')).href
) as { destinoSeguro: (v: string | null | undefined) => string; DESTINO_PADRAO: string }

const raiz = resolve(import.meta.dirname, '../../..')
const ler = (p: string) => readFileSync(resolve(raiz, p), 'utf8')

const pagConfirm = ler('app/auth/confirm/page.tsx')
const cliConfirm = ler('app/auth/confirm/ConfirmarNoCliente.tsx')
const formEsqueci = ler('app/esqueci-senha/EsqueciSenhaForm.tsx')
const formRedefinir = ler('app/redefinir-senha/RedefinirSenhaForm.tsx')
const pagRedefinir = ler('app/redefinir-senha/page.tsx')
const login = ler('app/login/LoginForm.tsx')
const pagLogin = ler('app/login/page.tsx')

let falhas = 0
const checar = (desc: string, ok: boolean) => {
  if (!ok) falhas++
  console.log(`  ${ok ? '✅' : '❌ FALHOU'} ${desc}`)
}

console.log('\n1. Fragmento (#access_token) — a correção do H6.1:')
checar('existe client component para o fragmento', cliConfirm.includes("'use client'"))
checar('usa o browser client (detectSessionInUrl)', /createClient\(\)/.test(cliConfirm))
checar('reage à sessão via onAuthStateChange', /onAuthStateChange/.test(cliConfirm))
checar('também consulta getSession (corrida do listener)', /getSession\(\)/.test(cliConfirm))
checar('reconhece hash de erro do Supabase', /includes\('error='\)/.test(cliConfirm))
checar('desiste por timeout e manda para login', /LIMITE_MS/.test(cliConfirm) && /erro=link_invalido/.test(cliConfirm))
checar('não registra nem transmite o token', !/console\.|fetch\(['"]http/.test(cliConfirm))
checar('avisa se o JavaScript estiver desligado', /<noscript>/.test(cliConfirm))
checar('navega uma vez só (guarda de reentrância)', /navegou\.current/.test(cliConfirm))

console.log('\n2. Query (PKCE e OTP) — continua no servidor:')
checar('trata ?code com exchangeCodeForSession', /exchangeCodeForSession\(/.test(pagConfirm))
checar('trata ?token_hash com verifyOtp', /verifyOtp\(/.test(pagConfirm))
checar('sem token na query, delega ao cliente', /<ConfirmarNoCliente/.test(pagConfirm))
checar('erro na query vai para /login?erro=link_invalido', /erro=link_invalido/.test(pagConfirm))
checar('não vaza o motivo do erro', !/error\.message/.test(pagConfirm))

console.log('\n3. Anti open-redirect (regra única, servidor e cliente):')
for (const [entrada, esperado] of [
  ['/redefinir-senha', '/redefinir-senha'],
  ['/dashboard', '/dashboard'],
  ['//evil.com', DESTINO_PADRAO],
  ['https://evil.com', DESTINO_PADRAO],
  ['http://evil.com', DESTINO_PADRAO],
  ['//', DESTINO_PADRAO],
  [null, DESTINO_PADRAO],
  [undefined, DESTINO_PADRAO],
] as Array<[string | null | undefined, string]>) {
  checar(`${String(entrada).padEnd(20)} → ${destinoSeguro(entrada)}`, destinoSeguro(entrada) === esperado)
}
checar('servidor usa destinoSeguro', /destinoSeguro\(/.test(pagConfirm))
checar('cliente recebe o destino já sanitizado', /destino=\{destino\}/.test(pagConfirm))

console.log('\n4. Pedido de recuperação:')
checar('usa resetPasswordForEmail', /resetPasswordForEmail\(/.test(formEsqueci))
checar('aponta para /auth/confirm', /auth\/confirm/.test(formEsqueci))
checar('não enumera e-mails', !/if \(error\)/.test(formEsqueci) && /Se houver uma conta/.test(formEsqueci))

console.log('\n5. Definição da nova senha:')
checar('updateUser({ password })', /updateUser\(\{\s*password/.test(formRedefinir))
checar('mínimo de 8 caracteres', /MINIMO = 8/.test(formRedefinir))
checar('bloqueia confirmação divergente', /senha !== confirma/.test(formRedefinir))
checar("encerra outras sessões (scope 'others')", /signOut\(\{\s*scope:\s*['"]others['"]/.test(formRedefinir))
checar('redireciona para /dashboard', /window\.location\.href\s*=\s*['"]\/dashboard['"]/.test(formRedefinir))
checar('sem sessão → /login', /if \(!user\) redirect/.test(pagRedefinir))

console.log('\n6. Entrada pelo login:')
checar('link "Esqueci minha senha"', /esqueci-senha/.test(login))
checar('aviso de link expirado', /link_invalido/.test(login))
checar('useSearchParams dentro de Suspense', /<Suspense/.test(pagLogin))

console.log(falhas === 0 ? '\n✅ todos os casos passaram' : `\n❌ ${falhas} caso(s) falharam`)
process.exit(falhas === 0 ? 0 : 1)
