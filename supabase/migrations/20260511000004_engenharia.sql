-- ============================================================
-- GP SafeWork — Migration 004: Engenharia
-- ENG·01 a ENG·05 — Fonte: SOC
-- ============================================================

-- ============================================================
-- TÉCNICOS DE SEGURANÇA DO TRABALHO (TST)
-- ============================================================
CREATE TABLE tecnicos_seguranca (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funcionario_id UUID REFERENCES funcionarios(id) ON DELETE SET NULL,
  nome          TEXT NOT NULL,
  crea          TEXT,
  unidade       TEXT,                             -- 'Medianeira' | 'Londrina' | 'Foz' | 'Santa Helena'
  empresa_id    UUID REFERENCES empresas(id) ON DELETE SET NULL,
  status        TEXT DEFAULT 'ativo',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- LAUDOS TÉCNICOS (ENG·01, ENG·02) — PGR, LTCAT, LSPCIE, etc.
-- ============================================================
CREATE TABLE laudos_tecnicos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  cliente_id        UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tecnico_id        UUID REFERENCES tecnicos_seguranca(id) ON DELETE SET NULL,
  tipo_laudo        TEXT NOT NULL,                -- 'PGR' | 'LTCAT' | 'LSPCIE' | 'PPP' | 'ART'
  nr_referencia     TEXT,                         -- 'NR-09' | 'NR-15' | 'NR-17' | etc.
  data_elaboracao   DATE,
  data_entrega      DATE,
  data_vencimento   DATE,
  status            TEXT NOT NULL DEFAULT 'pendente',
                                                  -- 'pendente' | 'em_andamento' | 'entregue' | 'vencido' | 'cancelado'
  numero_revisao    INTEGER DEFAULT 1,
  valor_cobrado     DECIMAL(10,2),
  observacao        TEXT,
  fonte_id          TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_laudos_empresa    ON laudos_tecnicos(empresa_id);
CREATE INDEX idx_laudos_cliente    ON laudos_tecnicos(cliente_id);
CREATE INDEX idx_laudos_status     ON laudos_tecnicos(status);
CREATE INDEX idx_laudos_vencimento ON laudos_tecnicos(data_vencimento);
CREATE INDEX idx_laudos_tipo       ON laudos_tecnicos(tipo_laudo);

CREATE TRIGGER set_updated_at_laudos
  BEFORE UPDATE ON laudos_tecnicos
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- PGR POR CLIENTE (ENG·01)
-- ============================================================
CREATE TABLE pgr_clientes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id        UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  empresa_id        UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  tecnico_id        UUID REFERENCES tecnicos_seguranca(id) ON DELETE SET NULL,
  ano_vigencia      INTEGER NOT NULL,
  data_elaboracao   DATE,
  data_vencimento   DATE,
  status            TEXT DEFAULT 'ativo',         -- 'ativo' | 'vencido' | 'pendente' | 'elaborando'
  numero_trabalhadores INTEGER,
  laudo_id          UUID REFERENCES laudos_tecnicos(id) ON DELETE SET NULL,
  fonte_id          TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pgr_cliente  ON pgr_clientes(cliente_id);
CREATE INDEX idx_pgr_status   ON pgr_clientes(status);

CREATE TRIGGER set_updated_at_pgr
  BEFORE UPDATE ON pgr_clientes
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- COLETAS AMBIENTAIS (ENG·03)
-- ============================================================
CREATE TABLE coletas_ambientais (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  cliente_id        UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tecnico_id        UUID REFERENCES tecnicos_seguranca(id) ON DELETE SET NULL,
  tipo_agente       TEXT,                         -- 'quimico' | 'fisico' | 'biologico' | 'ergonomico'
  data_coleta       DATE NOT NULL,
  municipio         TEXT,
  km_deslocamento   DECIMAL(8,2),
  custo_deslocamento DECIMAL(8,2),
  laudo_id          UUID REFERENCES laudos_tecnicos(id) ON DELETE SET NULL,
  status            TEXT DEFAULT 'realizada',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_coletas_empresa ON coletas_ambientais(empresa_id);
CREATE INDEX idx_coletas_data    ON coletas_ambientais(data_coleta DESC);

CREATE TRIGGER set_updated_at_coletas
  BEFORE UPDATE ON coletas_ambientais
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- CONFORMIDADE NR POR CLIENTE (ENG·04)
-- ============================================================
CREATE TABLE conformidade_nr (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id    UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  empresa_id    UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nr            TEXT NOT NULL,                    -- 'NR-01' | 'NR-07' | 'NR-09' | etc.
  status        TEXT DEFAULT 'conforme',          -- 'conforme' | 'pendente' | 'nao_conforme' | 'n/a'
  data_avaliacao DATE,
  data_prazo    DATE,
  observacao    TEXT,
  tecnico_id    UUID REFERENCES tecnicos_seguranca(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conformidade_cliente ON conformidade_nr(cliente_id);
CREATE INDEX idx_conformidade_nr      ON conformidade_nr(nr);
CREATE INDEX idx_conformidade_status  ON conformidade_nr(status);

CREATE TRIGGER set_updated_at_conformidade
  BEFORE UPDATE ON conformidade_nr
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
