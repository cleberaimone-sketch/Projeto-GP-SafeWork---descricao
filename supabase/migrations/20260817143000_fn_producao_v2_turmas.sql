-- fn_producao_treinamento v2 — passa a contar turmas de verdade.
--
-- A v1 contava vendas e extraía NRs do texto livre da negociação. Agora existe
-- turmas_treinamento (uma linha por turma, vinda da coluna Produtos), então:
--
--   * turmas é dado real, não proxy do número de vendas — uma venda pode conter
--     várias turmas ("NR23 | NR07 | NR35" é uma venda, três turmas);
--   * a contagem por norma fica mais precisa (NR-35 sai de 79 para 91 turmas);
--   * participantes só somam onde o contrato informou a lotação. Em 314 das 372
--     turmas o contrato só diz o valor, e a lotação real não é registrada em
--     lugar nenhum — a página expõe isso em vez de estimar (decisão do Cleber).
--
-- Vendas continuam sendo a base de clientes, unidades e valor contratado.

CREATE OR REPLACE FUNCTION public.fn_producao_treinamento(
  p_empresa_id uuid,
  p_de         date,
  p_ate        date
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH v AS (
    SELECT * FROM vendas_treinamento
    WHERE empresa_id = p_empresa_id AND data_venda BETWEEN p_de AND p_ate
  ),
  t AS (
    SELECT * FROM turmas_treinamento
    WHERE empresa_id = p_empresa_id AND data_venda BETWEEN p_de AND p_ate
  ),
  turmas_mes AS (
    SELECT to_char(data_venda, 'YYYY-MM') AS mes,
           count(*) AS turmas,
           COALESCE(sum(vagas), 0) AS participantes,
           COALESCE(sum(valor), 0) AS valor
    FROM t GROUP BY 1
  ),
  por_norma AS (
    SELECT norma, count(*) AS turmas, COALESCE(sum(vagas), 0) AS participantes
    FROM t GROUP BY norma ORDER BY count(*) DESC LIMIT 12
  ),
  por_modalidade AS (
    SELECT modalidade, count(*) AS turmas FROM t GROUP BY modalidade
  ),
  por_unidade AS (
    SELECT COALESCE(unidade, 'Não informada') AS unidade,
           count(*) AS qtd, COALESCE(sum(valor), 0) AS valor
    FROM v GROUP BY 1
  ),
  por_cliente AS (
    SELECT cliente, count(*) AS qtd, COALESCE(sum(valor), 0) AS valor
    FROM v GROUP BY cliente ORDER BY sum(valor) DESC LIMIT 8
  )
  SELECT jsonb_build_object(
    'totalVendas',       (SELECT count(*) FROM v),
    'totalValor',        (SELECT COALESCE(sum(valor), 0) FROM v),
    'clientesDistintos', (SELECT count(DISTINCT cliente) FROM v),
    'clientesNovos',     (SELECT count(*) FROM v WHERE tipo_contrato ILIKE '%CLIENTE NOVO%'),
    'cortesias',         (SELECT count(*) FROM v WHERE cortesia),
    'periodoDe',         (SELECT min(data_venda) FROM v),
    'periodoAte',        (SELECT max(data_venda) FROM v),

    'turmasTotal',            (SELECT count(*) FROM t),
    'turmasComLotacao',       (SELECT count(vagas) FROM t),
    'participantesConfirmados', (SELECT COALESCE(sum(vagas), 0) FROM t),

    'porMes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'mes', mes, 'turmas', turmas,
               'participantes', participantes, 'valor', valor) ORDER BY mes)
      FROM turmas_mes), '[]'::jsonb),

    'topNormas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'norma', norma, 'turmas', turmas,
               'participantes', participantes) ORDER BY turmas DESC)
      FROM por_norma), '[]'::jsonb),

    'modalidades', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('modalidade', modalidade, 'qtd', turmas) ORDER BY turmas DESC)
      FROM por_modalidade), '[]'::jsonb),

    'unidades', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('unidade', unidade, 'qtd', qtd, 'valor', valor) ORDER BY qtd DESC)
      FROM por_unidade), '[]'::jsonb),

    'topClientes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('cliente', cliente, 'qtd', qtd, 'valor', valor) ORDER BY valor DESC)
      FROM por_cliente), '[]'::jsonb)
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_producao_treinamento(uuid, date, date) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_producao_treinamento(uuid, date, date) TO service_role;

NOTIFY pgrst, 'reload schema';
