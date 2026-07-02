// GP Command Center — tipos da V0 (P0 estático / read-only)
// Sem dependência de banco/API. Apenas formas de dados agregados.

// Selo de confiabilidade — obrigatório em todo indicador.
export type Selo = 'REAL' | 'ESTIMADO' | 'INDISPONIVEL' | 'BLOQUEADO'

// Nível de status/sinal (semáforo executivo).
export type StatusNivel =
  | 'OK'         // 🟢 regular
  | 'ATENCAO'    // 🟡 acompanhar
  | 'CRITICO'    // 🔴 exige ação
  | 'PAUSADO'    // ⚪ sem integração ativa
  | 'BLOQUEADO'  // ⛔ suspenso por decisão/incidente
  | 'FUNDACAO'   // 🔵 módulo em construção

// Card de indicador (Visão Geral).
export interface Indicador {
  titulo: string
  valor: string          // sempre string formatada (ex.: "2.423", "—")
  selo: Selo
  fonte: string
  atualizadoEm: string   // data/estado da leitura (texto, ex.: "26/06/2026" ou "~14/06/2026")
  explicacao: string
  acao?: string          // próximo passo (texto; nunca botão de ação crítica)
}

// Linha de status de integração.
export interface Integracao {
  nome: string
  status: StatusNivel
  detalhe: string
  ultimoSucesso?: string
  ultimoErro?: string
}

// Incidente operacional.
export interface Incidente {
  titulo: string
  severidade: StatusNivel
  fonte: string
  impacto: string
  proximoPasso: string
  dono: string
  status: string         // ex.: "Aberto", "Conhecido"
}

// Verificação de saúde dos dados.
export interface VerificacaoSaude {
  metrica: string
  valor: string
  severidade: StatusNivel
  observacao: string
}

// Sinal crítico (faixa do topo).
export interface Sinal {
  rotulo: string
  nivel: StatusNivel
}

// Snapshot completo da V0 (estático).
export interface CommandCenterSnapshot {
  geradoEm: string                 // data do snapshot/diagnóstico (texto)
  ambiente: string                 // ex.: "diagnóstico / read-only"
  statusGeral: StatusNivel
  sinaisCriticos: Sinal[]
  visaoGeral: Indicador[]
  integracoes: Integracao[]
  incidentes: Incidente[]
  saudeDados: VerificacaoSaude[]
}
