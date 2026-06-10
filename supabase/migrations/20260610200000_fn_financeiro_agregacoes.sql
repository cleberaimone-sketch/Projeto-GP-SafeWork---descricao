-- ============================================================
-- Dashboard financeiro — funções RPC de agregação
-- Substituem fetch de 35k+ registros brutos pela API
-- Cada função retorna < 200 linhas (GROUP BY no banco)
-- ============================================================

-- 1. Totais mensais: trend 12 meses, sparklines, fluxo de caixa, KPI totals
CREATE OR REPLACE FUNCTION fn_financeiro_mensal(
  p_de          date,
  p_ate         date,
  p_empresa_id  uuid DEFAULT NULL,
  p_tipo        text DEFAULT NULL
)
RETURNS TABLE (
  mes          text,
  tipo         text,
  status_grupo text,
  total        numeric,
  qtd          bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  -- Accrual: agrupa por data_vencimento (para rec/desp do mês)
  SELECT
    to_char(lf.data_vencimento, 'YYYY-MM') AS mes,
    lf.tipo,
    CASE
      WHEN lf.status IN ('pago', 'parcial') THEN 'pago'
      WHEN lf.status = 'vencido'            THEN 'vencido'
      ELSE                                       'pendente'
    END AS status_grupo,
    COALESCE(SUM(lf.valor), 0) AS total,
    COUNT(*) AS qtd
  FROM lancamentos_financeiros lf
  WHERE lf.status != 'cancelado'
    AND lf.data_vencimento BETWEEN p_de AND p_ate
    AND (p_empresa_id IS NULL OR lf.empresa_id = p_empresa_id)
    AND (p_tipo IS NULL OR lf.tipo = p_tipo)
    AND NOT EXISTS (
      SELECT 1 FROM categorias_excluidas ce
      WHERE LOWER(TRIM(COALESCE(lf.categoria, ''))) = LOWER(TRIM(ce.categoria))
    )
  GROUP BY 1, 2, 3

  UNION ALL

  -- Cash: agrupa por data_pagamento (para recPago/despPago no fluxo de caixa)
  -- Inclui pagamentos cujo data_pagamento cai NO período, mesmo que vencimento seja fora
  SELECT
    to_char(lf.data_pagamento, 'YYYY-MM') AS mes,
    lf.tipo,
    'caixa_pago' AS status_grupo,
    COALESCE(SUM(lf.valor), 0) AS total,
    COUNT(*) AS qtd
  FROM lancamentos_financeiros lf
  WHERE lf.status IN ('pago', 'parcial')
    AND lf.data_pagamento IS NOT NULL
    AND lf.data_pagamento BETWEEN p_de AND p_ate
    AND (p_empresa_id IS NULL OR lf.empresa_id = p_empresa_id)
    AND (p_tipo IS NULL OR lf.tipo = p_tipo)
    AND NOT EXISTS (
      SELECT 1 FROM categorias_excluidas ce
      WHERE LOWER(TRIM(COALESCE(lf.categoria, ''))) = LOWER(TRIM(ce.categoria))
    )
  GROUP BY 1, 2, 3

  ORDER BY 1, 2, 3;
$$;

-- 2. Totais por categoria × tipo: waterfall EBITDA
CREATE OR REPLACE FUNCTION fn_financeiro_categorias(
  p_de         date,
  p_ate        date,
  p_empresa_id uuid DEFAULT NULL,
  p_tipo       text DEFAULT NULL
)
RETURNS TABLE (
  categoria text,
  tipo      text,
  total     numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    COALESCE(lf.categoria, '') AS categoria,
    lf.tipo,
    COALESCE(SUM(lf.valor), 0) AS total
  FROM lancamentos_financeiros lf
  WHERE lf.status != 'cancelado'
    AND lf.data_vencimento BETWEEN p_de AND p_ate
    AND (p_empresa_id IS NULL OR lf.empresa_id = p_empresa_id)
    AND (p_tipo IS NULL OR lf.tipo = p_tipo)
    AND NOT EXISTS (
      SELECT 1 FROM categorias_excluidas ce
      WHERE LOWER(TRIM(COALESCE(lf.categoria, ''))) = LOWER(TRIM(ce.categoria))
    )
  GROUP BY 1, 2
  ORDER BY 1, 2;
$$;

-- 3. Totais por empresa no mês corrente: Mapa de Empresas
CREATE OR REPLACE FUNCTION fn_financeiro_empresa_mes(
  p_mes_inicio date,
  p_mes_fim    date
)
RETURNS TABLE (
  empresa_id uuid,
  tipo       text,
  total      numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    lf.empresa_id,
    lf.tipo,
    COALESCE(SUM(lf.valor), 0) AS total
  FROM lancamentos_financeiros lf
  WHERE lf.status != 'cancelado'
    AND lf.data_vencimento BETWEEN p_mes_inicio AND p_mes_fim
    AND NOT EXISTS (
      SELECT 1 FROM categorias_excluidas ce
      WHERE LOWER(TRIM(COALESCE(lf.categoria, ''))) = LOWER(TRIM(ce.categoria))
    )
  GROUP BY 1, 2
  ORDER BY 1, 2;
$$;

-- 4. Totais por empresa no período: gráfico Revenue por Empresa
CREATE OR REPLACE FUNCTION fn_financeiro_por_empresa(
  p_de date,
  p_ate date
)
RETURNS TABLE (
  empresa_id uuid,
  tipo       text,
  total      numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    lf.empresa_id,
    lf.tipo,
    COALESCE(SUM(lf.valor), 0) AS total
  FROM lancamentos_financeiros lf
  WHERE lf.status != 'cancelado'
    AND lf.data_vencimento BETWEEN p_de AND p_ate
    AND NOT EXISTS (
      SELECT 1 FROM categorias_excluidas ce
      WHERE LOWER(TRIM(COALESCE(lf.categoria, ''))) = LOWER(TRIM(ce.categoria))
    )
  GROUP BY 1, 2
  ORDER BY 1, 2;
$$;

-- Grants
GRANT EXECUTE ON FUNCTION fn_financeiro_mensal      TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_financeiro_categorias  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_financeiro_empresa_mes TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_financeiro_por_empresa TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
