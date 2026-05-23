// ============================================================
// RH — Dados de acompanhamento mensal (custo de pessoal + indicadores DP)
// e Organograma dos funcionários.
//
// Fonte: planilha manual de RH (Salário/Indicadores-DP/RESUMO) +
// organograma físico (fotos da parede, capturadas em 2026-05-06).
//
// COMO ATUALIZAR MENSALMENTE:
//   1. Acrescente o mês em MESES e o valor em cada série de custo.
//   2. Atualize INDICADORES_DP com contratações/desligamentos do mês.
//   3. Ajuste o ORGANOGRAMA quando houver entrada/saída de pessoas.
// ============================================================

export const ANO_REFERENCIA = 2026

// Baseline histórico — custo de pessoal "interno" da planilha manual de RH (RESUMO).
// Mantido só como referência; o dashboard usa dados reais do Conta Azul.
export const CUSTO_2025_PLANILHA_TOTAL = 2140179  // R$/ano (média ~178k/mês)
export const CUSTO_2024_PLANILHA_TOTAL = 0        // não consolidado

// ─── Indicadores de DP (Departamento Pessoal) ───────────────────────────────
export const INDICADORES_DP = {
  headcountFinal: 66,    // Quantidade final de funcionários
  contratacoes: 11,      // no período acumulado
  desligamentos: 7,      // no período acumulado
}

// Turnover = média(adm, deslig) / headcount  (fórmula clássica de RH)
export const TAXA_TURNOVER =
  ((INDICADORES_DP.contratacoes + INDICADORES_DP.desligamentos) / 2 / INDICADORES_DP.headcountFinal) * 100

// ─── Organograma (extraído das fotos da parede, 2026-05-06) ─────────────────
export type Pessoa = { nome: string; cargo: string; destaque?: 'gerente' | 'supervisor' }
export type Setor = {
  nome: string
  grupo: 'Gestão' | 'Corporativo' | 'Medicina' | 'Clínicas'
  cor: string          // classe tailwind de cor de destaque
  pessoas: Pessoa[]
}

export const ORGANOGRAMA: Setor[] = [
  {
    nome: 'Gestão Geral', grupo: 'Gestão', cor: 'slate',
    pessoas: [{ nome: 'Josiane Klaus', cargo: 'Gerente Geral', destaque: 'gerente' }],
  },
  {
    nome: 'RH / Gestão de Pessoas', grupo: 'Corporativo', cor: 'teal',
    pessoas: [
      { nome: 'Leticia Perico', cargo: 'Gerente de Gestão de Pessoas', destaque: 'gerente' },
      { nome: 'Eduarda Colussi', cargo: 'Supervisora de RH', destaque: 'supervisor' },
      { nome: 'Luis Oliveira', cargo: 'Suporte TI' },
      { nome: 'Lucia Ap', cargo: 'Auxiliar de Limpeza' },
    ],
  },
  {
    nome: 'Financeiro', grupo: 'Corporativo', cor: 'amber',
    pessoas: [
      { nome: 'Evelyn Lavyne', cargo: 'Supervisora Financeiro', destaque: 'supervisor' },
      { nome: 'Maria Leticia', cargo: 'Financeiro' },
      { nome: 'Murilo Gonçalves', cargo: 'Financeiro' },
      { nome: 'Gabriele C. Teles', cargo: 'Financeiro' },
      { nome: 'Giovanna Planelis', cargo: 'Estágio BI Financeiro' },
    ],
  },
  {
    nome: 'Comercial', grupo: 'Corporativo', cor: 'purple',
    pessoas: [
      { nome: 'Luis Rabelo', cargo: 'Gerente Comercial', destaque: 'gerente' },
      { nome: 'Nathielli Vargas', cargo: 'Supervisora Comercial', destaque: 'supervisor' },
      { nome: 'Lucas Botelho', cargo: 'Comercial' },
      { nome: 'Douglas J. de Andrade', cargo: 'Comercial' },
      { nome: 'Greicy Furtado', cargo: 'Comercial' },
      { nome: 'Juan de Lima', cargo: 'Credenciamento' },
      { nome: 'Weidiane', cargo: 'ADM Comercial' },
      { nome: 'Luccas Facundo', cargo: 'Analista de Marketing' },
    ],
  },
  {
    nome: 'Engenharia', grupo: 'Corporativo', cor: 'orange',
    pessoas: [
      { nome: 'Jhonatan Almeida', cargo: 'R.T. Engenharia', destaque: 'gerente' },
      { nome: 'Diego Chies', cargo: 'Coord. de Seg. do Trabalho', destaque: 'gerente' },
      { nome: 'Carla de Lima', cargo: 'Supervisora Adm de Engenharia', destaque: 'supervisor' },
      { nome: 'Eduardo de Oliveira', cargo: 'TST Londrina' },
      { nome: 'Tiago Maiorano', cargo: 'TST Foz' },
      { nome: 'Hillyard Adrian', cargo: 'TST' },
      { nome: 'Dani Dahmer', cargo: 'Free PAC' },
      { nome: 'Marcelo R.', cargo: 'Estágio Adm de Engenharia' },
      { nome: 'Maria Jaciara', cargo: 'Auxiliar Adm de Engenharia' },
      { nome: 'Janaina Flores', cargo: 'Auxiliar Adm de Engenharia' },
    ],
  },
  {
    nome: 'E-Social', grupo: 'Corporativo', cor: 'sky',
    pessoas: [{ nome: 'Bruna Amarante', cargo: 'Supervisora Administrativo', destaque: 'supervisor' }],
  },
  {
    nome: 'SafeHelp', grupo: 'Corporativo', cor: 'blue',
    pessoas: [
      { nome: 'Carlos Eduardo', cargo: 'Gerente de Processos', destaque: 'gerente' },
      { nome: 'Lucas Alamini', cargo: 'Estágio Processos' },
      { nome: 'Huender de Lima', cargo: 'Estágio Processos' },
      { nome: 'Rafael Vieira', cargo: 'Estágio Processos' },
      { nome: 'Herick', cargo: 'Estágio Processos' },
      { nome: 'Kiria', cargo: 'Estágio Processos' },
    ],
  },
  {
    nome: 'SafeT — Treinamentos', grupo: 'Corporativo', cor: 'green',
    pessoas: [
      { nome: 'Petra S. Machado', cargo: 'Comercial' },
      { nome: 'Moha', cargo: 'Treinamentos' },
    ],
  },
  {
    nome: 'Agendamentos (Safe+)', grupo: 'Corporativo', cor: 'orange',
    pessoas: [
      { nome: 'Eduardo Forlin', cargo: 'Agendamentos' },
      { nome: 'Igor da Costa', cargo: 'Agendamentos' },
      { nome: 'Bruna Vitória', cargo: 'Agendamentos' },
    ],
  },
  {
    nome: 'Medicina', grupo: 'Medicina', cor: 'emerald',
    pessoas: [{ nome: 'Larissa Vargas', cargo: 'Gerente de Medicina', destaque: 'gerente' }],
  },
  {
    nome: 'Rede Credenciada', grupo: 'Medicina', cor: 'emerald',
    pessoas: [
      { nome: 'Jiani Jung', cargo: 'Supervisora Santa Helena', destaque: 'supervisor' },
      { nome: 'Leticia Rosso', cargo: 'Liberação de exames' },
    ],
  },
  {
    nome: 'New Life', grupo: 'Medicina', cor: 'emerald',
    pessoas: [{ nome: 'Geyci de Carvalho', cargo: 'Estagiária Medicina' }],
  },
  {
    nome: 'Clínica Medianeira', grupo: 'Clínicas', cor: 'emerald',
    pessoas: [
      { nome: 'Camila Jung', cargo: 'Exames' },
      { nome: 'Ana Paula', cargo: 'Fonoaudióloga' },
      { nome: 'Dra. Gabriela', cargo: 'Médica' },
      { nome: 'Dra. Andressa', cargo: 'Médica' },
      { nome: 'Felipe Sbardelongo', cargo: 'Psicólogo' },
      { nome: 'Gabrielly Carvalho', cargo: 'Exames' },
      { nome: 'Roseli da Silva', cargo: 'Triagem' },
      { nome: 'Adrielly', cargo: 'Free terças SMI' },
    ],
  },
  {
    nome: 'Clínica Foz do Iguaçu', grupo: 'Clínicas', cor: 'emerald',
    pessoas: [
      { nome: 'Aline Gabriele', cargo: 'Recepção' },
      { nome: 'Camila Biazus', cargo: 'Médica' },
      { nome: 'Claudia', cargo: 'Fonoaudióloga' },
      { nome: 'Janyse', cargo: 'Fonoaudióloga' },
      { nome: 'Elis Regina', cargo: 'Psicóloga' },
      { nome: 'Tais Carvalho', cargo: 'Exames' },
      { nome: 'Aline Becker', cargo: 'Triagem' },
    ],
  },
  {
    nome: 'Clínica Santa Helena', grupo: 'Clínicas', cor: 'emerald',
    pessoas: [
      { nome: 'Ana Caroline', cargo: 'Recepção' },
      { nome: 'Natieli Simoneti', cargo: 'Psicóloga' },
      { nome: 'Jessica', cargo: 'Fonoaudióloga' },
      { nome: 'Loreni', cargo: 'Limpeza' },
    ],
  },
  {
    nome: 'Clínica Londrina', grupo: 'Clínicas', cor: 'emerald',
    pessoas: [
      { nome: 'Milena Pereira', cargo: 'Recepção' },
      { nome: 'Vinicius', cargo: 'Médico' },
      { nome: 'Enfª Natália', cargo: 'R.T. COREN' },
      { nome: 'Gesminy', cargo: 'Fonoaudióloga' },
      { nome: 'Cristiane', cargo: 'Psicóloga' },
      { nome: 'Débora Farias', cargo: 'Exames' },
    ],
  },
]

// Total de pessoas no organograma
export const TOTAL_PESSOAS = ORGANOGRAMA.reduce((s, st) => s + st.pessoas.length, 0)
