-- ============================================================
-- GP OS Core — barramento de eventos do ecossistema
--
-- Tabela central de eventos publicados por qualquer módulo
-- do GP SafeWork OS: Command Center, Sales IA, ERP Core, etc.
-- Habilita Realtime para o feed ao vivo no Centro de Comando.
-- ============================================================

CREATE TABLE IF NOT EXISTS os_eventos (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo        text        NOT NULL,
  origem      text        NOT NULL DEFAULT 'command_center',
  payload     jsonb       NOT NULL DEFAULT '{}',
  processado  boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Tipos válidos de evento
CREATE INDEX IF NOT EXISTS idx_os_eventos_tipo       ON os_eventos(tipo);
CREATE INDEX IF NOT EXISTS idx_os_eventos_created    ON os_eventos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_os_eventos_origem     ON os_eventos(origem);
CREATE INDEX IF NOT EXISTS idx_os_eventos_processado ON os_eventos(processado) WHERE NOT processado;

COMMENT ON TABLE os_eventos IS
  'Barramento de eventos do ecossistema GP SafeWork OS. Publicado por qualquer módulo.';

-- Habilita Realtime para o feed ao vivo no Centro de Comando
ALTER PUBLICATION supabase_realtime ADD TABLE os_eventos;

-- Limpeza automática: eventos processados com mais de 90 dias
-- (rodar via cron — não é pg_cron; o Next.js route /api/os/cleanup executará)
COMMENT ON COLUMN os_eventos.processado IS
  'True quando o evento foi consumido pelo Centro de Comando.';

GRANT SELECT, INSERT, UPDATE ON os_eventos TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
