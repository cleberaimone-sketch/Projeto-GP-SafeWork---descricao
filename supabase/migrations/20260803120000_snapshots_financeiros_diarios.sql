-- Snapshot diário da saúde financeira do grupo.
-- Gravado 1x/dia pelo cron /api/financeiro/snapshot-diario (07:30 UTC, após o
-- sync do Conta Azul das 06:00). Alimenta o gráfico "Evolução Diária" do
-- dashboard financeiro e a análise diária da Plata → LUI.
--
-- Indicadores em JANELA MÓVEL de 30 dias (linha comparável dia a dia,
-- sem o "reset" do início de mês) + acumulado do mês + posições do dia.
-- Números seguem os MESMOS filtros do dashboard (RPCs fn_financeiro_*):
-- sem transferências internas, sem não-operacional no resultado.

CREATE TABLE IF NOT EXISTS snapshots_financeiros_diarios (
  data              date        NOT NULL,
  empresa_id        uuid        NULL REFERENCES empresas(id),  -- NULL = consolidado do grupo
  -- Janela móvel 30 dias (competência/vencimento, filtros DRE)
  receita_30d       numeric     NOT NULL DEFAULT 0,
  despesa_30d       numeric     NOT NULL DEFAULT 0,
  margem_30d        numeric     NOT NULL DEFAULT 0,   -- % ((rec-desp)/rec)
  -- Acumulado do mês corrente (1º dia do mês → hoje)
  receita_mes       numeric     NOT NULL DEFAULT 0,
  despesa_mes       numeric     NOT NULL DEFAULT 0,
  -- Posições do dia
  saldo_bancario    numeric     NOT NULL DEFAULT 0,   -- soma v_saldos_ativos
  atrasados_pagar   numeric     NOT NULL DEFAULT 0,   -- vencidas não pagas (últimos 365d)
  atrasados_receber numeric     NOT NULL DEFAULT 0,   -- inadimplência (últimos 365d)
  vence_7d          numeric     NOT NULL DEFAULT 0,   -- a pagar hoje..+7d
  a_receber_7d      numeric     NOT NULL DEFAULT 0,   -- a receber hoje..+7d
  criado_em         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT snapshots_fin_diarios_uniq UNIQUE NULLS NOT DISTINCT (data, empresa_id)
);

CREATE INDEX IF NOT EXISTS idx_snap_fin_data ON snapshots_financeiros_diarios (data DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON snapshots_financeiros_diarios TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
