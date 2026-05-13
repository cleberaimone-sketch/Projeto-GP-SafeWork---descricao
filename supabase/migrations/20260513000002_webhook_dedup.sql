CREATE TABLE IF NOT EXISTS webhook_dedup (
  message_id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Remove entradas com mais de 1 hora automaticamente (via cron no Supabase ou limpeza manual)
CREATE INDEX IF NOT EXISTS idx_webhook_dedup_created ON webhook_dedup(created_at);
