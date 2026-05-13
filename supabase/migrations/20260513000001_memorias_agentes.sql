-- ============================================================
-- GP SafeWork — Migration: Memórias de longo prazo dos agentes IA
-- ============================================================

CREATE TABLE memorias_agentes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agente     TEXT NOT NULL,
                -- 'lari' | 'dieguito' | 'plata' | 'lui' | 'secretaria'
  tipo       TEXT NOT NULL,
                -- 'decisao' | 'fato' | 'pendencia' | 'alerta' | 'aprendizado'
  titulo     TEXT NOT NULL,
  conteudo   TEXT NOT NULL,
  relevancia INTEGER DEFAULT 3 CHECK (relevancia BETWEEN 1 AND 5),
  expires_at TIMESTAMPTZ,   -- NULL = permanente
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_memorias_agente    ON memorias_agentes(agente);
CREATE INDEX idx_memorias_tipo      ON memorias_agentes(tipo);
CREATE INDEX idx_memorias_relevancia ON memorias_agentes(relevancia DESC);
CREATE INDEX idx_memorias_criado    ON memorias_agentes(created_at DESC);

CREATE TRIGGER set_updated_at_memorias
  BEFORE UPDATE ON memorias_agentes
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Constraint única para identificar conversa por agente+canal+usuário
ALTER TABLE conversas_ia
  ADD COLUMN IF NOT EXISTS contato_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversas_agente_canal_contato
  ON conversas_ia(agente, canal, contato_id)
  WHERE contato_id IS NOT NULL;

-- RLS: apenas service role acessa (chamadas server-side)
ALTER TABLE memorias_agentes ENABLE ROW LEVEL SECURITY;
