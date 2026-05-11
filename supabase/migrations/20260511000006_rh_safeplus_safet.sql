-- ============================================================
-- GP SafeWork — Migration 006: RH, Safe+, SafeT
-- RH·01-04, S+·01-04, ST·01-04
-- ============================================================

-- ============================================================
-- REGISTROS DE PESSOAL / RH (RH·01, RH·02, RH·03, RH·04)
-- ============================================================
CREATE TABLE registros_ponto (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funcionario_id  UUID NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  data_referencia DATE NOT NULL,
  horas_trabalhadas DECIMAL(5,2),
  horas_extras      DECIMAL(5,2) DEFAULT 0,
  horas_falta       DECIMAL(5,2) DEFAULT 0,
  justificativa_falta TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ponto_funcionario ON registros_ponto(funcionario_id);
CREATE INDEX idx_ponto_data        ON registros_ponto(data_referencia DESC);
CREATE UNIQUE INDEX idx_ponto_unico ON registros_ponto(funcionario_id, data_referencia);

CREATE TABLE turnover_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funcionario_id  UUID NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL,                  -- 'admissao' | 'demissao' | 'transferencia'
  motivo          TEXT,
  data_evento     DATE NOT NULL,
  cargo_anterior  TEXT,
  cargo_novo      TEXT,
  empresa_anterior_id UUID REFERENCES empresas(id),
  observacao      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_turnover_empresa ON turnover_log(empresa_id);
CREATE INDEX idx_turnover_data    ON turnover_log(data_evento DESC);

-- ============================================================
-- SAFE+ — REDE CREDENCIADA (S+·01-04)
-- ============================================================
CREATE TABLE credenciados_safeplus (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            TEXT NOT NULL,
  cnpj            TEXT UNIQUE,
  tipo_servico    TEXT[],                         -- ['medicina', 'engenharia', 'treinamento']
  cidade          TEXT,
  estado          TEXT DEFAULT 'PR',
  contato_nome    TEXT,
  contato_telefone TEXT,
  contato_email   TEXT,
  status          TEXT DEFAULT 'ativo',           -- 'ativo' | 'inativo' | 'pendente_aprovacao'
  avaliacao_media DECIMAL(3,2),                   -- 0.00 a 5.00
  total_servicos  INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_credenciados_cidade  ON credenciados_safeplus(cidade);
CREATE INDEX idx_credenciados_status  ON credenciados_safeplus(status);

CREATE TRIGGER set_updated_at_credenciados
  BEFORE UPDATE ON credenciados_safeplus
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TABLE agendamentos_safeplus (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id          UUID REFERENCES clientes(id) ON DELETE SET NULL,
  credenciado_id      UUID REFERENCES credenciados_safeplus(id) ON DELETE SET NULL,
  tipo_servico        TEXT NOT NULL,
  data_agendamento    TIMESTAMPTZ NOT NULL,
  data_realizacao     TIMESTAMPTZ,
  status              TEXT DEFAULT 'agendado',
                                                  -- 'agendado' | 'realizado' | 'cancelado' | 'falta'
  sla_horas           INTEGER,                    -- prazo em horas
  sla_cumprido        BOOLEAN,
  trabalhador_nome    TEXT,
  trabalhador_cpf     TEXT,
  valor               DECIMAL(10,2),
  observacao          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agendamentos_credenciado ON agendamentos_safeplus(credenciado_id);
CREATE INDEX idx_agendamentos_data        ON agendamentos_safeplus(data_agendamento DESC);
CREATE INDEX idx_agendamentos_status      ON agendamentos_safeplus(status);

CREATE TRIGGER set_updated_at_agendamentos
  BEFORE UPDATE ON agendamentos_safeplus
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- SAFET — TREINAMENTOS (ST·01-04)
-- ============================================================
CREATE TABLE turmas_safet (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nr_referencia   TEXT NOT NULL,                  -- 'NR-35' | 'NR-10' | 'NR-12' | etc.
  titulo          TEXT NOT NULL,
  instrutor_id    UUID REFERENCES funcionarios(id) ON DELETE SET NULL,
  cliente_id      UUID REFERENCES clientes(id) ON DELETE SET NULL,
  municipio       TEXT,
  local           TEXT,
  data_inicio     DATE NOT NULL,
  data_fim        DATE,
  carga_horaria   DECIMAL(5,2),
  total_vagas     INTEGER,
  total_inscritos INTEGER DEFAULT 0,
  valor_total     DECIMAL(10,2),
  status          TEXT DEFAULT 'agendado',        -- 'agendado' | 'realizado' | 'cancelado'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_turmas_data     ON turmas_safet(data_inicio DESC);
CREATE INDEX idx_turmas_nr       ON turmas_safet(nr_referencia);
CREATE INDEX idx_turmas_cliente  ON turmas_safet(cliente_id);

CREATE TRIGGER set_updated_at_turmas
  BEFORE UPDATE ON turmas_safet
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TABLE presencas_safet (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  turma_id        UUID NOT NULL REFERENCES turmas_safet(id) ON DELETE CASCADE,
  trabalhador_nome TEXT NOT NULL,
  trabalhador_cpf  TEXT,
  empresa_nome    TEXT,
  presente        BOOLEAN DEFAULT TRUE,
  certificado_emitido BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_presencas_turma ON presencas_safet(turma_id);
