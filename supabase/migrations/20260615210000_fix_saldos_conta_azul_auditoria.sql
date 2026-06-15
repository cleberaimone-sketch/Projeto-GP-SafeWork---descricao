-- ============================================================
-- Auditoria saldos Conta Azul — correção (Cleber, 2026-06-15)
-- ============================================================
-- Problemas encontrados na conferência das contas internas:
--   1. 182 linhas em saldos_bancarios com empresa_id NULL (lixo de sync),
--      incluindo um -243.302,55 fantasma na conta 15534.
--   2. 10 linhas da SW Londrina com data fictícia 2099-01-01 que venciam
--      a ordenação "saldo mais recente" e mascaravam o saldo real.
--   3. A "Caixinha" (dinheiro físico no caixa da clínica — conta SEPARADA,
--      mas real) estava sendo casada como se fosse a conta bancária IP/Iugu,
--      corrompendo o saldo de Santa Helena e SafeT.
--   4. A view casava por NOME ganhando do número de conta exato.
--
-- Correções:
--   A. Apaga linhas órfãs (empresa_id NULL) e datas futuras (sync inválido).
--   B. Remove os padrões "Caixinha" dos padroes_match das contas bancárias
--      (a Caixinha não é a conta IP/Iugu — será cadastrada à parte depois).
--   C. Reescreve v_saldos_ativos: prioriza match por número de conta EXATO
--      sobre match por nome, e ignora data_referencia futura.
-- ============================================================

-- ── A. Limpeza de saldos_bancarios ──────────────────────────
DELETE FROM saldos_bancarios WHERE empresa_id IS NULL;
DELETE FROM saldos_bancarios WHERE data_referencia > CURRENT_DATE;

-- ── B. Tira a "Caixinha" dos padrões das contas bancárias ───
-- A Caixinha é dinheiro em espécie (conta separada). Não deve casar
-- com a conta bancária Conta Azul IP / Iugu.
UPDATE contas_bancarias_ativas
SET padroes_match = COALESCE(
  (SELECT array_agg(p) FROM unnest(padroes_match) AS p WHERE p NOT ILIKE '%caixinha%'),
  '{}'
)
WHERE EXISTS (SELECT 1 FROM unnest(padroes_match) AS p WHERE p ILIKE '%caixinha%');

-- ── C. View com prioridade de número de conta exato ─────────
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
  CASE WHEN pl.saldo IS NOT NULL THEN 'pluggy' ELSE cba.fonte_dados END AS fonte_dados,
  COALESCE(pl.banco_origem, ca.banco_origem)      AS banco_origem,
  COALESCE(pl.conta_origem, ca.conta_origem)      AS conta_origem,
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
-- Pluggy: casa por empresa + nome do banco (ignora prefixo "Banco ")
LEFT JOIN LATERAL (
  SELECT p.saldo, p.banco AS banco_origem, p.numero_cc AS conta_origem, p.data_referencia
  FROM v_saldos_pluggy p
  WHERE p.empresa_id = cba.empresa_id
    AND COALESCE(p.instituicao_nome, p.banco) ILIKE '%' || regexp_replace(cba.banco, '^Banco ', '') || '%'
  ORDER BY p.data_referencia DESC
  LIMIT 1
) pl ON true
-- Conta Azul: número exato tem PRIORIDADE sobre match por nome; ignora data futura
LEFT JOIN LATERAL (
  SELECT s.saldo, s.banco AS banco_origem, s.conta AS conta_origem, s.data_referencia, s.fonte AS fonte_saldo
  FROM saldos_bancarios s
  WHERE s.empresa_id = cba.empresa_id
    AND s.data_referencia <= CURRENT_DATE
    AND (
      (s.conta IS NOT NULL AND REPLACE(REPLACE(s.conta, '-', ''), ' ', '') = REPLACE(REPLACE(cba.numero_cc, '-', ''), ' ', ''))
      OR EXISTS (
        SELECT 1 FROM unnest(cba.padroes_match) AS pat
        WHERE s.banco ILIKE '%' || pat || '%'
      )
    )
  ORDER BY
    -- 1º: linhas cujo número de conta bate exato
    (s.conta IS NOT NULL AND REPLACE(REPLACE(s.conta, '-', ''), ' ', '') = REPLACE(REPLACE(cba.numero_cc, '-', ''), ' ', '')) DESC,
    -- 2º: a mais recente (já sem datas futuras)
    s.data_referencia DESC
  LIMIT 1
) ca ON true
WHERE cba.ativo = true;

COMMENT ON VIEW v_saldos_ativos IS
  'Saldos das contas reais por empresa. Pluggy para bancos externos; Conta Azul só para contas internas (IP/Iugu), priorizando número de conta exato. Caixinha (dinheiro em espécie) é conta separada, não casa aqui.';

GRANT SELECT ON v_saldos_ativos TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
