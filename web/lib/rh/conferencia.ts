// Planilha de RH × Conta Azul, mês a mês.
//
// As duas fontes medem a mesma coisa e precisam fechar: a folha roda em outro
// ERP, entra no Conta Azul como pagamento, e a planilha é o controle paralelo
// do DP. Enquanto ninguém comparava, a classificação contou honorários médicos
// e de fono/psicologia como folha e inflou o primeiro semestre de 2026 em
// R$ 247.819 — ninguém percebeu porque os dois números nunca apareceram lado a
// lado.
//
// Diferença de mês isolado é esperada e não indica erro: a planilha fecha por
// competência e o Conta Azul entra por vencimento, então um pagamento que
// atravessa a virada do mês aparece em meses diferentes nas duas. O que importa
// é o ACUMULADO dos meses fechados.

/** Acima disto no acumulado, é escopo — alguma categoria entra num lado só. */
export const DIVERGENCIA_ACEITAVEL_PCT = 6

export type MesConferencia = {
  mes: string
  planilha: number
  contaAzul: number
  diferenca: number
  diferencaPct: number | null
}

export type Conferencia = {
  meses: MesConferencia[]
  acumuladoPlanilha: number
  acumuladoContaAzul: number
  diferencaAcumuladaPct: number | null
  /** O acumulado passou da folga tolerada — provável diferença de escopo. */
  divergente: boolean
}

const ROTULO_MES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export function conferir(planilhaMensal: number[], contaAzulMensal: number[]): Conferencia {
  // Só os meses em que a planilha tem número. Ela é o controle do DP e vai
  // sempre atrás do Conta Azul, que recebe lançamento futuro; comparar um mês
  // que só existe de um lado produz "-100%" e nenhuma informação.
  const meses: MesConferencia[] = []
  for (let i = 0; i < 12; i++) {
    const p = planilhaMensal[i] ?? 0
    if (p <= 0) continue
    const c = contaAzulMensal[i] ?? 0
    meses.push({
      mes: ROTULO_MES[i],
      planilha: p,
      contaAzul: c,
      diferenca: c - p,
      diferencaPct: p > 0 ? ((c - p) / p) * 100 : null,
    })
  }

  const acumuladoPlanilha = meses.reduce((s, m) => s + m.planilha, 0)
  const acumuladoContaAzul = meses.reduce((s, m) => s + m.contaAzul, 0)
  const diferencaAcumuladaPct = acumuladoPlanilha > 0
    ? ((acumuladoContaAzul - acumuladoPlanilha) / acumuladoPlanilha) * 100
    : null

  return {
    meses,
    acumuladoPlanilha,
    acumuladoContaAzul,
    diferencaAcumuladaPct,
    divergente: diferencaAcumuladaPct !== null
      && Math.abs(diferencaAcumuladaPct) > DIVERGENCIA_ACEITAVEL_PCT,
  }
}
