// Quanto da inadimplência vem de um bloco só.
//
// Em setembro de 2026 o cockpit mostrava R$ 914.277 de inadimplência em 485
// títulos. Dezoito deles — todos da Safe+, todos vencendo entre 30/08 e 01/09,
// todos do mesmo projeto — somavam R$ 740.398: 81% do total. Tirando esse
// bloco, a inadimplência do grupo é R$ 173.880.
//
// E o dinheiro tinha entrado: faltava dar baixa no Conta Azul. O KPI mais
// visível do painel apontava cinco vezes o problema real, e o número sozinho
// não tinha como dizer isso — R$ 914 mil espalhados por 485 clientes e R$ 914
// mil concentrados em um são situações opostas, com a mesma aparência.

export type TituloVencido = {
  empresa: string | null
  valor: number | null
  data_vencimento: string | null
}

export type Concentracao = {
  total: number
  titulos: number
  /** O maior bloco: mesma empresa, vencimentos na mesma semana. */
  maiorBloco: {
    empresa: string
    titulos: number
    valor: number
    participacao: number
    de: string
    ate: string
  } | null
}

/** A partir daqui o bloco domina o indicador e precisa aparecer. */
export const CONCENTRACAO_RELEVANTE = 0.3

/** Vencimentos dentro desta janela contam como o mesmo evento de faturamento. */
const DIAS_DA_JANELA = 7

export function analisarConcentracao(titulos: TituloVencido[]): Concentracao {
  const validos = titulos.filter(t => t.empresa && t.data_vencimento && (t.valor ?? 0) > 0)
  const total = validos.reduce((s, t) => s + (t.valor ?? 0), 0)
  if (total <= 0) return { total: 0, titulos: 0, maiorBloco: null }

  // Cada título vira o começo de uma janela candidata; a maior soma vence. São
  // centenas de títulos, não milhares, então o custo quadrático não incomoda.
  let melhor: Concentracao['maiorBloco'] = null
  for (const inicio of validos) {
    const t0 = new Date(inicio.data_vencimento! + 'T00:00:00').getTime()
    const doBloco = validos.filter(t => {
      if (t.empresa !== inicio.empresa) return false
      const d = new Date(t.data_vencimento! + 'T00:00:00').getTime()
      return d >= t0 && d < t0 + DIAS_DA_JANELA * 86_400_000
    })
    const valor = doBloco.reduce((s, t) => s + (t.valor ?? 0), 0)
    if (melhor && valor <= melhor.valor) continue
    const datas = doBloco.map(t => t.data_vencimento!).sort()
    melhor = {
      empresa: inicio.empresa!,
      titulos: doBloco.length,
      valor,
      participacao: valor / total,
      de: datas[0],
      ate: datas[datas.length - 1],
    }
  }

  return { total, titulos: validos.length, maiorBloco: melhor }
}
