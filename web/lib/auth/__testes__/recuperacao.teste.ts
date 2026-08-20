// Testes do H6 — fluxo de recuperação de senha.
//
// Rodar: node --experimental-strip-types lib/auth/__testes__/recuperacao.teste.ts

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const raiz = resolve(import.meta.dirname, '../../..')
const ler = (p: string) => readFileSync(resolve(raiz, p), 'utf8')

const rota = ler('app/auth/confirm/route.ts')
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

// A regra de sanitização, replicada aqui para exercitar os casos de borda.
const destinoSeguro = (bruto: string | null) => {
  const v = bruto ?? '/redefinir-senha'
  return v.startsWith('/') && !v.startsWith('//') ? v : '/redefinir-senha'
}

console.log('\n1. /auth/confirm — troca de token:')
checar('trata PKCE (exchangeCodeForSession)', /exchangeCodeForSession\(/.test(rota))
checar('trata OTP (verifyOtp com token_hash)', /verifyOtp\(\{[^}]*token_hash/.test(rota))
checar('erro leva a /login?erro=link_invalido', /erro=link_invalido/.test(rota))
checar('não vaza o motivo do erro na URL', !/error\.message.*searchParams|erro=\$\{/.test(rota))

console.log('\n2. Anti open-redirect no parâmetro next:')
for (const [entrada, esperado] of [
  ['/redefinir-senha', '/redefinir-senha'],
  ['/dashboard', '/dashboard'],
  ['//evil.com', '/redefinir-senha'],
  ['https://evil.com', '/redefinir-senha'],
  ['http://evil.com', '/redefinir-senha'],
  [null, '/redefinir-senha'],
] as Array<[string | null, string]>) {
  checar(`${String(entrada).padEnd(20)} → ${destinoSeguro(entrada)}`, destinoSeguro(entrada) === esperado)
}

console.log('\n3. Pedido de recuperação:')
checar('usa resetPasswordForEmail', /resetPasswordForEmail\(/.test(formEsqueci))
checar('aponta para /auth/confirm', /auth\/confirm/.test(formEsqueci))
checar('mesma resposta com e sem conta (não enumera e-mails)',
       !/if \(error\)/.test(formEsqueci) && /Se houver uma conta/.test(formEsqueci))

console.log('\n4. Definição da nova senha:')
checar('usa updateUser({ password })', /updateUser\(\{\s*password/.test(formRedefinir))
checar('exige mínimo de 8 caracteres', /MINIMO = 8/.test(formRedefinir))
checar('confere as duas senhas', /senha !== confirma/.test(formRedefinir))
checar('encerra as outras sessões após trocar', /signOut\(\{\s*scope:\s*['"]others['"]/.test(formRedefinir))
checar('página exige sessão (sem sessão → /login)', /if \(!user\) redirect/.test(pagRedefinir))

console.log('\n5. Entrada pelo login:')
checar('link "Esqueci minha senha"', /esqueci-senha/.test(login))
checar('mostra aviso de link expirado', /link_invalido/.test(login))
checar('useSearchParams dentro de Suspense (Next 16)', /<Suspense/.test(pagLogin))

console.log(falhas === 0 ? '\n✅ todos os casos passaram' : `\n❌ ${falhas} caso(s) falharam`)
process.exit(falhas === 0 ? 0 : 1)
