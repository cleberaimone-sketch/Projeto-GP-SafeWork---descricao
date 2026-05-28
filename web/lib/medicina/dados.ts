// ============================================================
// MEDICINA — Histórico anual de atendimentos por unidade e tipo
//
// Fonte: planilha manual "Controle Atendimentos - Unidades - SafeWork"
//   (1crzqtxUE1dAz_OnLZcZrWHnw-_1xnZa2 · abas 2023, 2024, 2025, 2026)
//
// COMO ATUALIZAR:
//   - Mensalmente: atualize ANO_ATUAL com novos valores mensais.
//   - Anualmente: feche o ano anterior em HISTORICO_ANUAL e abra o próximo.
//   - Dados em tempo real (vencidos / agendados) vêm do SOC, não daqui.
// ============================================================
//
// Esses dados são o HISTÓRICO consolidado da rede SafeWork (medicina
// ocupacional). Servem para análise de tendência ano a ano, sazonalidade,
// distribuição entre clínicas. Não substituem o SOC (fonte primária de
// ASOs em tempo real); complementam com retrospectiva.

export const MESES_ABREV = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
] as const

export type UnidadeMedicina =
  | 'Medianeira'
  | 'Londrina'
  | 'Santa Helena'
  | 'Foz do Iguaçu'
  | 'Toledo'
  | 'Francisco Beltrão'
  | 'Imbituva'
  | 'São Miguel'
  | 'New Life'
  | 'Rede Credenciada'

export type TipoExame =
  | 'Consultas'
  | 'Acuidade Visual'
  | 'Audiometria'
  | 'Espirometria'
  | 'ECG'
  | 'EEG'

export interface ResumoAnualMedicina {
  ano: number
  status: 'fechado' | 'em_curso' | 'pendente'
  consultas_total: number
  consultas_mensais: number[]   // 12 posições (Jan-Dez). Zero onde não há dado
  exames_por_tipo: Partial<Record<TipoExame, number>>
  atendimentos_por_unidade: Partial<Record<UnidadeMedicina, number>>
  observacao?: string
}

// ─── 2024 — ANO COMPLETO (referência) ──────────────────────────────────────
export const MEDICINA_2024: ResumoAnualMedicina = {
  ano: 2024,
  status: 'fechado',
  consultas_total: 12035,
  consultas_mensais: [894, 985, 904, 807, 932, 1013, 826, 1164, 1189, 1013, 1107, 1198],
  exames_por_tipo: {
    'Consultas':        12035,
    'Acuidade Visual':   5754,
    'Audiometria':       2394,
    'ECG':               2109,
    'Espirometria':      1498,
    'EEG':               1491,
  },
  atendimentos_por_unidade: {
    'Medianeira':         6251,
    'Londrina':           2242,
    'Santa Helena':       2036,
    'Foz do Iguaçu':       624,
    'Toledo':              328,
    'Imbituva':            139,
    'Francisco Beltrão':   138,
  },
  observacao: 'Medianeira concentra ~52% dos atendimentos da rede.',
}

// ─── 2023 — ANO COMPLETO ───────────────────────────────────────────────────
// PENDENTE: aguardando extração da aba 2023 da planilha.
// Estrutura preparada — atualizar quando os dados forem importados.
export const MEDICINA_2023: ResumoAnualMedicina = {
  ano: 2023,
  status: 'pendente',
  consultas_total: 0,
  consultas_mensais: new Array(12).fill(0),
  exames_por_tipo: {},
  atendimentos_por_unidade: {},
  observacao: 'Dados pendentes de importação da aba 2023.',
}

// ─── 2025 — ANO COMPLETO ───────────────────────────────────────────────────
// PENDENTE: aguardando extração da aba 2025 da planilha.
export const MEDICINA_2025: ResumoAnualMedicina = {
  ano: 2025,
  status: 'pendente',
  consultas_total: 0,
  consultas_mensais: new Array(12).fill(0),
  exames_por_tipo: {},
  atendimentos_por_unidade: {},
  observacao: 'Dados pendentes de importação da aba 2025.',
}

// ─── 2026 — EM CURSO (ano atual) ───────────────────────────────────────────
// Atualizar mensalmente. Dados parciais até maio/2026.
export const MEDICINA_2026: ResumoAnualMedicina = {
  ano: 2026,
  status: 'em_curso',
  consultas_total: 0,
  consultas_mensais: new Array(12).fill(0),
  exames_por_tipo: {},
  atendimentos_por_unidade: {},
  observacao: 'Dados parciais — atualizar mensalmente conforme planilha.',
}

// ─── Helpers de consolidação ───────────────────────────────────────────────

export const HISTORICO_MEDICINA: ResumoAnualMedicina[] = [
  MEDICINA_2023,
  MEDICINA_2024,
  MEDICINA_2025,
  MEDICINA_2026,
]

export function variacaoConsultas(anoAtual: number, anoAnterior: number): number {
  if (anoAnterior <= 0) return 0
  return ((anoAtual - anoAnterior) / anoAnterior) * 100
}

export function topUnidades(
  resumo: ResumoAnualMedicina,
  limite = 5,
): Array<{ unidade: UnidadeMedicina; atendimentos: number; pct: number }> {
  const total = Object.values(resumo.atendimentos_por_unidade).reduce((a, b) => a + b, 0)
  return Object.entries(resumo.atendimentos_por_unidade)
    .map(([unidade, atendimentos]) => ({
      unidade: unidade as UnidadeMedicina,
      atendimentos: atendimentos!,
      pct: total > 0 ? (atendimentos! / total) * 100 : 0,
    }))
    .sort((a, b) => b.atendimentos - a.atendimentos)
    .slice(0, limite)
}

export function mediaMensal(consultasMensais: number[]): number {
  const meses = consultasMensais.filter(v => v > 0).length
  if (meses === 0) return 0
  return consultasMensais.reduce((a, b) => a + b, 0) / meses
}
