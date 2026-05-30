-- Relatórios estratégicos gerados pela Nina (agente de estratégia comercial)
CREATE TABLE IF NOT EXISTS relatorios_estrategicos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_relatorio  date NOT NULL,
  gerado_em       timestamptz NOT NULL DEFAULT now(),
  status          text NOT NULL DEFAULT 'ok',  -- 'ok' | 'erro'
  resumo          text,                         -- texto curto para briefing da LUI
  conteudo_full   text,                         -- relatório completo (markdown)
  oportunidades   jsonb,                        -- array estruturado de oportunidades
  metricas        jsonb,                        -- métricas do snapshot (total empresas, vidas, etc.)
  enviado_whatsapp boolean NOT NULL DEFAULT false,
  enviado_em      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_relatorios_estrategicos_data
  ON relatorios_estrategicos (data_relatorio DESC);

GRANT SELECT, INSERT, UPDATE ON relatorios_estrategicos TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
