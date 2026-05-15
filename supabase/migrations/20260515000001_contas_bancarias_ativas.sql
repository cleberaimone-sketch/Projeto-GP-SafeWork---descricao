-- ============================================================
-- Contas bancárias ATIVAS — fonte de verdade para fluxo de caixa
-- ============================================================
-- O Conta Azul retorna muitas contas (algumas fechadas, fictícias, duplicadas).
-- Esta tabela define quais contas são REALMENTE operacionais.
-- Saldos e fluxo de caixa do dashboard só consideram essas contas.

CREATE TABLE IF NOT EXISTS contas_bancarias_ativas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome_exibicao text NOT NULL,
  banco         text NOT NULL,                  -- 'Itaú', 'Banco Cora', 'Conta Azul IP', 'Iugu'
  numero_cc     text NOT NULL,                  -- '15534', '4839245-2', '99739-5', etc
  agencia       text,                            -- '0001' (se aplicável)
  tipo_conta    text NOT NULL CHECK (tipo_conta IN ('conta_corrente', 'conta_digital', 'cartao_credito', 'investimento')),
  fonte_dados   text NOT NULL DEFAULT 'conta_azul' CHECK (fonte_dados IN ('conta_azul', 'manual', 'pluggy')),
  padroes_match text[] DEFAULT '{}',             -- nomes alternativos para casar com saldos_bancarios.banco
  ativo         boolean NOT NULL DEFAULT true,
  observacoes   text,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_contas_ativas_empresa ON contas_bancarias_ativas(empresa_id) WHERE ativo;
CREATE UNIQUE INDEX idx_contas_ativas_cc ON contas_bancarias_ativas(empresa_id, numero_cc);

COMMENT ON TABLE contas_bancarias_ativas IS 'Contas bancárias reais e operacionais. Saldos do Conta Azul são filtrados por aqui antes de entrar no dashboard.';
COMMENT ON COLUMN contas_bancarias_ativas.padroes_match IS 'Lista de strings para casar com saldos_bancarios.banco (ILIKE). Ex: ["Itau Safework Medianeira","Safework Medianeira - Itau"]';

-- ============================================================
-- SEED — Contas ativas confirmadas pelo Cleber em 2026-05-15
-- ============================================================

INSERT INTO contas_bancarias_ativas (empresa_id, nome_exibicao, banco, numero_cc, agencia, tipo_conta, padroes_match) VALUES

-- GP SafeWork (matriz)
('23fa248a-da8a-4736-bd15-619b05329cb0', 'Conta PJ Conta Azul IP',           'Conta Azul IP', '15534',     NULL,   'conta_digital',  ARRAY['Conta PJ Conta Azul IP','Conta PJ - Conta Azul - Caixinha']),
('23fa248a-da8a-4736-bd15-619b05329cb0', 'GP SafeWork - Banco Cora',         'Banco Cora',    '4839245-2', '0001', 'conta_corrente', ARRAY['Banco Cora','GP CORA','CORA GP','Cora - GP Safework']),

-- SW Medianeira
('f49554eb-5bf8-4135-938e-cd156fa21d29', 'Conta PJ Conta Azul IP',           'Conta Azul IP', '26486',     NULL,   'conta_digital',  ARRAY['Conta PJ Conta Azul IP']),
('f49554eb-5bf8-4135-938e-cd156fa21d29', 'Safework Medianeira - Itaú',       'Itaú',          '99739-5',   NULL,   'conta_corrente', ARRAY['Safework Medianeira - Itau','Safework Medianeira - Itaú']),

-- SW Londrina
('a842810a-1428-4fd6-9d66-1fc2b511a52b', 'Conta PJ Conta Azul IP',           'Conta Azul IP', '27131',     NULL,   'conta_digital',  ARRAY['Conta PJ Conta Azul IP']),
('a842810a-1428-4fd6-9d66-1fc2b511a52b', 'Safework Londrina - Itaú',         'Itaú',          '99742-9',   NULL,   'conta_corrente', ARRAY['Safework Londrina - Itau','Safework Londrina - Itaú']),

-- SW Foz
('170bd8ea-996e-412b-a2e9-2ecfee0022f3', 'Conta PJ Conta Azul IP',           'Conta Azul IP', '28227',     NULL,   'conta_digital',  ARRAY['Conta PJ Conta Azul IP']),
('170bd8ea-996e-412b-a2e9-2ecfee0022f3', 'Safework Foz do Iguaçu - Itaú',    'Itaú',          '99740-3',   NULL,   'conta_corrente', ARRAY['Safework Foz','Itaú - CC 99740-3']),

-- SW Santa Helena
('de69cb67-cdc7-4fec-ba2c-5c2c1f27ba3a', 'Conta PJ Conta Azul IP',           'Conta Azul IP', '26598',     NULL,   'conta_digital',  ARRAY['Conta PJ Conta Azul IP','Conta PJ - Conta Azul - Caixinha']),
('de69cb67-cdc7-4fec-ba2c-5c2c1f27ba3a', 'Safework Santa Helena - Itaú',     'Itaú',          '99738-7',   NULL,   'conta_corrente', ARRAY['Safework Santa Helena - Itau','Safework Santa Helena - Itaú']),

-- Safe+
('0ea3b9d4-6cf8-43e7-a717-efb60aea50cc', 'Conta PJ Conta Azul IP',           'Conta Azul IP', '25161',     NULL,   'conta_digital',  ARRAY['Conta PJ Conta Azul IP']),
('0ea3b9d4-6cf8-43e7-a717-efb60aea50cc', 'Safemais - Itaú',                  'Itaú',          '99890-6',   NULL,   'conta_corrente', ARRAY['Safemais - Itau','Safemais - Itau - CC 99890 - 6','Banco Itau - Safemais - CC 99890-6']),

-- SafeT
('3765298d-80f7-4bb3-8b77-2da17b064083', 'Conta PJ Conta Azul Iugu',         'Iugu',          '5512484-0', NULL,   'conta_digital',  ARRAY['Conta PJ Conta Azul Iugu','Conta PJ - Conta Azul - Caixinha interna']),
('3765298d-80f7-4bb3-8b77-2da17b064083', 'Itaú - Safe T',                    'Itaú',          '99872-4',   NULL,   'conta_corrente', ARRAY['Itau - Safe T']),

-- Safe Meio Ambiente
('be61c0a0-1164-405c-a1f0-f3187431c55f', 'Conta PJ Conta Azul IP',           'Conta Azul IP', '23215',     NULL,   'conta_digital',  ARRAY['Conta PJ Conta Azul IP']),

-- SafeHelp (sem token Conta Azul ainda — fonte_dados = manual)
('50ceeb1f-2057-4735-97e1-846a329db35c', 'SafeHelp - Banco Cora',            'Banco Cora',    '5409967-8', '0001', 'conta_corrente', ARRAY['SafeHelp - Banco Cora','Banco Cora SafeHelp']),

-- SafeR&S (sem token Conta Azul ainda — fonte_dados = manual)
('82443dbd-c2f2-4d3d-83d1-4f8f3c220691', 'Safework SafeRS - Itaú',           'Itaú',          '99874-7',   NULL,   'conta_corrente', ARRAY['Safework SafeRS - Itau','Safework SafeRS - Itaú']);

-- Marcar fonte manual nas duas que ainda não têm Conta Azul
UPDATE contas_bancarias_ativas SET fonte_dados = 'manual'
WHERE empresa_id IN (
  '50ceeb1f-2057-4735-97e1-846a329db35c', -- SafeHelp
  '82443dbd-c2f2-4d3d-83d1-4f8f3c220691'  -- SafeR&S
);

-- ============================================================
-- View consolidada — saldos só das contas ativas
-- ============================================================
-- Join entre saldos_bancarios (atualizado pelo sync) e contas_bancarias_ativas
-- Match por: (a) número de conta exato OU (b) match em padroes_match (ILIKE)

CREATE OR REPLACE VIEW v_saldos_ativos AS
SELECT
  cba.id                AS conta_ativa_id,
  cba.empresa_id,
  cba.nome_exibicao,
  cba.banco             AS banco_categoria,
  cba.numero_cc,
  cba.agencia,
  cba.tipo_conta,
  cba.fonte_dados,
  sb.banco              AS banco_origem,    -- nome como veio do Conta Azul
  sb.conta              AS conta_origem,
  sb.saldo,
  sb.data_referencia,
  sb.fonte              AS fonte_saldo
FROM contas_bancarias_ativas cba
LEFT JOIN LATERAL (
  SELECT s.*
  FROM saldos_bancarios s
  WHERE s.empresa_id = cba.empresa_id
    AND (
      -- Match A: número da conta bate exato
      (s.conta IS NOT NULL AND REPLACE(REPLACE(s.conta, '-', ''), ' ', '') = REPLACE(REPLACE(cba.numero_cc, '-', ''), ' ', ''))
      OR
      -- Match B: nome casa com algum padrão
      EXISTS (
        SELECT 1 FROM unnest(cba.padroes_match) AS p
        WHERE s.banco ILIKE '%' || p || '%'
      )
    )
  ORDER BY s.data_referencia DESC
  LIMIT 1
) sb ON true
WHERE cba.ativo = true;

COMMENT ON VIEW v_saldos_ativos IS 'Saldos das contas REAIS por empresa. Combina contas_bancarias_ativas (verdade) com saldos_bancarios (sync Conta Azul).';

-- ============================================================
-- Categorias EXCLUÍDAS de receita/despesa (transferências internas)
-- ============================================================
-- Movimentação entre empresas do grupo. Não é receita/despesa real.

CREATE TABLE IF NOT EXISTS categorias_excluidas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria     text NOT NULL UNIQUE,
  motivo        text NOT NULL,
  criado_em     timestamptz NOT NULL DEFAULT now()
);

INSERT INTO categorias_excluidas (categoria, motivo) VALUES
  ('Transferência entre contas do grupo',          'Transferência interna entre empresas — não é receita/despesa real'),
  ('9.00 TRANSFERÊNCIA ENTRE CONTAS DO GRUPO',      'Transferência interna entre empresas — não é receita/despesa real'),
  ('Transferencia entre contas do grupo',           'Transferência interna entre empresas (sem acento) — não é receita/despesa real');

COMMENT ON TABLE categorias_excluidas IS 'Categorias que devem ser excluídas de TODOS os cálculos de receita, despesa, EBITDA e DRE.';
