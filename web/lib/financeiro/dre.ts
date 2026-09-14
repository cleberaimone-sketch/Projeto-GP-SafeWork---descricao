// Estrutura do DRE — uma definição só, para as três telas que o mostram.
//
// Demonstrativo, Unidades e Acompanhamento montavam cada uma a sua lista de
// linhas operacionais e não operacionais. Elas divergiam: a de Unidades não
// tinha 'emprestimos_terceiros' nem 'emprestimos_outros', então o CAIXA daquela
// tela ficava R$ 88 mil acima do da outra em 2025, sem que nada explicasse a
// diferença. Listas iguais escritas em três lugares só permanecem iguais por
// acaso.
//
// A ordem é a do demonstrativo em papel, que é como o Cleber lê.

/** Linhas que compõem o Lucro Líquido. */
export const LINHAS_OPERACIONAIS = [
  'receita_bruta',
  'deducoes',
  'custo_servicos',
  'despesas_admin',
  'despesas_financeiras',
] as const

/**
 * Linhas que entram no CAIXA mas não no Lucro.
 *
 * 'sem_classificacao' recolhe o que não começa com dígito do plano de contas.
 * Entra aqui, e não no Lucro, porque o dinheiro se moveu de fato mas não dá
 * para afirmar que é operacional — antes de 14/09/2026 essas linhas sumiam do
 * DRE inteiro, R$ 252.747 só em 2025.
 */
export const LINHAS_NAO_OPERACIONAIS = [
  'investimentos',
  'emprestimos_socios',
  'emprestimos_terceiros',
  'emprestimos_outros',
  'parc_contas_antigas',
  'parc_contas_atuais',
  'parc_lucro_presumido',
  'parc_outros',
  'sem_classificacao',
] as const

export type LinhaDreChave =
  | (typeof LINHAS_OPERACIONAIS)[number]
  | (typeof LINHAS_NAO_OPERACIONAIS)[number]

/** Rótulos longos — os da planilha, com o número da conta à frente. */
export const ROTULO_LINHA: Record<LinhaDreChave, string> = {
  receita_bruta:        '01T Receita Bruta de Vendas',
  deducoes:             '02 Deduções da Receita Bruta',
  custo_servicos:       '03 Custo dos Serviços realizados',
  despesas_admin:       '04.2 Despesas Administrativas',
  despesas_financeiras: '05 Despesas Financ.',
  investimentos:        '06.1 Investimentos em Imobilizado',
  emprestimos_socios:   '7.01.03 Empréstimos de Sócios',
  emprestimos_terceiros: '7.01.02 Empréstimos de Terceiros',
  emprestimos_outros:   '7 Empréstimos (outros)',
  parc_contas_antigas:  '8.01.02 Parc. contas antigas',
  parc_contas_atuais:   '8.01.03 Parc. contas atuais',
  parc_lucro_presumido: '8.01.04 Parc.do Lucro Presumido',
  parc_outros:          '8 Parcelamentos (outros)',
  sem_classificacao:    'Sem classificação (fora do plano de contas)',
}

/** Rótulos curtos, para eixo de gráfico e cabeçalho estreito. */
export const ROTULO_CURTO: Record<LinhaDreChave, string> = {
  receita_bruta:        'R.B.',
  deducoes:             'D.',
  custo_servicos:       'C.S.',
  despesas_admin:       'D.A.',
  despesas_financeiras: 'D.F.',
  investimentos:        'I.I.',
  emprestimos_socios:   'E.S.',
  emprestimos_terceiros: 'E.T.',
  emprestimos_outros:   'E.O.',
  parc_contas_antigas:  'P.C.A.',
  parc_contas_atuais:   'P.C.',
  parc_lucro_presumido: 'P.L.P.',
  parc_outros:          'P.O.',
  sem_classificacao:    'S/C',
}
