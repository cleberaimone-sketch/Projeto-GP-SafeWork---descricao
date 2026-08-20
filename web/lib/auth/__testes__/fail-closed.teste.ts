// Testes do H5 — fail-closed para ACESSO_PERFIS_JSON inválida.
//
// Rodar: node --experimental-strip-types lib/auth/__testes__/fail-closed.teste.ts
//
// A env muda entre os blocos, então cada bloco reimporta o módulo (cache-buster
// na URL) para forçar a releitura.

import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const MOD = pathToFileURL(resolve(import.meta.dirname, '../perfis.ts')).href

async function comEnv(valor: string | undefined) {
  if (valor === undefined) delete process.env.ACESSO_PERFIS_JSON
  else process.env.ACESSO_PERFIS_JSON = valor
  return import(`${MOD}?v=${Math.random()}`)
}

const CLEBER = 'cleberaimone@hotmail.com'
const FIN = 'financeiro@gpsafework.com.br'
const VALIDA = '{"cleberaimone@hotmail.com":["executivo"]}'

let falhas = 0
const checar = (desc: string, real: boolean, esperado: boolean) => {
  const ok = real === esperado
  if (!ok) falhas++
  console.log(`  ${ok ? '✅' : '❌ FALHOU'} ${desc}  (esperado ${esperado ? 'ABRE' : 'BLOQUEIA'})`)
}

// ── 1,2,3 — os três jeitos de "sem config" mantêm fail-open (rollback) ──────
for (const [rotulo, valor] of [
  ['1. env ausente          ', undefined],
  ['2. env vazia ""         ', ''],
  ['3. env só espaços "   " ', '   '],
] as Array<[string, string | undefined]>) {
  const { podeAcessar, rbacAtivo, configInvalida } = await comEnv(valor)
  console.log(`\n${rotulo.trim()} → fail-open (rollback operacional)`)
  checar('  Cleber em /dashboard', podeAcessar(CLEBER, '/dashboard'), true)
  checar('  financeiro@ em /dashboard/medicina', podeAcessar(FIN, '/dashboard/medicina'), true)
  checar('  rbacAtivo() === false', rbacAtivo() === false, true)
  checar('  configInvalida() === false', configInvalida() === false, true)
}

// ── 4,5 — config válida: F1 intacto ────────────────────────────────────────
{
  const { podeAcessar, rbacAtivo, configInvalida } = await comEnv(VALIDA)
  console.log('\n4/5. JSON válido (Cleber executivo) → RBAC F1 normal')
  checar('  Cleber em /dashboard', podeAcessar(CLEBER, '/dashboard'), true)
  checar('  Cleber em /dashboard/medicina', podeAcessar(CLEBER, '/dashboard/medicina'), true)
  checar('  financeiro@ em /dashboard', podeAcessar(FIN, '/dashboard'), false)
  checar('  financeiro@ em /dashboard/financeiro', podeAcessar(FIN, '/dashboard/financeiro'), false)
  checar('  rbacAtivo() === true', rbacAtivo() === true, true)
  checar('  configInvalida() === false', configInvalida() === false, true)
}

// ── 6,7,8 — formas inválidas bloqueiam TODOS, inclusive o Cleber ───────────
const INVALIDAS: Array<[string, string]> = [
  ['6. JSON malformado          ', '{ isto não é json }'],
  ['7. formato invertido        ', '{"executivo":["cleberaimone@hotmail.com"]}'],
  ['8. array no topo            ', '[{"cleberaimone@hotmail.com":["executivo"]}]'],
  ['8b. string no topo          ', '"cleberaimone@hotmail.com"'],
  ['8c. valor não é lista       ', '{"cleberaimone@hotmail.com":"executivo"}'],
  ['8d. lista com não-string    ', '{"cleberaimone@hotmail.com":[123]}'],
]
for (const [rotulo, valor] of INVALIDAS) {
  const { podeAcessar, configInvalida } = await comEnv(valor)
  console.log(`\n${rotulo.trim()} → fail-CLOSED`)
  checar('  Cleber em /dashboard', podeAcessar(CLEBER, '/dashboard'), false)
  checar('  financeiro@ em /dashboard', podeAcessar(FIN, '/dashboard'), false)
  checar('  configInvalida() === true', configInvalida() === true, true)
  // 10 — sem isto o redirect cairia nela mesma e ninguém veria a mensagem
  checar('  /dashboard/acesso-restrito acessível', podeAcessar(CLEBER, '/dashboard/acesso-restrito'), true)
  // 11 — o resto do site não pode ser afetado por env de RBAC quebrada
  checar('  /login livre', podeAcessar(FIN, '/login'), true)
  checar('  /safet/<token> livre', podeAcessar(null, '/safet/abc'), true)
  checar('  /auth/confirm livre (H6.1)', podeAcessar(null, '/auth/confirm'), true)
  checar('  /redefinir-senha livre (H6)', podeAcessar(null, '/redefinir-senha'), true)
}

// ── 9 — objeto vazio é VÁLIDO: RBAC ativo, ninguém tem perfil ──────────────
{
  const { podeAcessar, rbacAtivo, configInvalida } = await comEnv('{}')
  console.log('\n9. objeto vazio {} → config VÁLIDA, ninguém tem perfil')
  checar('  Cleber em /dashboard', podeAcessar(CLEBER, '/dashboard'), false)
  checar('  configInvalida() === false (é válida!)', configInvalida() === false, true)
  checar('  rbacAtivo() === true', rbacAtivo() === true, true)
  checar('  /dashboard/acesso-restrito acessível', podeAcessar(CLEBER, '/dashboard/acesso-restrito'), true)
}

// ── 14 — regressão do F1 com config válida e vários perfis ─────────────────
{
  const { podeAcessar } = await comEnv('{"adm@x.com":["admin"],"fin@x.com":["financeiro"],"chefe@x.com":["executivo"]}')
  console.log('\n14. RBAC F1 — perfis e default deny')
  checar('  admin abre /dashboard/medicina', podeAcessar('adm@x.com', '/dashboard/medicina'), true)
  checar('  executivo abre /dashboard/os', podeAcessar('chefe@x.com', '/dashboard/os'), true)
  checar('  financeiro NÃO abre /dashboard/financeiro (F1)', podeAcessar('fin@x.com', '/dashboard/financeiro'), false)
  checar('  rota nova nasce bloqueada', podeAcessar('fin@x.com', '/dashboard/rota-nova'), false)
  checar('  e-mail com maiúsculas é normalizado', podeAcessar('ADM@X.COM', '/dashboard'), true)
}

console.log(falhas === 0 ? '\n✅ todos os casos passaram' : `\n❌ ${falhas} caso(s) falharam`)
process.exit(falhas === 0 ? 0 : 1)
