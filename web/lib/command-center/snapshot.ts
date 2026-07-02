// GP Command Center — SNAPSHOT estático (P0 read-only)
// ============================================================
// Fonte ÚNICA de dados da V0. Valores AGREGADOS já documentados no diagnóstico.
// NÃO contém dado pessoal (CPF/CNPJ individual, e-mail, telefone, payload).
// NÃO faz chamada externa, query em banco, sync ou autenticação.
// Substituível no futuro por leitura dinâmica — a interface (types.ts) permanece.
// Referências: docs/DIAGNOSTICO_DADOS_LEGADOS_LEITURA_INTEGRAL.md,
//              docs/INCIDENTE_CONTA_AZUL_OAUTH_INVALID_GRANT_2026-06-26.md

import type { CommandCenterSnapshot } from './types'

export const SNAPSHOT: CommandCenterSnapshot = {
  geradoEm: '26/06/2026',
  ambiente: 'diagnóstico / read-only',
  statusGeral: 'CRITICO',

  sinaisCriticos: [
    { rotulo: 'Conta Azul — OAuth inválido em 11/11 empresas', nivel: 'CRITICO' },
    { rotulo: 'Leitura de pessoas (1.3-B) — bloqueada por decisão', nivel: 'BLOQUEADO' },
    { rotulo: 'Financeiro sem vínculo a cliente (cliente_id)', nivel: 'CRITICO' },
  ],

  visaoGeral: [
    {
      titulo: 'Empresas SOC',
      valor: '2.423',
      selo: 'REAL',
      fonte: 'SOC (ExportaDados, read-only)',
      atualizadoEm: '26/06/2026',
      explicacao: 'Empresas-clientes cadastradas no SOC.',
      acao: 'Base para reconciliação por CNPJ.',
    },
    {
      titulo: 'Empresas SOC com CNPJ',
      valor: '2.179',
      selo: 'REAL',
      fonte: 'SOC (ExportaDados, read-only)',
      atualizadoEm: '26/06/2026',
      explicacao: '~90% das empresas têm CNPJ — chave de cruzamento.',
      acao: '244 sem CNPJ exigem validação humana.',
    },
    {
      titulo: 'Empresas com exames (30d)',
      valor: '446',
      selo: 'REAL',
      fonte: 'SOC (máscara de exames)',
      atualizadoEm: '26/06/2026',
      explicacao: 'Empresas com exames nos últimos 30 dias.',
    },
    {
      titulo: 'Exames últimos 30 dias',
      valor: '11.184',
      selo: 'REAL',
      fonte: 'SOC (máscara de exames)',
      atualizadoEm: '26/06/2026',
      explicacao: 'Produção operacional de SST (1 linha por exame).',
    },
    {
      titulo: 'Funcionários ativos',
      valor: '≈ 46.338 (amostra)',
      selo: 'ESTIMADO',
      fonte: 'SOC — amostra estratificada',
      atualizadoEm: '26/06/2026',
      explicacao: 'Contagem detalhada de amostra; total exige varredura. NÚMERO DE VIDAS não é usado como headcount.',
      acao: 'Varredura completa pendente (job dedicado).',
    },
    {
      titulo: 'Receita do mês',
      valor: '—',
      selo: 'BLOQUEADO',
      fonte: 'Conta Azul (sync parado)',
      atualizadoEm: 'último dado ~14/06/2026',
      explicacao: 'Indisponível enquanto o OAuth do Conta Azul estiver quebrado. Não exibir como atual.',
      acao: 'Reautorizar Conta Azul.',
    },
    {
      titulo: 'Saldo bancário (Pluggy)',
      valor: 'Parcial — 1 conta',
      selo: 'REAL',
      fonte: 'Pluggy (Open Finance)',
      atualizadoEm: '26/06/2026',
      explicacao: 'Fonte independente do Conta Azul; cobertura ainda parcial.',
      acao: 'Conectar as demais contas.',
    },
    {
      titulo: 'Clientes com Golden Record',
      valor: '—',
      selo: 'INDISPONIVEL',
      fonte: '— (não criado)',
      atualizadoEm: '—',
      explicacao: 'Cadastro mestre de clientes ainda não existe.',
      acao: 'Reconciliar SOC × Conta Azul (fase futura).',
    },
  ],

  integracoes: [
    { nome: 'SOC',              status: 'OK',       detalhe: 'dados read-only disponíveis',           ultimoSucesso: '26/06/2026' },
    { nome: 'Conta Azul',       status: 'CRITICO',  detalhe: 'OAuth invalid_grant em 11/11 empresas', ultimoSucesso: '~14/06/2026', ultimoErro: '26/06/2026' },
    { nome: 'Pluggy',           status: 'ATENCAO',  detalhe: '1 conta conectada (parcial)',           ultimoSucesso: '26/06/2026' },
    { nome: 'D4Sign',           status: 'PAUSADO',  detalhe: 'não integrado' },
    { nome: 'SigeCloud',        status: 'PAUSADO',  detalhe: 'não inventariado' },
    { nome: 'RD Station',       status: 'PAUSADO',  detalhe: 'não integrado' },
    { nome: 'GP OS Hub',        status: 'ATENCAO',  detalhe: 'publica eventos; read-models pendentes' },
    { nome: 'ERP Core',         status: 'FUNDACAO', detalhe: 'em construção' },
    { nome: 'SST Core',         status: 'FUNDACAO', detalhe: 'em construção' },
    { nome: 'CRM Core',         status: 'FUNDACAO', detalhe: 'em construção' },
    { nome: 'Client Portal',    status: 'PAUSADO',  detalhe: 'em construção / fonte a definir' },
    { nome: 'Produtos Digitais',status: 'PAUSADO',  detalhe: 'fonte a definir' },
  ],

  incidentes: [
    {
      titulo: 'Conta Azul — OAuth invalid_grant',
      severidade: 'CRITICO',
      fonte: 'sync_log',
      impacto: 'Sync financeiro parado (~12 dias); receita/contas bloqueadas.',
      proximoPasso: 'Reautorizar 1 empresa pelo fluxo oficial.',
      dono: 'Cleber / Plata',
      status: 'Aberto',
    },
    {
      titulo: 'Leitura de pessoas (1.3-B) bloqueada',
      severidade: 'BLOQUEADO',
      fonte: 'decisão formal',
      impacto: 'Sem CNPJ do cliente para cruzar com o SOC.',
      proximoPasso: 'Aguardar reautorização do OAuth.',
      dono: 'Cleber',
      status: 'Aberto',
    },
    {
      titulo: 'Golden Record inexistente',
      severidade: 'ATENCAO',
      fonte: 'diagnóstico',
      impacto: 'Sem cadastro mestre de cliente consolidado.',
      proximoPasso: 'Reconciliar SOC × Conta Azul (fase futura).',
      dono: '—',
      status: 'Aberto',
    },
    {
      titulo: 'Financeiro sem cliente_id',
      severidade: 'CRITICO',
      fonte: 'banco',
      impacto: 'Análise financeira por cliente inviável.',
      proximoPasso: 'Vincular na fase de reconciliação.',
      dono: '—',
      status: 'Aberto',
    },
    {
      titulo: 'SOC — NÚMERO DE VIDAS não confiável',
      severidade: 'ATENCAO',
      fonte: 'SOC',
      impacto: 'Campo inflado por empresas guarda-chuva; não usar como headcount.',
      proximoPasso: 'Usar contagem detalhada (amostra/varredura).',
      dono: 'Lari',
      status: 'Conhecido',
    },
  ],

  saudeDados: [
    { metrica: 'Empresas do grupo sem CNPJ (banco local)', valor: '11 / 11', severidade: 'CRITICO',  observacao: 'preencher CNPJ das empresas operacionais' },
    { metrica: 'Tabela de clientes',                        valor: 'vazia (0)', severidade: 'CRITICO',  observacao: 'sem cadastro mestre' },
    { metrica: 'Lançamentos financeiros sem cliente_id',    valor: '49.143',  severidade: 'CRITICO',  observacao: '100% sem vínculo a cliente' },
    { metrica: 'Empresas SOC sem CNPJ',                     valor: '244',     severidade: 'ATENCAO',  observacao: 'validação humana no cruzamento' },
    { metrica: 'Empresas SOC guarda-chuva',                 valor: '≈ 13',    severidade: 'ATENCAO',  observacao: 'NÚMERO DE VIDAS irreal' },
    { metrica: 'Conta Azul — último sync',                  valor: '~14/06',  severidade: 'CRITICO',  observacao: 'dado financeiro defasado' },
    { metrica: 'Dados D4Sign',                              valor: '—',       severidade: 'PAUSADO',  observacao: 'não integrado' },
    { metrica: 'Dados SigeCloud',                           valor: '—',       severidade: 'PAUSADO',  observacao: 'não inventariado' },
  ],
}
