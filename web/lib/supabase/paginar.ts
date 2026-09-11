// Leitura paginada de RPC.
//
// O PostgREST devolve no máximo 1.000 linhas por requisição e NÃO avisa quando
// corta: a resposta chega com status 200 e o array simplesmente termina. Já
// mordeu este projeto duas vezes —
//
//   fn_soc_empresas_ativas — 294 empresas ficavam de fora da carga do SOC;
//   fn_dre_categoria_mensal — 1.023 linhas em 2025, 23 subcontas somindo. O
//     Demonstrativo Mensal não fechava a soma das subcontas com a linha, e a
//     comparação de receita da Plata devolveu +170% onde o real é -8,7%,
//     porque metade da base de 2025 não chegou.
//
// A função chamada precisa ter ORDER BY determinístico. Sem ele o Postgres não
// promete ordem entre execuções, e paginar repete uma linha e pula outra.

import type { SupabaseClient } from '@supabase/supabase-js'

/** Abaixo do teto do PostgREST, para o corte nunca ser o dele. */
const TAMANHO_PAGINA = 500

export async function lerRpcPaginado<T>(
  db: SupabaseClient,
  nome: string,
  params: Record<string, unknown>,
  { tamanhoPagina = TAMANHO_PAGINA, maxPaginas = 200 }: { tamanhoPagina?: number; maxPaginas?: number } = {},
): Promise<T[]> {
  const todas: T[] = []
  for (let pagina = 0; pagina < maxPaginas; pagina++) {
    const de = pagina * tamanhoPagina
    const { data, error } = await db.rpc(nome, params).range(de, de + tamanhoPagina - 1)
    // Erro não pode virar lista curta: quem chama somaria o que veio e trataria
    // como total, que é a falha silenciosa que esta função existe para evitar.
    if (error) throw new Error(`${nome} (página ${pagina + 1}): ${error.message}`)
    const linhas = (data ?? []) as T[]
    todas.push(...linhas)
    if (linhas.length < tamanhoPagina) return todas
  }
  throw new Error(
    `${nome}: passou de ${maxPaginas} páginas (${maxPaginas * tamanhoPagina} linhas). ` +
    'Ou o filtro está largo demais, ou a função não tem ORDER BY estável e a paginação não termina.',
  )
}

/**
 * Lê uma query já montada em páginas, até o fim.
 *
 * O mesmo teto de 1.000 linhas vale para `.from().select()`, e ali é ainda
 * mais fácil de esquecer — não há RPC para auditar, só uma query que parece
 * completa. `metas_orcamentarias` do exercício de 2026 tem 3.291 linhas, e o
 * aviso de origem do orçamento (escrito um dia antes desta função) somava as
 * 1.000 primeiras achando que via o documento inteiro.
 *
 * A query precisa de `.order()` por coluna determinística. O uso é:
 *
 *     const metas = await lerPaginado<Meta>(
 *       (de, ate) => sb.from('metas_orcamentarias').select('*')
 *         .eq('ano', ano).order('id').range(de, ate))
 */
export async function lerPaginado<T>(
  montar: (de: number, ate: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  { tamanhoPagina = TAMANHO_PAGINA, maxPaginas = 200 }: { tamanhoPagina?: number; maxPaginas?: number } = {},
): Promise<T[]> {
  const todas: T[] = []
  for (let pagina = 0; pagina < maxPaginas; pagina++) {
    const de = pagina * tamanhoPagina
    const { data, error } = await montar(de, de + tamanhoPagina - 1)
    if (error) throw new Error(`leitura paginada (página ${pagina + 1}): ${error.message}`)
    const linhas = (data ?? []) as T[]
    todas.push(...linhas)
    if (linhas.length < tamanhoPagina) return todas
  }
  throw new Error(
    `leitura paginada: passou de ${maxPaginas} páginas (${maxPaginas * tamanhoPagina} linhas). ` +
    'Ou o filtro está largo demais, ou falta um .order() estável e a paginação não termina.',
  )
}
