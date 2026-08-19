// Testes do RBAC F1 — default deny do Command Center.
//
// Rodar:  node --experimental-strip-types lib/auth/__testes__/perfis.teste.ts
//
// A env é trocada entre os blocos, então cada import precisa ser dinâmico e o
// módulo relido — daí o cache-buster na URL.

import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const MOD = pathToFileURL(resolve(import.meta.dirname, '../perfis.ts')).href

async function carregar(envJson: string | undefined) {
  if (envJson === undefined) delete process.env.ACESSO_PERFIS_JSON
  else process.env.ACESSO_PERFIS_JSON = envJson
  return import(`${MOD}?v=${Math.random()}`)
}

const CLEBER = 'cleberaimone@hotmail.com'
const FIN = 'financeiro@gpsafework.com.br'
const JSON_PROD = '{"cleberaimone@hotmail.com":["executivo"]}'

// Todas as rotas do Command Center hoje existentes.
const ROTAS = [
  '/dashboard',
  '/dashboard/financeiro',
  '/dashboard/financeiro/fluxo-caixa',
  '/dashboard/medicina',
  '/dashboard/engenharia',
  '/dashboard/rh',
  '/dashboard/sistema',
  '/dashboard/os',
  '/dashboard/comercial',
  '/dashboard/command-center',
  '/dashboard/lui',
  '/dashboard/processos',
  '/dashboard/aimone',
]

let falhas = 0
const checar = (desc: string, real: boolean, esperado: boolean) => {
  const ok = real === esperado
  if (!ok) falhas++
  console.log(`  ${ok ? '✅' : '❌ FALHOU'} ${desc}`)
}

// ── 1. Cleber (executivo) acessa tudo ──────────────────────────────────────
{
  const { podeAcessar } = await carregar(JSON_PROD)
  console.log('\n1. Cleber com perfil executivo:')
  for (const r of ROTAS) checar(`${r.padEnd(36)} abre`, podeAcessar(CLEBER, r), true)
}

// ── 2. financeiro@ sem perfil é bloqueado em TUDO ──────────────────────────
{
  const { podeAcessar } = await carregar(JSON_PROD)
  console.log('\n2. financeiro@ sem perfil no JSON (default deny):')
  for (const r of ROTAS) checar(`${r.padEnd(36)} bloqueia`, podeAcessar(FIN, r), false)
}

// ── 3. A tela de bloqueio precisa continuar acessível ───────────────────────
{
  const { podeAcessar } = await carregar(JSON_PROD)
  console.log('\n3. Tela de bloqueio (senão o redirect vira laço):')
  checar('/dashboard/acesso-restrito     abre p/ financeiro@', podeAcessar(FIN, '/dashboard/acesso-restrito'), true)
  checar('/dashboard/acesso-restrito?..  abre p/ sem e-mail ', podeAcessar(null, '/dashboard/acesso-restrito'), true)
}

// ── 4. Rota nova nasce BLOQUEADA (o ponto do default deny) ─────────────────
{
  const { podeAcessar } = await carregar(JSON_PROD)
  console.log('\n4. Rota que ainda não existe:')
  checar('/dashboard/rota-nova-qualquer  bloqueia p/ financeiro@', podeAcessar(FIN, '/dashboard/rota-nova-qualquer'), false)
  checar('/dashboard/rota-nova-qualquer  abre p/ Cleber        ', podeAcessar(CLEBER, '/dashboard/rota-nova-qualquer'), true)
}

// ── 5. Fora do Command Center não é afetado ────────────────────────────────
{
  const { podeAcessar } = await carregar(JSON_PROD)
  console.log('\n5. Rotas fora de /dashboard:')
  for (const r of ['/login', '/safet/abc123', '/api/conta-azul/sync', '/'])
    checar(`${r.padEnd(36)} livre`, podeAcessar(FIN, r), true)
}

// ── 6. ROLLBACK: sem a env, tudo volta a abrir ─────────────────────────────
{
  const { podeAcessar, rbacAtivo } = await carregar(undefined)
  console.log('\n6. Rollback — ACESSO_PERFIS_JSON ausente (fail-open):')
  checar('rbacAtivo() === false', rbacAtivo(), false)
  for (const r of ['/dashboard', '/dashboard/medicina', '/dashboard/comercial'])
    checar(`${r.padEnd(36)} abre p/ financeiro@`, podeAcessar(FIN, r), true)
}

// ── 7. JSON inválido também cai em fail-open (não trava ninguém) ───────────
{
  const { podeAcessar, rbacAtivo } = await carregar('{ isto não é json }')
  console.log('\n7. JSON inválido (fail-open, com log de erro):')
  checar('rbacAtivo() === false', rbacAtivo(), false)
  checar('/dashboard                     abre p/ financeiro@', podeAcessar(FIN, '/dashboard'), true)
}

// ── 8. admin também atravessa ──────────────────────────────────────────────
{
  const { podeAcessar } = await carregar('{"adm@x.com":["admin"],"fin@x.com":["financeiro"]}')
  console.log('\n8. Outros perfis:')
  checar('admin       abre /dashboard/medicina  ', podeAcessar('adm@x.com', '/dashboard/medicina'), true)
  checar('financeiro  NÃO abre /dashboard/financeiro (F1: só executivo/admin)',
         podeAcessar('fin@x.com', '/dashboard/financeiro'), false)
}

// ── 9. Área da rota (mensagem da tela) ─────────────────────────────────────
{
  const { areaDaRota } = await carregar(JSON_PROD)
  console.log('\n9. Área para a mensagem de bloqueio:')
  checar("medicina → 'saude'", areaDaRota('/dashboard/medicina') === 'saude', true)
  checar("comercial → null (texto genérico)", areaDaRota('/dashboard/comercial') === null, true)
}

console.log(falhas === 0 ? '\n✅ todos os casos passaram' : `\n❌ ${falhas} caso(s) falharam`)
process.exit(falhas === 0 ? 0 : 1)
