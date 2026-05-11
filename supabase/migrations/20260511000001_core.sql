-- ============================================================
-- GP SafeWork — Migration 001: Core
-- Tabelas base: empresas, clientes, centros_custo, funcionarios
-- ============================================================

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- busca textual

-- ============================================================
-- EMPRESAS DO GRUPO
-- ============================================================
CREATE TABLE empresas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome          TEXT NOT NULL,
  nome_curto    TEXT,                            -- ex: "SW Medianeira"
  cnpj          TEXT UNIQUE,
  cidade        TEXT,
  estado        TEXT NOT NULL DEFAULT 'PR',
  tipo          TEXT NOT NULL DEFAULT 'subsidiaria',
                                                 -- 'holding' | 'subsidiaria' | 'parceira'
  status        TEXT NOT NULL DEFAULT 'ativa',   -- 'ativa' | 'inativa' | 'encerrando'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed: empresas do grupo
INSERT INTO empresas (nome, nome_curto, cidade, tipo) VALUES
  ('GP SafeWork',               'GP SafeWork',  'Medianeira', 'holding'),
  ('SafeWork Medianeira',       'SW Medianeira','Medianeira',  'subsidiaria'),
  ('SafeWork Foz do Iguaçu',   'SW Foz',       'Foz do Iguaçu','subsidiaria'),
  ('SafeWork Santa Helena',    'SW Santa Helena','Santa Helena','subsidiaria'),
  ('SafeWork Londrina',        'SW Londrina',  'Londrina',    'subsidiaria'),
  ('Safe+',                    'Safe+',        'Medianeira',  'subsidiaria'),
  ('SafeT',                    'SafeT',        'Medianeira',  'subsidiaria'),
  ('SafeR&S',                  'SafeR&S',      'Medianeira',  'subsidiaria'),
  ('SafeHelp',                 'SafeHelp',     'Medianeira',  'subsidiaria');

-- ============================================================
-- CLIENTES
-- ============================================================
CREATE TABLE clientes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome          TEXT NOT NULL,
  cnpj          TEXT UNIQUE,
  cidade        TEXT,
  estado        TEXT DEFAULT 'PR',
  empresa_id    UUID REFERENCES empresas(id) ON DELETE SET NULL,
                                                 -- empresa do grupo que atende
  status        TEXT NOT NULL DEFAULT 'ativo',   -- 'ativo' | 'inativo' | 'prospecto'
  fonte_id      TEXT,                            -- ID no sistema de origem (SOC, RD Station)
  fonte         TEXT,                            -- 'soc' | 'rd_station' | 'manual'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clientes_empresa ON clientes(empresa_id);
CREATE INDEX idx_clientes_cnpj    ON clientes(cnpj);
CREATE INDEX idx_clientes_nome    ON clientes USING gin(nome gin_trgm_ops);

-- ============================================================
-- CENTROS DE CUSTO
-- ============================================================
CREATE TABLE centros_custo (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo        TEXT UNIQUE NOT NULL,
  descricao     TEXT NOT NULL,
  empresa_id    UUID REFERENCES empresas(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- FUNCIONÁRIOS / COLABORADORES
-- ============================================================
CREATE TABLE funcionarios (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            TEXT NOT NULL,
  cpf             TEXT UNIQUE,
  email           TEXT,
  empresa_id      UUID REFERENCES empresas(id) ON DELETE SET NULL,
  departamento    TEXT,
  cargo           TEXT,
  regime          TEXT DEFAULT 'CLT',             -- 'CLT' | 'PJ' | 'estagio'
  salario_base    DECIMAL(10,2),
  data_admissao   DATE,
  data_demissao   DATE,
  status          TEXT NOT NULL DEFAULT 'ativo',  -- 'ativo' | 'inativo' | 'ferias'
  gestor_id       UUID REFERENCES funcionarios(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_funcionarios_empresa    ON funcionarios(empresa_id);
CREATE INDEX idx_funcionarios_departamento ON funcionarios(departamento);

-- ============================================================
-- TRIGGER: updated_at automático
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_updated_at_empresas
  BEFORE UPDATE ON empresas
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_clientes
  BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_funcionarios
  BEFORE UPDATE ON funcionarios
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
