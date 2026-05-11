-- ============================================================
-- GP SafeWork — Migration 007: Sistema, Agentes IA, Sync
-- ============================================================

-- ============================================================
-- ALERTAS DO SISTEMA (todos os agentes)
-- ============================================================
CREATE TABLE alertas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID REFERENCES empresas(id) ON DELETE CASCADE,
  cliente_id      UUID REFERENCES clientes(id) ON DELETE SET NULL,
  modulo          TEXT NOT NULL,
                  -- 'financeiro' | 'medicina' | 'engenharia' | 'comercial' | 'rh' | 'sistema'
  tipo            TEXT NOT NULL,
                  -- 'inadimplencia' | 'aso_vencendo' | 'laudo_atrasado' | 'contrato_vencendo' | etc.
  titulo          TEXT NOT NULL,
  descricao       TEXT,
  prioridade      TEXT DEFAULT 'media',           -- 'baixa' | 'media' | 'alta' | 'critica'
  status          TEXT DEFAULT 'aberto',          -- 'aberto' | 'lido' | 'resolvido' | 'ignorado'
  destinatario    TEXT,                           -- 'LUI' | 'agente_medicina' | 'agente_financeiro' | etc.
  data_referencia DATE,
  resolvido_em    TIMESTAMPTZ,
  metadados       JSONB,                          -- dados extras específicos do alerta
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alertas_empresa    ON alertas(empresa_id);
CREATE INDEX idx_alertas_modulo     ON alertas(modulo);
CREATE INDEX idx_alertas_status     ON alertas(status);
CREATE INDEX idx_alertas_prioridade ON alertas(prioridade);
CREATE INDEX idx_alertas_criado     ON alertas(created_at DESC);

CREATE TRIGGER set_updated_at_alertas
  BEFORE UPDATE ON alertas
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- BRIEFINGS DIÁRIOS DO LUI (Agente CEO — 7h)
-- ============================================================
CREATE TABLE briefings_diarios (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_briefing   DATE NOT NULL UNIQUE,
  canal           TEXT DEFAULT 'whatsapp',        -- 'whatsapp' | 'dashboard'
  conteudo        TEXT NOT NULL,                  -- texto completo gerado pelo LUI
  resumo          TEXT,                           -- versão curta para notificação
  metricas        JSONB,                          -- snapshot de KPIs do dia
  alertas_ids     UUID[],                         -- alertas incluídos neste briefing
  enviado         BOOLEAN DEFAULT FALSE,
  enviado_em      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_briefings_data ON briefings_diarios(data_briefing DESC);

-- ============================================================
-- LOG DE CONVERSAS DOS AGENTES IA
-- ============================================================
CREATE TABLE conversas_ia (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agente          TEXT NOT NULL,
                  -- 'LUI' | 'secretaria' | 'financeiro' | 'medicina' | 'engenharia' | 'comercial' | 'rh' | 'safechat'
  canal           TEXT,                           -- 'whatsapp' | 'dashboard' | 'api'
  contato_nome    TEXT,
  contato_id      TEXT,                           -- número whatsapp, user_id, etc.
  empresa_id      UUID REFERENCES empresas(id) ON DELETE SET NULL,
  mensagens       JSONB NOT NULL DEFAULT '[]',    -- array de {role, content, timestamp}
  status          TEXT DEFAULT 'ativo',           -- 'ativo' | 'encerrado' | 'escalado'
  tokens_usados   INTEGER,
  custo_usd       DECIMAL(8,6),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conversas_agente  ON conversas_ia(agente);
CREATE INDEX idx_conversas_canal   ON conversas_ia(canal);
CREATE INDEX idx_conversas_empresa ON conversas_ia(empresa_id);
CREATE INDEX idx_conversas_criado  ON conversas_ia(created_at DESC);

CREATE TRIGGER set_updated_at_conversas
  BEFORE UPDATE ON conversas_ia
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- STATUS DAS INTEGRAÇÕES (sync das fontes externas)
-- ============================================================
CREATE TABLE sync_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fonte           TEXT NOT NULL,                  -- 'conta_azul' | 'soc' | 'd4sign' | 'rd_station' | 'unisyst'
  empresa_id      UUID REFERENCES empresas(id) ON DELETE CASCADE,
  tipo_sync       TEXT NOT NULL,                  -- 'financeiro' | 'medicina' | 'engenharia' | 'comercial'
  status          TEXT NOT NULL,                  -- 'sucesso' | 'erro' | 'parcial' | 'em_andamento'
  registros_processados INTEGER DEFAULT 0,
  registros_erro  INTEGER DEFAULT 0,
  mensagem_erro   TEXT,
  iniciado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalizado_em   TIMESTAMPTZ,
  metadados       JSONB                           -- detalhes extras (paginação, última chave, etc.)
);

CREATE INDEX idx_sync_fonte   ON sync_log(fonte);
CREATE INDEX idx_sync_status  ON sync_log(status);
CREATE INDEX idx_sync_inicio  ON sync_log(iniciado_em DESC);
