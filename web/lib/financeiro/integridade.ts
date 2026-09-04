// Integridade dos dados financeiros — checagens que perguntam "esse número é
// confiável?" antes de qualquer tela perguntar "esse número é bom?".
//
// A primeira delas nasceu em 04/09/2026: as deduções pararam de entrar na base
// a partir de fevereiro daquele ano. As seis unidades operacionais saíram de
// 9,8%-13,5% de carga tributária sobre a receita em 2025 para 0,2%-1,5% em
// 2026; a CSLL, que somou R$ 490 mil em 2025, não teve um lançamento sequer no
// exercício. Não era eficiência: eram ~R$ 529 mil de imposto ainda não
// lançados no Conta Azul, e toda margem de 2026 aparecia alta demais por causa
// disso.

import type { SupabaseClient } from '@supabase/supabase-js'

/** Abaixo disso o ano anterior não teve carga suficiente para servir de régua. */
export const CARGA_MINIMA_COMPARAVEL = 3
/**
 * E acima disso a régua é que está torta. O grupo roda entre 10% e 13,5% de
 * carga; o teto dá folga larga sobre isso e ainda fica abaixo do teto legal do
 * Simples. Dois casos reais da base passariam sem ele:
 *
 *   · a Safe+ de 2024 marca 93,8% — receita quase nula com imposto lançado
 *   · o acumulado de 2024 até abril marca 26,4%, porque fevereiro daquele ano
 *     tem R$ 955 de receita contra R$ 16.244 de deduções: é imposto de 2023
 *     vencendo num mês em que a operação ainda não existia
 *
 * O segundo é o que ensina o número. Com teto de 30% ele passava, e 2025
 * aparecia "sem imposto" comparado a uma base que é resíduo contábil.
 */
export const CARGA_MAXIMA_COMPARAVEL = 20
/** Menos da metade da carga anterior é queda que alíquota nenhuma explica. */
export const QUEDA_SUSPEITA = 0.5
/** Abaixo disso o alerta custa mais atenção do que vale. */
export const FALTANTE_MINIMO = 1000
/**
 * Mês isolado não serve de amostra: em 2025 a carga do grupo oscila entre 6,0%
 * (novembro) e 26,3% (dezembro), porque imposto entra em bloco — DAS acumulado,
 * parcelamento, retenção fora de época. Num recorte curto, essa irregularidade
 * vira "tributo faltando" sem nada estar faltando. Em três meses ou mais ela se
 * dilui.
 */
export const MESES_MINIMOS_COMPARAVEIS = 3

export type CargaTributaria = {
  cargaAtual: number
  cargaAnterior: number
  /** Quanto faltaria para a carga do período bater com a do ano anterior. */
  faltante: number
}

export type AlertaTributos = CargaTributaria & {
  ano: number
  anoAnterior: number
  meses: number
}

/**
 * Compara a carga tributária de dois períodos equivalentes. Devolve null quando
 * não há o que alertar — inclusive quando a comparação não se sustenta.
 *
 * Alíquota não desaparece: se a carga do período despenca frente à do mesmo
 * recorte do ano anterior, o que caiu foi o registro, não o imposto.
 */
export function avaliarCarga(
  receitaAtual: number, deducoesAtual: number,
  receitaAnterior: number, deducoesAnterior: number,
): CargaTributaria | null {
  if (receitaAtual <= 0 || receitaAnterior <= 0) return null

  const cargaAtual = (deducoesAtual / receitaAtual) * 100
  const cargaAnterior = (deducoesAnterior / receitaAnterior) * 100

  if (cargaAnterior < CARGA_MINIMA_COMPARAVEL) return null
  if (cargaAnterior > CARGA_MAXIMA_COMPARAVEL) return null
  if (cargaAtual >= cargaAnterior * QUEDA_SUSPEITA) return null

  const faltante = receitaAtual * (cargaAnterior / 100) - deducoesAtual
  if (faltante < FALTANTE_MINIMO) return null

  return { cargaAtual, cargaAnterior, faltante }
}

type RpcRow = { empresa_id: string; mes: number; linha: string; total: number }

/**
 * Mesma checagem, para uma tela que trabalha com intervalo de datas.
 *
 * Usa a fn_dre_unidade_mensal, que já agrega no banco — carregar lançamento por
 * lançamento de dois exercícios só para somar duas linhas seria caro à toa.
 *
 * Sempre por competência (data de vencimento), mesmo quando a tela está em
 * regime de caixa: a pergunta aqui é se o imposto foi LANÇADO, não se foi pago.
 *
 * E sempre sobre o ACUMULADO do exercício até o fim do período pedido, não
 * sobre o período isolado. O Cockpit abre no mês corrente, e num mês em curso o
 * imposto ainda não foi lançado por definição — perguntar do mês daria alarme
 * todo dia 1º. A pergunta que importa é se o EXERCÍCIO está com imposto
 * lançado, e o texto do alerta diz qual recorte usou.
 */
export async function cargaTributariaDoPeriodo(
  supabase: SupabaseClient,
  { de, ate, empresaId }: { de: string; ate: string; empresaId?: string | null },
): Promise<AlertaTributos | null> {
  const ano = Number(de.slice(0, 4))
  // Um intervalo que cruza anos não tem "mesmo período do ano anterior" óbvio;
  // é melhor não alertar do que alertar sobre um recorte que não existe.
  if (!Number.isInteger(ano) || ano !== Number(ate.slice(0, 4))) return null

  const mesAte = Number(ate.slice(5, 7))
  if (!Number.isInteger(mesAte) || mesAte < MESES_MINIMOS_COMPARAVEIS) return null
  const mesDe = 1

  const [atual, anterior] = await Promise.all([
    supabase.rpc('fn_dre_unidade_mensal', { p_ano: ano }),
    supabase.rpc('fn_dre_unidade_mensal', { p_ano: ano - 1 }),
  ])
  if (atual.error || anterior.error) return null

  const somar = (linhas: unknown, alvo: string) =>
    ((linhas ?? []) as RpcRow[]).reduce((acc, r) => {
      if (r.linha !== alvo) return acc
      if (r.mes < mesDe || r.mes > mesAte) return acc
      if (empresaId && r.empresa_id !== empresaId) return acc
      // Receita vem positiva e dedução negativa; aqui só interessa o módulo.
      return acc + Math.abs(Number(r.total ?? 0))
    }, 0)

  const avaliacao = avaliarCarga(
    somar(atual.data, 'receita_bruta'), somar(atual.data, 'deducoes'),
    somar(anterior.data, 'receita_bruta'), somar(anterior.data, 'deducoes'),
  )
  if (!avaliacao) return null

  return { ...avaliacao, ano, anoAnterior: ano - 1, meses: mesAte - mesDe + 1 }
}
