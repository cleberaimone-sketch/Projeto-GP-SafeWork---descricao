// Lançamentos atípicos que torcem a comparação ano a ano.
//
// Em jan-set/2026 a receita do grupo aparecia 8,7% abaixo de 2025. Não caiu: a
// SafeT tem dois lançamentos de "Venda 9200 - Treinamentos" em jan e fev/2025,
// R$ 412.855 e R$ 411.825, contra R$ 38-73 mil de todos os outros meses dela.
//
// Só que tirar o atípico de um ano e não do outro inventa um número igualmente
// falso: 2026 tem R$ 537 mil de vendas grandes da Safe+ em agosto e setembro.
// Por isso as três leituras convivem aqui, e a tela mostra as três:
//
//   bruta       −8,7%   o que aconteceu no caixa
//   sem 2025    +6,1%   o que a comparação diria sem o contrato de treinamento
//   recorrente  −4,4%   os dois anos limpos — o negócio de todo mês
//
// Nenhuma é "a certa". A primeira responde quanto entrou, a terceira responde
// se a operação está crescendo. Mostrar só a primeira, como estava, faz ler
// queda onde houve alta.

import type { SupabaseClient } from '@supabase/supabase-js'

export type Extraordinario = {
  empresa_id: string
  nome_empresa: string
  data_vencimento: string
  categoria: string
  descricao: string | null
  valor: number
  vezes_a_mediana: number
  share_receita_empresa: number
}

export type ComparacaoReceita = {
  ano: number
  anoBase: number
  ateMes: number
  bruta: { atual: number; base: number; variacao: number | null }
  recorrente: { atual: number; base: number; variacao: number | null }
  extraordinariosAtual: Extraordinario[]
  extraordinariosBase: Extraordinario[]
  /** A leitura bruta e a recorrente apontam para lados opostos. */
  inverteSinal: boolean
  /** Vale mostrar: alguma diferença material entre as duas leituras. */
  relevante: boolean
}

/** Abaixo disto a diferença entre as leituras é ruído e não merece a tela. */
const DIFERENCA_MINIMA_PP = 3

function variacao(atual: number, base: number): number | null {
  if (base <= 0) return null
  return ((atual - base) / base) * 100
}

export async function compararReceita(
  db: SupabaseClient,
  { ano, anoBase, ateMes, empresaId = null }:
  { ano: number; anoBase: number; ateMes: number; empresaId?: string | null },
): Promise<ComparacaoReceita | null> {
  const linhaReceita = async (a: number) => {
    const { data, error } = await db.rpc('fn_dre_categoria_mensal', { p_ano: a, p_empresa_id: empresaId })
    // Erro aqui não pode virar "receita zero" — sem os dois anos não há
    // comparação nenhuma a fazer, e a tela some em vez de mentir.
    if (error) throw new Error(`fn_dre_categoria_mensal(${a}): ${error.message}`)
    type Linha = { linha: string; mes: number; total: number }
    return ((data ?? []) as Linha[])
      .filter(l => l.linha === 'receita_bruta' && l.mes <= ateMes)
      .reduce((s, l) => s + Number(l.total ?? 0), 0)
  }

  const atipicos = async (a: number) => {
    const { data, error } = await db.rpc('fn_lancamentos_extraordinarios', {
      p_ano: a, p_empresa_id: empresaId, p_ate_mes: ateMes,
    })
    if (error) throw new Error(`fn_lancamentos_extraordinarios(${a}): ${error.message}`)
    return ((data ?? []) as Extraordinario[]).map(e => ({ ...e, valor: Number(e.valor) }))
  }

  const [recAtual, recBase, extraAtual, extraBase] = await Promise.all([
    linhaReceita(ano), linhaReceita(anoBase), atipicos(ano), atipicos(anoBase),
  ])

  const somaAtual = extraAtual.reduce((s, e) => s + e.valor, 0)
  const somaBase  = extraBase.reduce((s, e) => s + e.valor, 0)

  const bruta = { atual: recAtual, base: recBase, variacao: variacao(recAtual, recBase) }
  const recorrente = {
    atual: recAtual - somaAtual,
    base: recBase - somaBase,
    variacao: variacao(recAtual - somaAtual, recBase - somaBase),
  }

  if (bruta.variacao === null || recorrente.variacao === null) return null

  const inverteSinal = Math.sign(bruta.variacao) !== Math.sign(recorrente.variacao)
  const distancia = Math.abs(bruta.variacao - recorrente.variacao)

  return {
    ano, anoBase, ateMes, bruta, recorrente,
    extraordinariosAtual: extraAtual, extraordinariosBase: extraBase,
    inverteSinal,
    relevante: inverteSinal || distancia >= DIFERENCA_MINIMA_PP,
  }
}
