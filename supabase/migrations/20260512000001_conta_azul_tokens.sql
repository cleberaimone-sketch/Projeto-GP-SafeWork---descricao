-- Tabela dedicada para tokens OAuth2 do Conta Azul por empresa
CREATE TABLE IF NOT EXISTS conta_azul_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_nome    text NOT NULL UNIQUE,
  empresa_id      uuid REFERENCES empresas(id) ON DELETE SET NULL,
  refresh_token   text NOT NULL,
  access_token    text,
  expires_at      timestamptz,
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE conta_azul_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full" ON conta_azul_tokens
  USING (true)
  WITH CHECK (true);
