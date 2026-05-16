-- ============================================================
-- Metas orçamentárias — plano anual com granularidade mensal
-- ============================================================
-- Estrutura: 1 linha = 1 meta (empresa × ano × mês × categoria)
-- - empresa_id NULL = meta consolidada do grupo
-- - tipo: receita ou despesa
-- - valor_meta: valor planejado

CREATE TABLE IF NOT EXISTS metas_orcamentarias (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid REFERENCES empresas(id) ON DELETE CASCADE,
  ano           int NOT NULL CHECK (ano >= 2024 AND ano <= 2100),
  mes           int NOT NULL CHECK (mes BETWEEN 1 AND 12),
  categoria     text NOT NULL,
  tipo          text NOT NULL CHECK (tipo IN ('receita', 'despesa')),
  valor_meta    numeric(15,2) NOT NULL DEFAULT 0,
  observacao    text,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

-- Constraint única: uma empresa não pode ter 2 metas para mesma combinação
-- Usa COALESCE para tratar NULL (consolidado) como caso distinto
CREATE UNIQUE INDEX IF NOT EXISTS idx_metas_unico
  ON metas_orcamentarias (COALESCE(empresa_id, '00000000-0000-0000-0000-000000000000'::uuid), ano, mes, categoria);

CREATE INDEX IF NOT EXISTS idx_metas_ano_empresa
  ON metas_orcamentarias (ano, empresa_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON metas_orcamentarias TO anon, authenticated, service_role;

COMMENT ON TABLE metas_orcamentarias IS 'Plano orçamentário: metas mensais por empresa, ano, mês e categoria do plano de contas.';
COMMENT ON COLUMN metas_orcamentarias.empresa_id IS 'NULL = meta consolidada do grupo';
COMMENT ON COLUMN metas_orcamentarias.categoria IS 'Categoria do plano de contas (ex: 1.04.01 Treinamentos, 4.01.02 Honorários...)';
