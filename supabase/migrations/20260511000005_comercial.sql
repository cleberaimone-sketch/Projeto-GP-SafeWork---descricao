-- ============================================================
-- GP SafeWork — Migration 005: Comercial
-- COM·01 a COM·06 — Fonte: RD Station, D4sign, Unisyst
-- ============================================================

-- ============================================================
-- CONTRATOS (COM·05, OV·03) — Fonte: D4sign
-- ============================================================
CREATE TABLE contratos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  cliente_id        UUID REFERENCES clientes(id) ON DELETE SET NULL,
  titulo            TEXT NOT NULL,
  tipo_contrato     TEXT,                         -- 'prestacao_servico' | 'locacao' | 'parceria'
  servicos          TEXT[],                       -- ['medicina', 'engenharia', 'treinamento']
  valor_mensal      DECIMAL(10,2),
  valor_anual       DECIMAL(10,2),
  data_assinatura   DATE,
  data_inicio       DATE,
  data_fim          DATE,
  status            TEXT NOT NULL DEFAULT 'ativo',
                                                  -- 'ativo' | 'vencido' | 'cancelado' | 'pendente_assinatura'
  d4sign_uuid       TEXT UNIQUE,                  -- UUID do documento no D4sign
  vendedor_id       UUID REFERENCES funcionarios(id) ON DELETE SET NULL,
  observacao        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contratos_empresa  ON contratos(empresa_id);
CREATE INDEX idx_contratos_cliente  ON contratos(cliente_id);
CREATE INDEX idx_contratos_status   ON contratos(status);
CREATE INDEX idx_contratos_fim      ON contratos(data_fim);

CREATE TRIGGER set_updated_at_contratos
  BEFORE UPDATE ON contratos
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- OPORTUNIDADES / PIPELINE CRM (COM·01) — Fonte: RD Station
-- ============================================================
CREATE TABLE oportunidades_crm (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  cliente_id        UUID REFERENCES clientes(id) ON DELETE SET NULL,
  titulo            TEXT NOT NULL,
  valor_estimado    DECIMAL(10,2),
  etapa_funil       TEXT NOT NULL,
                    -- 'prospecto' | 'contato_inicial' | 'proposta' | 'negociacao' | 'fechado_ganho' | 'fechado_perdido'
  probabilidade     INTEGER,                      -- 0-100%
  data_criacao      DATE NOT NULL,
  data_previsao     DATE,
  data_fechamento   DATE,
  responsavel_id    UUID REFERENCES funcionarios(id) ON DELETE SET NULL,
  origem            TEXT,                         -- 'inbound' | 'prospeccao' | 'indicacao' | 'renovacao'
  motivo_perda      TEXT,
  rd_station_id     TEXT UNIQUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_oportunidades_empresa  ON oportunidades_crm(empresa_id);
CREATE INDEX idx_oportunidades_etapa    ON oportunidades_crm(etapa_funil);
CREATE INDEX idx_oportunidades_resp     ON oportunidades_crm(responsavel_id);

CREATE TRIGGER set_updated_at_oportunidades
  BEFORE UPDATE ON oportunidades_crm
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- COMISSÕES (COM·02)
-- ============================================================
CREATE TABLE comissoes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  vendedor_id       UUID NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
  contrato_id       UUID REFERENCES contratos(id) ON DELETE SET NULL,
  oportunidade_id   UUID REFERENCES oportunidades_crm(id) ON DELETE SET NULL,
  competencia       DATE NOT NULL,
  valor_venda       DECIMAL(10,2) NOT NULL,
  percentual        DECIMAL(5,2) NOT NULL,
  valor_comissao    DECIMAL(10,2) NOT NULL,
  status            TEXT DEFAULT 'pendente',      -- 'pendente' | 'pago' | 'cancelado'
  data_pagamento    DATE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comissoes_vendedor    ON comissoes(vendedor_id);
CREATE INDEX idx_comissoes_empresa     ON comissoes(empresa_id);
CREATE INDEX idx_comissoes_competencia ON comissoes(competencia DESC);

CREATE TRIGGER set_updated_at_comissoes
  BEFORE UPDATE ON comissoes
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
