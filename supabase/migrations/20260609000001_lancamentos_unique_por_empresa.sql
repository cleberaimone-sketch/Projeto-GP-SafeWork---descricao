-- Trocar constraint de dedup de (fonte_id, fonte) para (empresa_id, fonte_id, fonte)
-- Isso permite que a mesma transação do Conta Azul exista em empresas diferentes
-- quando múltiplas empresas compartilham a mesma conta Conta Azul.

-- 1. Remover registros órfãos com empresa_id NULL (gerados antes do fix de mapeamento)
DELETE FROM lancamentos_financeiros WHERE empresa_id IS NULL;

-- 2. Dropar constraint antiga
ALTER TABLE lancamentos_financeiros
  DROP CONSTRAINT IF EXISTS lancamentos_fonte_unique;

DROP INDEX IF EXISTS lancamentos_financeiros_fonte_id_fonte_key;

-- 3. Criar novo constraint incluindo empresa_id
ALTER TABLE lancamentos_financeiros
  ADD CONSTRAINT lancamentos_empresa_fonte_unique
  UNIQUE (empresa_id, fonte_id, fonte);

-- 4. Limpar sync_log com empresa_id NULL (entradas de syncs anteriores ao fix)
DELETE FROM sync_log
WHERE fonte = 'conta_azul'
  AND empresa_id IS NULL
  AND tipo_sync = 'financeiro';

NOTIFY pgrst, 'reload schema';
