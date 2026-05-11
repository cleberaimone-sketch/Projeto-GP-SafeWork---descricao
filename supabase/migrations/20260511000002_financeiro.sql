-- ============================================================
-- GP SafeWork — Migration 002: Financeiro
-- FIN·01 a FIN·09 — Fonte: Conta Azul / Unisyst
-- ============================================================

-- ============================================================
-- LANÇAMENTOS FINANCEIROS (A/R + A/P unificados)
-- ============================================================
CREATE TABLE lancamentos_financeiros (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  cliente_id        UUID REFERENCES clientes(id) ON DELETE SET NULL,
  centro_custo_id   UUID REFERENCES centros_custo(id) ON DELETE SET NULL,
  tipo              TEXT NOT NULL,                -- 'receita' | 'despesa'
  categoria         TEXT,
  -- ex: 'honorario_medico' | 'exame' | 'treinamento' | 'salario' | 'aluguel' | 'insumo'
  descricao         TEXT,
  valor             DECIMAL(12,2) NOT NULL,
  data_emissao      DATE,
  data_vencimento   DATE NOT NULL,
  data_pagamento    DATE,
  status            TEXT NOT NULL DEFAULT 'pendente',
                                                  -- 'pendente' | 'pago' | 'vencido' | 'cancelado'
  numero_documento  TEXT,                         -- NF, boleto, etc.
  observacao        TEXT,
  fonte             TEXT NOT NULL DEFAULT 'manual',
                                                  -- 'conta_azul' | 'unisyst' | 'manual'
  fonte_id          TEXT,                         -- ID no sistema de origem
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lancamentos_empresa       ON lancamentos_financeiros(empresa_id);
CREATE INDEX idx_lancamentos_cliente       ON lancamentos_financeiros(cliente_id);
CREATE INDEX idx_lancamentos_vencimento    ON lancamentos_financeiros(data_vencimento);
CREATE INDEX idx_lancamentos_status        ON lancamentos_financeiros(status);
CREATE INDEX idx_lancamentos_tipo          ON lancamentos_financeiros(tipo);

CREATE TRIGGER set_updated_at_lancamentos
  BEFORE UPDATE ON lancamentos_financeiros
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- SALDOS BANCÁRIOS (FIN·02)
-- ============================================================
CREATE TABLE saldos_bancarios (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  banco         TEXT NOT NULL,
  agencia       TEXT,
  conta         TEXT,
  saldo         DECIMAL(12,2) NOT NULL,
  data_referencia DATE NOT NULL,
  fonte         TEXT DEFAULT 'manual',            -- 'pluggy' | 'open_finance' | 'manual'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_saldos_empresa      ON saldos_bancarios(empresa_id);
CREATE INDEX idx_saldos_data         ON saldos_bancarios(data_referencia DESC);
CREATE UNIQUE INDEX idx_saldos_unico ON saldos_bancarios(empresa_id, banco, conta, data_referencia);

-- ============================================================
-- HONORÁRIOS MEDICINA (FIN·05)
-- ============================================================
CREATE TABLE honorarios_medicina (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  funcionario_id    UUID REFERENCES funcionarios(id) ON DELETE SET NULL,
  profissional_nome TEXT,
  especialidade     TEXT,                         -- 'medico' | 'psicologo' | 'fono' | 'enfermeiro'
  competencia       DATE NOT NULL,                -- primeiro dia do mês de referência
  valor_bruto       DECIMAL(10,2) NOT NULL,
  valor_liquido     DECIMAL(10,2),
  numero_nf         TEXT,
  status            TEXT DEFAULT 'pendente',      -- 'pendente' | 'pago'
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_honorarios_empresa     ON honorarios_medicina(empresa_id);
CREATE INDEX idx_honorarios_competencia ON honorarios_medicina(competencia DESC);

CREATE TRIGGER set_updated_at_honorarios
  BEFORE UPDATE ON honorarios_medicina
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
