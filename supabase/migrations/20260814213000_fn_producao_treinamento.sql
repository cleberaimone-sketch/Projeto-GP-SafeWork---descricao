-- Agrega a produção de treinamentos num único jsonb.
--
-- Agrega no banco em vez de ler as linhas e somar no Node por dois motivos: o
-- PostgREST corta em 1000 linhas (o total passaria despercebido conforme a base
-- crescesse) e a página faz uma chamada só em vez de cinco.
--
-- Cada bloco agrupa primeiro e só então monta o jsonb — montar o objeto no
-- mesmo SELECT do GROUP BY coloca a agregação dentro da chave de agrupamento.
--
-- SECURITY DEFINER com EXECUTE apenas para service_role — mesmo padrão das
-- demais fn_ do projeto, e search_path fixo para não permitir que o chamador
-- redirecione a resolução de nomes.

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
  WITH base AS (
    SELECT * FROM vendas_treinamento
    WHERE empresa_id = p_empresa_id
      AND data_venda BETWEEN p_de AND p_ate
  ),
  por_mes AS (
    SELECT to_char(data_venda, 'YYYY-MM') AS mes,
           count(*) AS qtd,
           COALESCE(sum(valor), 0) AS valor
    FROM base GROUP BY 1
  ),
  por_nr AS (
    SELECT nr, count(*) AS qtd
    FROM base, unnest(nrs) AS nr
    GROUP BY nr ORDER BY count(*) DESC LIMIT 12
  ),
  por_unidade AS (
    SELECT COALESCE(unidade, 'Não informada') AS unidade,
           count(*) AS qtd,
           COALESCE(sum(valor), 0) AS valor
    FROM base GROUP BY 1
  ),
  por_modalidade AS (
    SELECT COALESCE(modalidade, 'Não informada') AS modalidade, count(*) AS qtd
    FROM base GROUP BY 1
  ),
  por_cliente AS (
    SELECT cliente, count(*) AS qtd, COALESCE(sum(valor), 0) AS valor
    FROM base GROUP BY cliente ORDER BY sum(valor) DESC LIMIT 8
  )
  SELECT jsonb_build_object(
    'totalVendas',       (SELECT count(*) FROM base),
    'totalValor',        (SELECT COALESCE(sum(valor), 0) FROM base),
    'clientesDistintos', (SELECT count(DISTINCT cliente) FROM base),
    'clientesNovos',     (SELECT count(*) FROM base WHERE tipo_contrato ILIKE '%CLIENTE NOVO%'),
    'cortesias',         (SELECT count(*) FROM base WHERE cortesia),
    'periodoDe',         (SELECT min(data_venda) FROM base),
    'periodoAte',        (SELECT max(data_venda) FROM base),

    'porMes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('mes', mes, 'quantidade', qtd, 'valor', valor) ORDER BY mes)
      FROM por_mes), '[]'::jsonb),

    'topNrs', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('nr', nr, 'qtd', qtd) ORDER BY qtd DESC)
      FROM por_nr), '[]'::jsonb),

    'unidades', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('unidade', unidade, 'qtd', qtd, 'valor', valor) ORDER BY qtd DESC)
      FROM por_unidade), '[]'::jsonb),

    'modalidades', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('modalidade', modalidade, 'qtd', qtd) ORDER BY qtd DESC)
      FROM por_modalidade), '[]'::jsonb),

    'topClientes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('cliente', cliente, 'qtd', qtd, 'valor', valor) ORDER BY valor DESC)
      FROM por_cliente), '[]'::jsonb)
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_producao_treinamento(uuid, date, date) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_producao_treinamento(uuid, date, date) TO service_role;

NOTIFY pgrst, 'reload schema';
