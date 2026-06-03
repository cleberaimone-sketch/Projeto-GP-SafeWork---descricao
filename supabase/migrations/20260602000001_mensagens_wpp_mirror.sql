-- ============================================================
-- WhatsApp Mirror — mensagens corporativas espelhadas no dashboard
--
-- Captura mensagens da linha corporativa (45999099009) onde o
-- nome do contato contém "safe" ou "safework". Exibido no
-- Centro de Comando em tempo real via Supabase Realtime.
-- ============================================================

CREATE TABLE IF NOT EXISTS mensagens_wpp_mirror (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contato_numero text     NOT NULL,
  contato_nome   text     NOT NULL DEFAULT '',
  mensagem       text     NOT NULL,
  direcao        text     NOT NULL DEFAULT 'entrada'
                          CHECK (direcao IN ('entrada', 'saida')),
  tipo           text     NOT NULL DEFAULT 'texto',   -- texto | audio | imagem | documento
  lida           boolean  NOT NULL DEFAULT false,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wpp_mirror_created  ON mensagens_wpp_mirror(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wpp_mirror_contato  ON mensagens_wpp_mirror(contato_numero);
CREATE INDEX IF NOT EXISTS idx_wpp_mirror_lida     ON mensagens_wpp_mirror(lida) WHERE NOT lida;

COMMENT ON TABLE mensagens_wpp_mirror IS
  'Espelho das mensagens WhatsApp da linha corporativa 45999099009 — só contatos com "safe" no nome.';

-- Habilita Realtime (requerido para o componente de feed ao vivo)
ALTER PUBLICATION supabase_realtime ADD TABLE mensagens_wpp_mirror;

GRANT SELECT, INSERT, UPDATE ON mensagens_wpp_mirror TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
