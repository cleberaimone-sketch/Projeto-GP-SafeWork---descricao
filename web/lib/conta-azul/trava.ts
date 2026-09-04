// Trava de renovação do refresh_token, entre instâncias.
//
// O client deduplica refresh concorrente por empresa, mas só dentro do
// processo — um Map em memória. Na Vercel cada invocação pode ser outra
// lambda: duas leem o mesmo refresh_token, ambas chamam o Cognito, a primeira
// rotaciona e a segunda recebe invalid_grant. A empresa queima até
// reautorização manual.
//
// A trava vive na linha do token, e é um UPDATE condicional: atômico no
// Postgres, porque a transação concorrente espera o lock da linha e reavalia o
// WHERE depois do commit da primeira. Quem perde PULA a empresa em vez de
// disputar o Cognito — disputar é o que queima.

/** "Destravado". Sentinela no lugar de NULL para a condição ser um único .lt(). */
export const TRAVA_LIVRE = '1970-01-01T00:00:00.000Z'

/**
 * Validade da trava se ninguém a liberar. Curta o bastante para a Vercel matar
 * a função no meio não prender a empresa até o dia seguinte, e longa o
 * bastante para cobrir o sync da maior empresa (hoje ~20s).
 */
export const TRAVA_RENOVACAO_MS = 5 * 60 * 1000

/** O mínimo do supabase-js que esta trava usa — o resto não interessa aqui. */
export type ClienteTrava = {
  from: (tabela: string) => {
    update: (valores: Record<string, unknown>) => {
      eq: (coluna: string, valor: string) => {
        lt: (coluna: string, valor: string) => {
          select: (colunas: string) => Promise<{ data: { refresh_token?: string | null }[] | null }>
        }
        // Usado só para liberar, onde não há condição de tempo.
        then?: unknown
      } & Promise<unknown>
    }
  }
}

export type ResultadoTrava<T> =
  | { status: 'ok'; valor: T }
  | { status: 'ocupado' }
  | { status: 'sem-token' }

export async function liberarTrava(supabase: ClienteTrava, empresaNome: string) {
  try {
    await supabase.from('conta_azul_tokens')
      .update({ renovando_ate: TRAVA_LIVRE })
      .eq('empresa_nome', empresaNome)
  } catch (e) {
    // Trava presa expira sozinha; falhar aqui não pode derrubar o sync.
    console.error(`[ContaAzul] falha ao liberar trava de ${empresaNome} (expira sozinha):`, e)
  }
}

/**
 * Executa `usar` com o refresh_token da empresa, garantindo que nenhuma outra
 * execução esteja renovando o mesmo token ao mesmo tempo.
 *
 * `agoraMs` entra por parâmetro para o teste conseguir simular trava expirada
 * sem esperar cinco minutos.
 */
export async function comTravaDeRenovacao<T>(
  supabase: ClienteTrava,
  empresaNome: string,
  agoraMs: number,
  usar: (refreshToken: string) => Promise<T>,
): Promise<ResultadoTrava<T>> {
  const agoraISO = new Date(agoraMs).toISOString()
  const travaAte = new Date(agoraMs + TRAVA_RENOVACAO_MS).toISOString()

  const { data } = await supabase.from('conta_azul_tokens')
    .update({ renovando_ate: travaAte })
    .eq('empresa_nome', empresaNome)
    .lt('renovando_ate', agoraISO)
    .select('refresh_token')

  const linha = data?.[0]
  if (!linha) return { status: 'ocupado' }

  if (!linha.refresh_token) {
    await liberarTrava(supabase, empresaNome)
    return { status: 'sem-token' }
  }

  try {
    return { status: 'ok', valor: await usar(linha.refresh_token) }
  } finally {
    // Sempre libera, inclusive quando `usar` lança: uma trava presa impediria
    // a empresa de sincronizar até expirar, e o custo de errar para este lado
    // é dado velho.
    await liberarTrava(supabase, empresaNome)
  }
}
