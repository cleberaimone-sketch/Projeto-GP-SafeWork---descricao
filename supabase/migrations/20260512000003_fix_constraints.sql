-- Constraint UNIQUE real (não índice parcial) para ON CONFLICT funcionar
DROP INDEX IF EXISTS lancamentos_financeiros_fonte_id_fonte_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lancamentos_fonte_unique'
  ) THEN
    ALTER TABLE lancamentos_financeiros ADD CONSTRAINT lancamentos_fonte_unique UNIQUE (fonte_id, fonte);
  END IF;
END $$;

-- Permitir saldo NULL em saldos_bancarios (endpoint pode não ter o campo)
ALTER TABLE saldos_bancarios ALTER COLUMN saldo DROP NOT NULL;
