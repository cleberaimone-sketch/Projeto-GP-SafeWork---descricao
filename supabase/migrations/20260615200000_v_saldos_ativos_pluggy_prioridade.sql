-- ============================================================
-- v_saldos_ativos — Pluggy (Open Finance) vira fonte de saldo
-- ============================================================
-- Regra de negócio (confirmada pelo Cleber em 2026-06-15):
--   • Conta Azul só tem saldo CONFIÁVEL das contas dele mesmo
--     (Conta Azul IP, Iugu). Para bancos externos (Itaú, Cora) o
--     saldo do Conta Azul "está sempre errado".
--   • Open Finance (Pluggy) lê o saldo direto do banco → é a verdade
--     para os bancos externos.
--
-- Prioridade de saldo POR CONTA (migração por etapas):
--   1. Se houver conta Pluggy casada (mesma empresa + mesmo banco) → usa Pluggy
--   2. Senão, se a conta for interna do Conta Azul (Conta Azul IP / Iugu) → usa Conta Azul
--   3. Senão (banco externo ainda sem Pluggy) → saldo NULL (mostra "—"),
--      nunca o número errado do Conta Azul
--
-- Colunas e nomes mantidos iguais à versão anterior (mesmo contrato p/ o app).
-- data_referencia passa a timestamptz (Pluggy é timestamptz) → DROP + CREATE.
-- ============================================================

DROP VIEW IF EXISTS v_saldos_ativos;

CREATE VIEW v_saldos_ativos AS
SELECT
  cba.id                                          AS conta_ativa_id,
  cba.empresa_id,
  cba.nome_exibicao,
  cba.banco                                       AS banco_categoria,
  cba.numero_cc,
  cba.agencia,
  cba.tipo_conta,
  -- fonte efetiva da conta (pluggy assume quando conectado)
  CASE WHEN pl.saldo IS NOT NULL THEN 'pluggy' ELSE cba.fonte_dados END AS fonte_dados,
  COALESCE(pl.banco_origem, ca.banco_origem)      AS banco_origem,
  COALESCE(pl.conta_origem, ca.conta_origem)      AS conta_origem,
  -- saldo: Pluggy > (Conta Azul só p/ contas internas) > NULL
  CASE
    WHEN pl.saldo IS NOT NULL                       THEN pl.saldo
    WHEN cba.banco IN ('Conta Azul IP', 'Iugu')     THEN ca.saldo
    ELSE NULL::numeric
  END                                             AS saldo,
  COALESCE(pl.data_referencia, ca.data_referencia::timestamptz) AS data_referencia,
  CASE
    WHEN pl.saldo IS NOT NULL                       THEN 'pluggy'
    WHEN cba.banco IN ('Conta Azul IP', 'Iugu')     THEN ca.fonte_saldo
    ELSE NULL::text
  END                                             AS fonte_saldo
FROM contas_bancarias_ativas cba
-- ── Lado Pluggy: casa por empresa + nome do banco (ignora prefixo "Banco ") ──
LEFT JOIN LATERAL (
  SELECT
    p.saldo,
    p.banco       AS banco_origem,
    p.numero_cc   AS conta_origem,
    p.data_referencia
  FROM v_saldos_pluggy p
  WHERE p.empresa_id = cba.empresa_id
    AND COALESCE(p.instituicao_nome, p.banco) ILIKE '%' || regexp_replace(cba.banco, '^Banco ', '') || '%'
  ORDER BY p.data_referencia DESC
  LIMIT 1
) pl ON true
-- ── Lado Conta Azul: lógica original (número exato OU padroes_match) ──
LEFT JOIN LATERAL (
  SELECT
    s.saldo,
    s.banco            AS banco_origem,
    s.conta            AS conta_origem,
    s.data_referencia,
    s.fonte            AS fonte_saldo
  FROM saldos_bancarios s
  WHERE s.empresa_id = cba.empresa_id
    AND (
      (s.conta IS NOT NULL AND REPLACE(REPLACE(s.conta, '-', ''), ' ', '') = REPLACE(REPLACE(cba.numero_cc, '-', ''), ' ', ''))
      OR EXISTS (
        SELECT 1 FROM unnest(cba.padroes_match) AS pat
        WHERE s.banco ILIKE '%' || pat || '%'
      )
    )
  ORDER BY s.data_referencia DESC
  LIMIT 1
) ca ON true
WHERE cba.ativo = true;

COMMENT ON VIEW v_saldos_ativos IS
  'Saldos das contas reais por empresa. Pluggy (Open Finance) é a fonte para bancos externos; Conta Azul só para contas internas (IP/Iugu). Banco externo sem Pluggy → saldo NULL (não usa Conta Azul, que erra esses saldos).';

GRANT SELECT ON v_saldos_ativos TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
