// ============================================================
// MEDICINA — Histórico anual de atendimentos por unidade e tipo
//
// Fonte: planilha manual "Controle Atendimentos - Unidades - SafeWork"
//   (1crzqtxUE1dAz_OnLZcZrWHnw-_1xnZa2 · abas 2022, 2023, 2024, 2025, 2026)
//
// ATENÇÃO: arquivo TEMPORÁRIO. Quando o SOC entregar dados reais e a
// integração ExportaDados estiver consolidada (Lari + Dieguito com dados
// confiáveis em produção), esta planilha será descontinuada e a fonte
// passará a ser exclusivamente o SOC. Por enquanto serve como histórico
// retrospectivo e como referência para conferência cruzada de 2026.
//
// COMO ATUALIZAR (até virar SOC-only):
//   - Mensalmente: atualize MEDICINA_2026 com os novos meses da planilha.
//   - Última extração: 2026-05-28 (referente a Jan-Abr/2026).
// ============================================================

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
  | 'Hemograma'
  | 'Glicemia'
  | 'Raio X Tórax'
  | 'EPF'
  | 'Coprocultura'

export interface ResumoAnualMedicina {
  ano: number
  status: 'fechado' | 'em_curso' | 'pendente'
  consultas_total: number
  consultas_mensais: number[]   // 12 posições (Jan-Dez). Zero onde não há dado
  exames_por_tipo: Partial<Record<TipoExame, number>>
  atendimentos_por_unidade: Partial<Record<UnidadeMedicina, number>>
  observacao?: string
}

// ─── 2023 — PENDENTE ──────────────────────────────────────────────────────
// Aba existe na planilha mas ainda não foi importada (prioridade baixa —
// 2024 e 2025 dão tendência suficiente).
export const MEDICINA_2023: ResumoAnualMedicina = {
  ano: 2023,
  status: 'pendente',
  consultas_total: 0,
  consultas_mensais: new Array(12).fill(0),
  exames_por_tipo: {},
  atendimentos_por_unidade: {},
  observacao: 'Aba 2023 existe — extração pendente.',
}

// ─── 2024 — ANO FECHADO ──────────────────────────────────────────────────
// Extração 2026-05-28. Soma direta das células das unidades (todos os meses).
export const MEDICINA_2024: ResumoAnualMedicina = {
  ano: 2024,
  status: 'fechado',
  consultas_total: 33204,
  consultas_mensais: [2172, 2256, 2152, 2656, 2705, 2479, 3000, 4822, 2669, 3036, 2978, 2279],
  exames_por_tipo: {
    'Consultas':        33204,
    'Acuidade Visual':  14871,
    'Hemograma':        12745,
    'Audiometria':       5415,
    'ECG':               4711,
    'Glicemia':          4539,
    'EEG':               3746,
    'Espirometria':      3593,
    'Raio X Tórax':      2842,
    'EPF':               1590,
    'Coprocultura':      1431,
  },
  atendimentos_por_unidade: {
    'Medianeira':        9391,
    'Londrina':          7401,
    'Foz do Iguaçu':     6813,
    'New Life':          4305,
    'Santa Helena':      3176,
    'Rede Credenciada':  2118,
  },
  observacao: 'Pico em agosto (4.822). Medianeira lidera com 28% da rede; Londrina e Foz quase empatados em 2º.',
}

// ─── 2025 — ANO FECHADO (com Outubro zerado na planilha) ─────────────────
// Extração 2026-05-28. Outubro/2025 sem dados — provável esquecimento da
// equipe. Verificar com Larissa quando possível.
export const MEDICINA_2025: ResumoAnualMedicina = {
  ano: 2025,
  status: 'fechado',
  consultas_total: 31483,
  consultas_mensais: [3070, 3246, 2726, 2614, 2506, 2750, 2657, 4126, 3287, 0, 2464, 2037],
  exames_por_tipo: {
    'Consultas':        31483,
    'Hemograma':        11535,
    'Acuidade Visual':  10993,
    'Audiometria':       4281,
    'ECG':               3725,
    'Glicemia':          3642,
    'EEG':               2986,
    'Espirometria':      2531,
    'Raio X Tórax':      2273,
    'EPF':               1395,
    'Coprocultura':      1247,
  },
  atendimentos_por_unidade: {
    'Foz do Iguaçu':     7118,
    'Londrina':          7100,
    'Medianeira':        6934,
    'New Life':          4599,
    'Rede Credenciada':  2882,
    'Santa Helena':      2261,
    'São Miguel':         589,
  },
  observacao: 'Queda de 5,2% vs 2024. Outubro com zero na planilha (a verificar). New Life ganhou força (4.599). São Miguel entrou em operação.',
}

// ─── 2026 — EM CURSO (Jan-Abr extraídos · 2026-05-28) ────────────────────
// Comparação cruzada com SOC quando integração estiver ativa.
export const MEDICINA_2026: ResumoAnualMedicina = {
  ano: 2026,
  status: 'em_curso',
  consultas_total: 12382,   // Jan-Abr
  consultas_mensais: [3065, 3003, 3255, 3059, 0, 0, 0, 0, 0, 0, 0, 0],
  exames_por_tipo: {
    'Consultas':        12382,
    'Hemograma':         2574,
    'Acuidade Visual':   2046,
    'Audiometria':       1346,
    'Glicemia':           805,
    'ECG':                804,
    'EEG':                611,
    'Espirometria':       513,
    'Raio X Tórax':       474,
    'EPF':                340,
    'Coprocultura':       318,
  },
  atendimentos_por_unidade: {
    'Foz do Iguaçu':     3087,
    'Medianeira':        2597,
    'Londrina':          2413,
    'New Life':          2122,
    'Rede Credenciada':  1066,
    'Santa Helena':       827,
    'São Miguel':         270,
  },
  observacao: 'Jan-Abr 2026 — média 3.095/mês (vs 2.623 em 2025 e 2.767 em 2024). Se mantiver ritmo, ano fecharia ~37k consultas (crescimento ~18% vs 2025). Foz lidera neste quadrimestre.',
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

// ─── Comparação com SOC (será preenchida quando integração estiver ativa) ─
//
// Quando o SOC entregar dados confiáveis para 2026, o cruzamento ficará
// assim: compara planilha (manual) × SOC (sistema). Divergências = ponto
// de atenção que LARI deve sinalizar.
export interface ConferenciaSOCxPlanilha {
  ano: number
  mes: number
  consultas_planilha: number
  consultas_soc: number | null   // null = SOC ainda não consultado
  divergencia_abs: number | null
  divergencia_pct: number | null
}
