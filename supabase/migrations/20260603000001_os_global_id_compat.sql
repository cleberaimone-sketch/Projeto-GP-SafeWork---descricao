-- ============================================================
-- GP OS Core — campos de compatibilidade
--
-- Adiciona os_global_id (nullable) nas tabelas core para que,
-- quando o GP OS Core existir, cada registro possa apontar para
-- o cadastro canônico do ecossistema sem migração forçada.
-- ============================================================

ALTER TABLE empresas     ADD COLUMN IF NOT EXISTS os_global_id uuid;
ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS os_global_id uuid;

-- usuarios pode não existir com esse nome exato; adicionamos somente se existir
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'usuarios') THEN
    EXECUTE 'ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS os_global_id uuid';
  END IF;
END $$;

-- Índices parciais — só indexa linhas que já têm o campo preenchido
CREATE INDEX IF NOT EXISTS idx_empresas_os_global
  ON empresas(os_global_id)
  WHERE os_global_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_funcionarios_os_global
  ON funcionarios(os_global_id)
  WHERE os_global_id IS NOT NULL;

COMMENT ON COLUMN empresas.os_global_id IS
  'ID canônico no GP OS Core — preenchido quando Core existir; nullable até lá.';
COMMENT ON COLUMN funcionarios.os_global_id IS
  'ID canônico no GP OS Core — preenchido quando Core existir; nullable até lá.';

NOTIFY pgrst, 'reload schema';
