-- Análise diária da Plata gravada junto ao snapshot (fase 2 — Plata → LUI).
-- Gerada pelo cron /api/financeiro/snapshot-diario após calcular os números.

ALTER TABLE snapshots_financeiros_diarios
  ADD COLUMN IF NOT EXISTS analise text;

NOTIFY pgrst, 'reload schema';
