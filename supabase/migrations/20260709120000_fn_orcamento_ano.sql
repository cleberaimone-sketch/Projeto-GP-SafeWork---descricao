-- fn_orcamento_ano — agrega o REALIZADO do orçamento por (categoria, tipo, mês)
-- Corrige o bug do cap de 1000 linhas: a página de orçamento montava tipo e
-- realizado a partir de no máximo 1000 lançamentos (de ~12k/ano), fazendo
-- categorias de receita sem lançamento nesse subconjunto caírem no default
-- "despesa" e o realizado contar só ~8% dos dados. Agora agrega no Postgres.
--
-- Diferente de fn_financeiro_categorias: (1) NÃO exclui não-operacional
-- (o orçamento mostra empréstimos/parcelamentos/impostos também) e (2) quebra
-- por MÊS de pagamento (regime caixa) para o "Realizado vs Meta" mensal.
--
-- Escopo: lançamentos cujo VENCIMENTO cai no ano (define a linha do orçamento),
-- pagos (status pago/parcial), agrupados pelo MÊS de data_pagamento.
-- Exclui transferências internas (categorias_excluidas), igual à página.

CREATE OR REPLACE FUNCTION fn_orcamento_ano(
  p_ano        int,
  p_empresa_id uuid DEFAULT NULL
)
RETURNS TABLE (
  categoria text,
  tipo      text,
  mes       int,
  realizado numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    COALESCE(lf.categoria, '(sem categoria)')      AS categoria,
    lf.tipo,
    EXTRACT(MONTH FROM lf.data_pagamento)::int      AS mes,
    COALESCE(SUM(lf.valor), 0)                      AS realizado
  FROM lancamentos_financeiros lf
  WHERE lf.status IN ('pago', 'parcial')
    AND lf.data_pagamento IS NOT NULL
    AND lf.data_vencimento BETWEEN make_date(p_ano, 1, 1) AND make_date(p_ano, 12, 31)
    AND (p_empresa_id IS NULL OR lf.empresa_id = p_empresa_id)
    AND NOT EXISTS (
      SELECT 1 FROM categorias_excluidas ce
      WHERE fn_normalizar(lf.categoria) = fn_normalizar(ce.categoria)
    )
  GROUP BY 1, 2, 3
  ORDER BY 1, 3;
$$;

GRANT EXECUTE ON FUNCTION fn_orcamento_ano(int, uuid) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
