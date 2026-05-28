// ============================================================
// PROCESSOS / SAFEHELP — Dados estáticos do escopo de Carlitos
//
// Fonte: organograma + roadmap interno (ClickUp pendente de integração)
// Atualizar manualmente até a integração ClickUp ficar pronta.
// ============================================================

export type StatusProduto = 'ativo' | 'beta' | 'mvp' | 'planejado' | 'pausado'

export interface ProdutoSafeHelp {
  nome: string
  descricao: string
  status: StatusProduto
  responsavel?: string
  notas?: string
}

// Produtos SafeHelp — vertical digital SST do grupo
export const PRODUTOS_SAFEHELP: ProdutoSafeHelp[] = [
  {
    nome: 'SafeChat',
    descricao: 'Atendimento via WhatsApp para colaboradores (consulta ASO, agendamento, dúvidas SST)',
    status: 'planejado',
    responsavel: 'Carlitos + estagiários',
    notas: 'Z-API/Evolution API. Backlog priorizado pelo Cleber.',
  },
  {
    nome: 'SafeDocs',
    descricao: 'Assinatura digital + repositório de documentos SST (ASOs, PCMSO, PGR, contratos)',
    status: 'planejado',
    responsavel: 'Carlitos + estagiários',
    notas: 'Integração D4sign para assinatura. ASOs vêm do SOC.',
  },
  {
    nome: 'SafeApp',
    descricao: 'App nativo do colaborador — consulta ASO próprio, agendamento, notificações de vencimento',
    status: 'planejado',
    responsavel: 'Carlitos + estagiários',
    notas: 'Fase 3 do roadmap. Posterior ao SafeChat e SafeDocs.',
  },
]

export interface ProcessoAtivo {
  nome: string
  area: string
  status: 'em_dia' | 'atencao' | 'critico'
  ultimaRevisao?: string
  notas?: string
}

// Mapa de processos críticos da operação que o Carlitos monitora
export const PROCESSOS_OPERACIONAIS: ProcessoAtivo[] = [
  {
    nome: 'Onboarding de colaborador',
    area: 'RH + Medicina',
    status: 'atencao',
    notas: 'Tempo médio 53 dias — meta 30. Le e Lari coordenam.',
  },
  {
    nome: 'Renovação contratos clientes',
    area: 'Comercial + Financeiro',
    status: 'em_dia',
    notas: 'RD Station + D4sign. Luizito monitora pipeline.',
  },
  {
    nome: 'Emissão de ASO + envio eSocial',
    area: 'Medicina',
    status: 'em_dia',
    notas: 'Lari opera. SOC + S-2220.',
  },
  {
    nome: 'Fechamento financeiro mensal',
    area: 'Financeiro',
    status: 'em_dia',
    notas: 'Evelyn fecha. Conta Azul (migração Unisyst em andamento).',
  },
  {
    nome: 'Migração Conta Azul → Unisyst',
    area: 'Financeiro + Tech',
    status: 'atencao',
    notas: 'Em andamento. Carlitos acompanha bloqueios técnicos.',
  },
]

// Equipe sob Carlitos (estagiários + tech)
export const EQUIPE_TECH_CARLITOS = [
  'Estagiário 1 — Front-end / dashboards',
  'Estagiário 2 — Front-end / mobile',
  'Estagiário 3 — Back-end / integrações',
  'Estagiário 4 — Back-end / dados',
  'Estagiário 5 — QA / processos',
]

// Indicadores de saúde do time (estimados — atualizar com dados reais quando ClickUp integrar)
export const INDICADORES_TECH = {
  estagiariosAtivos: 5,
  velocidadeTimeSemanal: 'em apuração — sem ClickUp integrado ainda',
  bugsAbertos: 'sem visibilidade central — pulverizado',
  releasesUltimo30d: 'sem tracking central — releases ad-hoc',
  observacao: 'Sem ClickUp integrado, indicadores ficam qualitativos. Carlitos reporta semanalmente pro Cleber.',
}
