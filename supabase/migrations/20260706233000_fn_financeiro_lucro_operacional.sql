-- ============================================================
-- Lucro operacional — exclui do DRE o que NÃO é operação
-- ============================================================
-- Regra de negócio (Cleber, 2026-07-06):
--   O LUCRO/DRE mede só a OPERAÇÃO. Ficam de fora (aparecem só no
--   fluxo de caixa, que lê os lançamentos direto e não usa estas RPCs):
--     grupo 5 = Juros / encargos financeiros
--     grupo 6 = Investimento (móveis, terrenos, leasing, veículos, software)
--     grupo 7 = Empréstimos (sócios, terceiros)
--     grupo 8 = Parcelamentos / contas atrasadas
--   Continuam na operação: grupo 1 (receita), 2 (impostos), 3 (custos),
--   4 (despesas). Transferências internas já saíam via categorias_excluidas.
--
-- Só a parte ACCRUAL (por data_vencimento) das RPCs é filtrada — é ela que
-- alimenta Cockpit/KPIs, Tendência (EBITDA) e Mapa de Empresas. A parte CASH
-- (caixa_pago, por data_pagamento) permanece completa.

-- Classifica pelo 1º dígito da categoria do plano de contas do Conta Azul.
CREATE OR REPLACE FUNCTION fn_nao_operacional(txt text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(substring(trim(COALESCE(txt, '')) FROM '^([0-9])'), '') IN ('5','6','7','8')
$$;

-- 1. Totais mensais (accrual filtrado; cash completo)
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
  -- Accrual (DRE): agrupa por data_vencimento — EXCLUI não-operacional
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
      WHERE fn_normalizar(lf.categoria) = fn_normalizar(ce.categoria)
    )
    AND NOT fn_nao_operacional(lf.categoria)
  GROUP BY 1, 2, 3

  UNION ALL

  -- Cash (fluxo): agrupa por data_pagamento — mantém tudo (menos transferências)
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
      WHERE fn_normalizar(lf.categoria) = fn_normalizar(ce.categoria)
    )
  GROUP BY 1, 2, 3

  ORDER BY 1, 2, 3;
$$;

-- 2. Totais por categoria x tipo: waterfall EBITDA (DRE — exclui não-operacional)
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
      WHERE fn_normalizar(lf.categoria) = fn_normalizar(ce.categoria)
    )
    AND NOT fn_nao_operacional(lf.categoria)
  GROUP BY 1, 2
  ORDER BY 1, 2;
$$;

-- 3. Totais por empresa no período: Mapa de Empresas (DRE — exclui não-operacional)
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
      WHERE fn_normalizar(lf.categoria) = fn_normalizar(ce.categoria)
    )
    AND NOT fn_nao_operacional(lf.categoria)
  GROUP BY 1, 2
  ORDER BY 1, 2;
$$;

-- 4. Totais por empresa: gráfico Revenue por Empresa (DRE — exclui não-operacional)
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
      WHERE fn_normalizar(lf.categoria) = fn_normalizar(ce.categoria)
    )
    AND NOT fn_nao_operacional(lf.categoria)
  GROUP BY 1, 2
  ORDER BY 1, 2;
$$;

GRANT EXECUTE ON FUNCTION fn_nao_operacional         TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_financeiro_mensal       TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_financeiro_categorias   TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_financeiro_empresa_mes  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_financeiro_por_empresa  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
