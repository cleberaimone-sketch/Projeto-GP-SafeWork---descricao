// Prioridade de pagamento no "Caixa do Dia".
// "Intocável" = pessoas que dependem do pagamento (folha, PJ/honorários,
// estagiários, pró-labore, encargos de folha). Essas nunca vão pra fila de
// "adiar". Regra automática por nome de categoria; a tabela
// categorias_prioridade sobrepõe (o usuário liga/desliga por categoria), e a
// decisão por lançamento (prioridade_override) sobrepõe pontualmente.

function norm(s: string | null | undefined): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

// Casa com honorários profissionais/clínicas, mão de obra, estágio, pró-labore,
// salários e encargos (FGTS, INSS folha), benefícios (VT/VR), provisões de
// férias, rescisão, plano de saúde.
const RE_INTOCAVEL = /honorari|mao de obra|estagi|pro.?labore|salari|\bfgts\b|beneficio|provisoes com ferias|rescis|plano de saude/

/** Regra automática (a semente): a categoria é de pessoas? */
export function ehIntocavelPorRegra(categoria: string | null | undefined): boolean {
  return RE_INTOCAVEL.test(norm(categoria))
}

/**
 * Prioridade efetiva de uma categoria: override do usuário se existir, senão a
 * regra automática. `overrides` = mapa categoria → intocavel (da tabela).
 */
export function ehIntocavelCategoria(
  categoria: string | null | undefined,
  overrides: Record<string, boolean>,
): boolean {
  const cat = categoria ?? ''
  if (Object.prototype.hasOwnProperty.call(overrides, cat)) return overrides[cat]
  return ehIntocavelPorRegra(cat)
}

/**
 * Prioridade efetiva de um lançamento: override pontual da decisão vence tudo;
 * senão cai na regra da categoria.
 */
export function ehIntocavelLancamento(
  categoria: string | null | undefined,
  overrides: Record<string, boolean>,
  prioridadeOverride: string | null | undefined,
): boolean {
  if (prioridadeOverride === 'intocavel') return true
  if (prioridadeOverride === 'normal') return false
  return ehIntocavelCategoria(categoria, overrides)
}
