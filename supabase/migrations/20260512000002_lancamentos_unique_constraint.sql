-- Índice único para upsert de lançamentos financeiros por fonte
CREATE UNIQUE INDEX IF NOT EXISTS lancamentos_financeiros_fonte_id_fonte_key
  ON lancamentos_financeiros(fonte_id, fonte)
  WHERE fonte_id IS NOT NULL;

-- Permitir empresa_id NULL em saldos_bancarios (conta master sem empresa vinculada)
ALTER TABLE saldos_bancarios ALTER COLUMN empresa_id DROP NOT NULL;
