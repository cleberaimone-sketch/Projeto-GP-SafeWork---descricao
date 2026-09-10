// Prazo médio de recebimento e de pagamento.
//
// O DSO não é calculável com o dado que temos, e é importante que a tela diga
// isso em vez de mostrar um número bonito.
//
// O sync do Conta Azul grava `data_pagamento = data_competencia` quando o
// título está ACQUITTED (app/api/conta-azul/sync/route.ts). Não é a data em que
// o cliente pagou: é a data da venda. O efeito aparece no dado —
//
//   receitas quitadas, últimos 180 dias:  5.299 antes do vencimento
//                                         1.203 no dia
//                                             1 depois
//
// — e ninguém recebe 448 dias adiantado, que é o mínimo observado. Para venda
// parcelada, a competência é a da venda e o vencimento é o da parcela, então a
// diferença é negativa por construção.
//
// As duas implementações anteriores respondiam a isso do jeito errado:
// `filter(d => d >= 0)` descartava 81% da amostra, e `Math.max(0, diff)`
// achatava tudo em zero — a tela mostrava "DSO 0 dias", que se lê como cobrança
// impecável. `data_emissao`, que daria a régua certa, é nula nos 56.258
// lançamentos da base.
//
// Despesa é outra história: 2.719 de 3.312 são pagas no próprio dia do
// vencimento e só 574 antes. Ali a data se comporta como pagamento, e o DPO
// vale.

export type Prazo =
  | { dias: number; amostra: number }
  | { indisponivel: true; motivo: string }

type Titulo = { data_pagamento?: string | null; data_vencimento?: string | null }

const MINIMO_AMOSTRA = 4

function diasEntre(pagamento: string, vencimento: string): number {
  return Math.floor(
    (new Date(pagamento + 'T00:00:00').getTime() - new Date(vencimento + 'T00:00:00').getTime()) / 86_400_000,
  )
}

/**
 * Prazo médio de PAGAMENTO das despesas — dias entre vencer e pagar.
 * Negativo significa pagamento antecipado e entra na média como está.
 */
export function calcularDPO(despesasQuitadas: Titulo[]): Prazo {
  const dias = despesasQuitadas
    .filter(l => l.data_pagamento && l.data_vencimento)
    .map(l => diasEntre(l.data_pagamento!, l.data_vencimento!))
    .filter(d => Math.abs(d) < 365)
  if (dias.length < MINIMO_AMOSTRA) {
    return { indisponivel: true, motivo: `só ${dias.length} despesa(s) quitada(s) no período` }
  }
  return { dias: Math.round(dias.reduce((s, d) => s + d, 0) / dias.length), amostra: dias.length }
}

/**
 * Prazo médio de RECEBIMENTO.
 *
 * Devolve indisponível sempre que a amostra tiver a assinatura do campo
 * trocado — a maioria dos títulos "pagos" antes de vencer. Preferir dizer que
 * não se sabe a publicar um DSO de zero dia que ninguém pode auditar.
 */
export function calcularDSO(receitasQuitadas: Titulo[]): Prazo {
  const dias = receitasQuitadas
    .filter(l => l.data_pagamento && l.data_vencimento)
    .map(l => diasEntre(l.data_pagamento!, l.data_vencimento!))
  if (dias.length < MINIMO_AMOSTRA) {
    return { indisponivel: true, motivo: `só ${dias.length} recebimento(s) no período` }
  }
  const antes = dias.filter(d => d < 0).length
  if (antes / dias.length > 0.2) {
    return {
      indisponivel: true,
      motivo: `${Math.round((antes / dias.length) * 100)}% dos títulos constam pagos ANTES do vencimento — ` +
        'o sync grava data_pagamento = data de competência da venda, não a do recebimento. ' +
        'Sem a data real de crédito, o prazo de recebimento não é calculável.',
    }
  }
  return { dias: Math.round(dias.reduce((s, d) => s + d, 0) / dias.length), amostra: dias.length }
}
