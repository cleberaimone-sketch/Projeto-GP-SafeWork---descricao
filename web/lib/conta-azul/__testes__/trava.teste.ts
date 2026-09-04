// Testa a trava de renovação do refresh_token contra o cenário que a motivou:
// duas execuções do sync disputando o mesmo token e queimando a empresa.
//
// O fake reproduz a semântica do UPDATE condicional do Postgres — só casa a
// linha se renovando_ate for menor que o instante informado —, que é o que
// torna a trava atômica entre instâncias.

import { comTravaDeRenovacao, TRAVA_LIVRE, TRAVA_RENOVACAO_MS } from '../trava'

let falhas = 0
function checar(nome: string, esperado: unknown, obtido: unknown, extra = '') {
  const ok = JSON.stringify(esperado) === JSON.stringify(obtido)
  if (!ok) falhas++
  console.log(`  ${ok ? '✅' : '❌ FALHOU'}  ${nome}` +
              (ok ? (extra ? ` — ${extra}` : '') : ` — esperava ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`))
}

/** Banco de mentira com uma linha por empresa, imitando o UPDATE ... WHERE. */
function fakeSupabase(linhas: Record<string, { refresh_token: string | null; renovando_ate: string }>) {
  const escritas: string[] = []
  const cliente = {
    from() {
      return {
        update(valores: Record<string, unknown>) {
          let empresa = ''
          const alvo = {
            eq(_col: string, valor: string) {
              empresa = valor
              const semCondicaoDeTempo = {
                lt(_c: string, limite: string) {
                  return {
                    async select() {
                      const linha = linhas[empresa]
                      // A condição do Postgres: só casa se estiver destravado.
                      if (!linha || !(linha.renovando_ate < limite)) return { data: [] }
                      linha.renovando_ate = String(valores.renovando_ate)
                      escritas.push(`trava:${empresa}`)
                      return { data: [{ refresh_token: linha.refresh_token }] }
                    },
                  }
                },
                // Liberar não tem condição de tempo: é um update direto.
                then(resolve: (v: unknown) => void) {
                  const linha = linhas[empresa]
                  if (linha) linha.renovando_ate = String(valores.renovando_ate)
                  escritas.push(`libera:${empresa}`)
                  return Promise.resolve(resolve(undefined))
                },
              }
              return semCondicaoDeTempo
            },
          }
          return alvo
        },
      }
    },
  }
  return { cliente: cliente as never, linhas, escritas }
}

async function main() {
  const AGORA = Date.parse('2026-09-05T03:00:00.000Z')

  console.log('\n=== uma execução sozinha pega a trava e recebe o token ===')
  {
    const { cliente, linhas } = fakeSupabase({
      SafeT: { refresh_token: 'tok-safet', renovando_ate: TRAVA_LIVRE },
    })
    let recebido = ''
    const r = await comTravaDeRenovacao(cliente, 'SafeT', AGORA, async (tk) => { recebido = tk; return 42 })
    checar('status', { status: 'ok', valor: 42 }, r)
    checar('recebeu o refresh_token da linha', 'tok-safet', recebido)
    checar('liberou a trava ao terminar', TRAVA_LIVRE, linhas.SafeT.renovando_ate)
  }

  console.log('\n=== execução concorrente NÃO disputa o Cognito ===')
  {
    const { cliente, linhas } = fakeSupabase({
      SafeT: { refresh_token: 'tok-safet', renovando_ate: TRAVA_LIVRE },
    })
    let chamadasAoCognito = 0
    // A primeira segura a trava enquanto a segunda tenta.
    let liberar!: () => void
    const primeira = comTravaDeRenovacao(cliente, 'SafeT', AGORA, async () => {
      chamadasAoCognito++
      await new Promise<void>(res => { liberar = res })
      return 'primeira'
    })
    const segunda = await comTravaDeRenovacao(cliente, 'SafeT', AGORA, async () => {
      chamadasAoCognito++
      return 'segunda'
    })
    checar('a segunda é recusada', { status: 'ocupado' }, segunda)
    checar('o Cognito foi chamado UMA vez', 1, chamadasAoCognito)
    liberar()
    await primeira
    checar('trava liberada depois que a primeira terminou', TRAVA_LIVRE, linhas.SafeT.renovando_ate)
  }

  console.log('\n=== trava expirada é reaproveitada (função morta no meio) ===')
  {
    // Trava de uma execução que morreu há mais tempo que a validade.
    const presaDesde = new Date(AGORA - TRAVA_RENOVACAO_MS - 1000).toISOString()
    const { cliente } = fakeSupabase({
      SafeT: { refresh_token: 'tok-safet', renovando_ate: presaDesde },
    })
    const r = await comTravaDeRenovacao(cliente, 'SafeT', AGORA, async () => 'ok')
    checar('assume a trava vencida', { status: 'ok', valor: 'ok' }, r)
  }

  console.log('\n=== trava ainda válida de outra execução é respeitada ===')
  {
    const aindaVale = new Date(AGORA + 60_000).toISOString()
    const { cliente } = fakeSupabase({
      SafeT: { refresh_token: 'tok-safet', renovando_ate: aindaVale },
    })
    const r = await comTravaDeRenovacao(cliente, 'SafeT', AGORA, async () => 'nao deveria rodar')
    checar('recusa', { status: 'ocupado' }, r)
  }

  console.log('\n=== erro no sync não deixa a trava presa ===')
  {
    const { cliente, linhas } = fakeSupabase({
      SafeT: { refresh_token: 'tok-safet', renovando_ate: TRAVA_LIVRE },
    })
    let lancou = false
    try {
      await comTravaDeRenovacao(cliente, 'SafeT', AGORA, async () => { throw new Error('invalid_grant') })
    } catch { lancou = true }
    checar('a exceção continua propagando', true, lancou)
    checar('mas a trava foi liberada', TRAVA_LIVRE, linhas.SafeT.renovando_ate)
  }

  console.log('\n=== empresa sem token não fica travada ===')
  {
    const { cliente, linhas } = fakeSupabase({
      SafeT: { refresh_token: null, renovando_ate: TRAVA_LIVRE },
    })
    const r = await comTravaDeRenovacao(cliente, 'SafeT', AGORA, async () => 'nao deveria rodar')
    checar('avisa que não há token', { status: 'sem-token' }, r)
    checar('e libera a trava', TRAVA_LIVRE, linhas.SafeT.renovando_ate)
  }
}

main().then(() => {
  console.log(falhas === 0 ? '\n✅ todos os casos passaram' : `\n❌ ${falhas} caso(s) falharam`)
  process.exit(falhas === 0 ? 0 : 1)
})
