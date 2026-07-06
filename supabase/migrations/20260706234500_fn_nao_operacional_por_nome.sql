-- ============================================================
-- Lucro operacional — reconhece não-operacionais SEM número de grupo
-- ============================================================
-- Além dos grupos 5,6,7,8 (juros/investimento/empréstimo/parcelamento),
-- alguns lançamentos estão categorizados só por texto no Conta Azul e
-- escapavam da regra. Cleber confirmou que também saem do lucro (ficam
-- no fluxo de caixa):
--   - "Empréstimo*" (mútuo entre contas, de sócios, terceiros, bancos)
--   - "Venda de Ativos" (desinvestimento, não é receita operacional)
--   - "oi" (lixo de categorização)
-- Só recria fn_nao_operacional; as RPCs de DRE já a chamam por nome.

CREATE OR REPLACE FUNCTION fn_nao_operacional(txt text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(substring(trim(COALESCE(txt, '')) FROM '^([0-9])'), '') IN ('5','6','7','8')
      OR fn_normalizar(txt) LIKE 'EMPRESTIMO%'
      OR fn_normalizar(txt) = 'VENDA DE ATIVOS'
      OR fn_normalizar(txt) = 'OI'
$$;

NOTIFY pgrst, 'reload schema';
