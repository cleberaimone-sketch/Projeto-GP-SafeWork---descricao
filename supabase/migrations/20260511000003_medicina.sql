-- ============================================================
-- GP SafeWork — Migration 003: Medicina
-- MED·01 a MED·06 — Fonte: SOC
-- ============================================================

-- ============================================================
-- PROFISSIONAIS DE SAÚDE
-- ============================================================
CREATE TABLE profissionais_saude (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            TEXT NOT NULL,
  conselho        TEXT,                           -- CRM, CRFa, CRP, COREN
  numero_conselho TEXT,
  especialidade   TEXT NOT NULL,                  -- 'medico_trabalho' | 'psicologo' | 'fonoaudiologo' | 'enfermeiro'
  empresa_id      UUID REFERENCES empresas(id) ON DELETE SET NULL,
  clinica         TEXT,                           -- 'Medianeira' | 'Londrina' | 'Foz' | 'Santa Helena'
  status          TEXT DEFAULT 'ativo',
  fonte_id        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at_profissionais_saude
  BEFORE UPDATE ON profissionais_saude
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- CONSULTAS / ATENDIMENTOS (MED·01, MED·04)
-- ============================================================
CREATE TABLE consultas (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  cliente_id            UUID REFERENCES clientes(id) ON DELETE SET NULL,
  profissional_id       UUID REFERENCES profissionais_saude(id) ON DELETE SET NULL,
  tipo_consulta         TEXT NOT NULL,
                        -- 'admissional' | 'periodico' | 'retorno' | 'demissional' | 'mudanca_funcao'
  data_consulta         DATE NOT NULL,
  clinica               TEXT,
  status                TEXT DEFAULT 'realizada',  -- 'agendada' | 'realizada' | 'cancelada' | 'falta'
  valor_cobrado         DECIMAL(10,2),
  tipo_exame_id         UUID,                      -- FK futura p/ tabela de exames
  fonte_id              TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_consultas_empresa       ON consultas(empresa_id);
CREATE INDEX idx_consultas_data          ON consultas(data_consulta DESC);
CREATE INDEX idx_consultas_tipo          ON consultas(tipo_consulta);
CREATE INDEX idx_consultas_clinica       ON consultas(clinica);

CREATE TRIGGER set_updated_at_consultas
  BEFORE UPDATE ON consultas
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- ASOs — Atestados de Saúde Ocupacional (MED·03)
-- ============================================================
CREATE TABLE asos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consulta_id       UUID REFERENCES consultas(id) ON DELETE SET NULL,
  cliente_id        UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  empresa_id        UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  trabalhador_nome  TEXT NOT NULL,
  trabalhador_cpf   TEXT,
  cargo             TEXT,
  setor             TEXT,
  tipo_aso          TEXT NOT NULL,                -- 'admissional' | 'periodico' | 'retorno' | 'demissional' | 'mudanca_funcao'
  data_emissao      DATE NOT NULL,
  data_validade     DATE,
  resultado         TEXT DEFAULT 'apto',          -- 'apto' | 'inapto' | 'apto_restricoes'
  medico_id         UUID REFERENCES profissionais_saude(id) ON DELETE SET NULL,
  numero_aso        TEXT,
  status_alerta     TEXT DEFAULT 'ok',            -- 'ok' | 'vencendo_30d' | 'vencendo_60d' | 'vencido'
  fonte_id          TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_asos_cliente      ON asos(cliente_id);
CREATE INDEX idx_asos_empresa      ON asos(empresa_id);
CREATE INDEX idx_asos_validade     ON asos(data_validade);
CREATE INDEX idx_asos_alerta       ON asos(status_alerta);

CREATE TRIGGER set_updated_at_asos
  BEFORE UPDATE ON asos
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- PCMSO por cliente (MED·05)
-- ============================================================
CREATE TABLE pcmso_clientes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id        UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  empresa_id        UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  medico_coord_id   UUID REFERENCES profissionais_saude(id) ON DELETE SET NULL,
  ano_vigencia      INTEGER NOT NULL,
  data_elaboracao   DATE,
  data_vencimento   DATE,
  status            TEXT DEFAULT 'ativo',         -- 'ativo' | 'vencido' | 'pendente' | 'elaborando'
  numero_trabalhadores INTEGER,
  observacao        TEXT,
  fonte_id          TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pcmso_cliente  ON pcmso_clientes(cliente_id);
CREATE INDEX idx_pcmso_empresa  ON pcmso_clientes(empresa_id);
CREATE INDEX idx_pcmso_status   ON pcmso_clientes(status);

CREATE TRIGGER set_updated_at_pcmso
  BEFORE UPDATE ON pcmso_clientes
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
