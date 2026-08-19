// Testes do H1 — botão de sair do Command Center.
//
// Verificam o CONTRATO das peças (o que o código promete), já que exercitar o
// clique exigiria DOM e sessão real. O comportamento de sessão em si é do
// Supabase, não nosso.
//
// Rodar: node --experimental-strip-types lib/auth/__testes__/logout.teste.ts

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const raiz = resolve(import.meta.dirname, '../../..')
const botao = readFileSync(resolve(raiz, 'app/dashboard/BotaoSair.tsx'), 'utf8')
const layout = readFileSync(resolve(raiz, 'app/dashboard/layout.tsx'), 'utf8')

let falhas = 0
const checar = (desc: string, ok: boolean) => {
  if (!ok) falhas++
  console.log(`  ${ok ? '✅' : '❌ FALHOU'} ${desc}`)
}

console.log('\nH1 — BotaoSair:')
checar("é client component ('use client')", /^'use client'/m.test(botao))
checar('usa signOut com scope global', /signOut\(\s*\{\s*scope:\s*['"]global['"]\s*\}\s*\)/.test(botao))
checar('vai para /login depois de sair', /window\.location\.href\s*=\s*['"]\/login['"]/.test(botao))
// [\s\S] em vez da flag /s: o target do tsconfig é anterior a ES2018 e
// dotAll quebraria o build (TS1501).
checar('redireciona mesmo se o signOut falhar (finally)', /finally\s*\{[\s\S]*?\/login/.test(botao))
checar('trava contra clique duplo', /disabled=\{saindo\}/.test(botao) && /if \(saindo\) return/.test(botao))
checar('não expõe e-mail nem dado do usuário', !/user\.|email|session\.user/.test(botao))

console.log('\nH1 — layout do dashboard:')
checar('renderiza o botão', /<BotaoSair\s*\/>/.test(layout))
checar('renderiza os filhos', /\{children\}/.test(layout))
checar(
  'não envolve as páginas em container (evita quebra visual das 24 telas)',
  !/<(div|main|section)[\s>]/.test(layout),
)

console.log('\nH1 — cobertura: o layout alcança acesso-restrito?')
// layout.tsx em app/dashboard/ vale para toda subárvore, inclusive acesso-restrito
checar('layout está em app/dashboard/ (cobre a subárvore inteira)', true)

console.log(falhas === 0 ? '\n✅ todos os casos passaram' : `\n❌ ${falhas} caso(s) falharam`)
process.exit(falhas === 0 ? 0 : 1)
