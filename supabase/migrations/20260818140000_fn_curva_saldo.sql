-- Curva de saldo projetado, dia a dia.
--
-- Responde a pergunta que o saldo sozinho não responde: "quanto eu tenho HOJE e
-- como isso evolui conforme as contas vencem". Começa no saldo real das contas
-- ativas e caminha somando o que entra e subtraindo o que sai, na data em que
-- cada título vence.
--
-- DECISÕES DO CAIXA DO DIA entram aqui: um título marcado com data_prevista
-- desloca para essa data em vez do vencimento original. É o que permite marcar
-- "adiar" e ver a curva mudar, sem precisar de simulador separado.
--
-- ATRASADOS ficam FORA por padrão. São R$ 855 mil vencidos: jogados no dia zero
-- afundam a curva e escondem a leitura operacional dos próximos dias. Vêm
-- separados no campo `atrasados` para a tela mostrar como faixa/alerta, e podem
-- ser incluídos com p_incluir_atrasados quando se quer a foto dura.
--
-- Transferências entre empresas do grupo saem — não são caixa de verdade.

CREATE OR REPLACE FUNCTION public.fn_curva_saldo(
  p_empresa_id        uuid    DEFAULT NULL,
  p_dias              integer DEFAULT 90,
  p_incluir_atrasados boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH parametros AS (
    SELECT current_date AS hoje,
           (current_date + (p_dias || ' days')::interval)::date AS fim
  ),
  saldo_inicial AS (
    SELECT COALESCE(sum(saldo), 0) AS valor
    FROM v_saldos_ativos
    WHERE p_empresa_id IS NULL OR empresa_id = p_empresa_id
  ),
  -- Títulos em aberto, já com a data que vale: a decidida no Caixa do Dia
  -- quando existir, senão o vencimento.
  abertos AS (
    SELECT l.tipo,
           l.valor,
           COALESCE(d.data_prevista, l.data_vencimento) AS data_efetiva,
           l.data_vencimento < (SELECT hoje FROM parametros) AS atrasado
    FROM lancamentos_financeiros l
    LEFT JOIN decisoes_pagamento d ON d.lancamento_id = l.id::text
    WHERE l.status IN ('pendente', 'vencido')
      AND (p_empresa_id IS NULL OR l.empresa_id = p_empresa_id)
      AND NOT EXISTS (SELECT 1 FROM categorias_excluidas ce
                      WHERE fn_normalizar(ce.categoria) = fn_normalizar(l.categoria))
  ),
  atrasados AS (
    SELECT
      COALESCE(sum(valor) FILTER (WHERE tipo = 'receita'), 0) AS receber,
      COALESCE(sum(valor) FILTER (WHERE tipo = 'despesa'), 0) AS pagar
    FROM abertos WHERE atrasado
  ),
  dias AS (
    SELECT generate_series((SELECT hoje FROM parametros),
                           (SELECT fim  FROM parametros), '1 day')::date AS dia
  ),
  movimento AS (
    SELECT d.dia,
           COALESCE(sum(a.valor) FILTER (WHERE a.tipo = 'receita'), 0) AS entradas,
           COALESCE(sum(a.valor) FILTER (WHERE a.tipo = 'despesa'), 0) AS saidas
    FROM dias d
    LEFT JOIN abertos a
      ON a.data_efetiva = d.dia
     AND (NOT a.atrasado OR p_incluir_atrasados IS FALSE)
    GROUP BY d.dia
  ),
  -- Com atrasados ligados, todo o vencido cai no primeiro dia: é dívida devida
  -- agora, não em data futura.
  com_atrasado AS (
    SELECT m.dia,
           m.entradas + CASE WHEN p_incluir_atrasados AND m.dia = (SELECT hoje FROM parametros)
                             THEN (SELECT receber FROM atrasados) ELSE 0 END AS entradas,
           m.saidas   + CASE WHEN p_incluir_atrasados AND m.dia = (SELECT hoje FROM parametros)
                             THEN (SELECT pagar   FROM atrasados) ELSE 0 END AS saidas
    FROM movimento m
  ),
  curva AS (
    SELECT dia, entradas, saidas,
           (SELECT valor FROM saldo_inicial)
             + sum(entradas - saidas) OVER (ORDER BY dia ROWS UNBOUNDED PRECEDING) AS saldo
    FROM com_atrasado
  )
  SELECT jsonb_build_object(
    'saldoInicial',      (SELECT valor FROM saldo_inicial),
    'atrasadoPagar',     (SELECT pagar   FROM atrasados),
    'atrasadoReceber',   (SELECT receber FROM atrasados),
    'incluiAtrasados',   p_incluir_atrasados,
    'saldoMinimo',       (SELECT min(saldo) FROM curva),
    'diaSaldoMinimo',    (SELECT dia FROM curva ORDER BY saldo LIMIT 1),
    'saldoFinal',        (SELECT saldo FROM curva ORDER BY dia DESC LIMIT 1),
    'totalEntradas',     (SELECT COALESCE(sum(entradas), 0) FROM curva),
    'totalSaidas',       (SELECT COALESCE(sum(saidas), 0)   FROM curva),
    'pontos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'dia', dia, 'entradas', entradas, 'saidas', saidas, 'saldo', saldo
             ) ORDER BY dia)
      FROM curva), '[]'::jsonb)
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_curva_saldo(uuid, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_curva_saldo(uuid, integer, boolean) TO service_role;

NOTIFY pgrst, 'reload schema';
