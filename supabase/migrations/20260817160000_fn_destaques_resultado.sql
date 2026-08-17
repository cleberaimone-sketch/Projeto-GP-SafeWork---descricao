-- Destaques que explicam a composição do resultado, para o demonstrativo do
-- sócio não deixar dúvida sobre o que está dentro de cada número.
--
-- Três coisas precisam ficar explícitas:
--
-- 1. INTERMEDIAÇÃO MOHA — entra como receita (1.05.02) e sai como repasse
--    (3.05.02). Vista só pelo lado da receita, infla o faturamento: são
--    R$ 468 mil de entrada contra R$ 427 mil de repasse, ou seja o que de fato
--    fica na empresa é a diferença. Sem separar, parece um negócio três vezes
--    maior do que é.
--
-- 2. PRÓ-LABORE — R$ 4 mil por mês, lançado em 4.03.01, que é grupo 4 e
--    portanto JÁ está deduzido do lucro apurado. Quem lê precisa saber que o
--    lucro é depois do pró-labore, não antes.
--
-- 3. IMPOSTOS — o que está de fato lançado. Retorna também a contagem de meses
--    com lançamento, para a página poder confrontar com o número de meses do
--    período: hoje a SafeT tem DAS em 6 de 32 meses, e mostrar o valor sem
--    mostrar a lacuna seria enganoso.
--
-- Retiradas de sócio lançadas como empréstimo (7.01.03) ficam fora do lucro por
-- serem grupo 7 — comportamento correto, já que distribuição não é despesa, mas
-- a página avisa que existem para o sócio não confundir lucro apurado com saldo
-- a receber.

CREATE OR REPLACE FUNCTION public.fn_destaques_resultado(
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
    SELECT * FROM lancamentos_financeiros
    WHERE empresa_id = p_empresa_id
      AND status <> 'cancelado'
      AND data_vencimento BETWEEN p_de AND p_ate
  )
  SELECT jsonb_build_object(
    'mohaReceita', COALESCE((SELECT sum(valor) FROM base
       WHERE categoria ILIKE '%Intermediadas%' OR categoria ILIKE '%Intermediada%'), 0),
    'mohaRepasse', COALESCE((SELECT sum(valor) FROM base
       WHERE categoria ILIKE '%Repassados Moha%' OR categoria ILIKE '%Repassado Moha%'), 0),

    'receitaPropria', COALESCE((SELECT sum(valor) FROM base
       WHERE tipo = 'receita'
         AND categoria NOT ILIKE '%Intermediad%'
         AND NOT EXISTS (SELECT 1 FROM categorias_excluidas ce
                         WHERE fn_normalizar(ce.categoria) = fn_normalizar(base.categoria))), 0),

    'prolabore', COALESCE((SELECT sum(valor) FROM base
       WHERE categoria ILIKE '%Pró-labore%' OR categoria ILIKE '%Pro-labore%'), 0),
    'prolaboreMeses', (SELECT count(DISTINCT to_char(data_vencimento, 'YYYY-MM')) FROM base
       WHERE categoria ILIKE '%Pró-labore%' OR categoria ILIKE '%Pro-labore%'),
    'prolaboreUltimo', (SELECT max(data_vencimento) FROM base
       WHERE categoria ILIKE '%Pró-labore%' OR categoria ILIKE '%Pro-labore%'),

    -- Regex com limite de palavra (\m \M), não ILIKE: '%ISS%' casava com
    -- "ProfISSionais" e "ComISSões", inflando o total de impostos de R$ 31 mil
    -- para R$ 1,06 milhão. Mesmo risco em PIS.
    'impostos', COALESCE((SELECT sum(valor) FROM base
       WHERE categoria ~* '(simples nacional|irpj|csll|cofins|\minss\M|\miss\M|\mpis\M)'), 0),
    'impostosMeses', (SELECT count(DISTINCT to_char(data_vencimento, 'YYYY-MM')) FROM base
       WHERE categoria ~* '(simples nacional|irpj|csll|cofins|\minss\M|\miss\M|\mpis\M)'),

    'retiradasSocios', COALESCE((SELECT sum(valor) FROM base
       WHERE categoria ILIKE '%Empréstimos de Sócios%'
          OR categoria ILIKE '%Emprestimos de Socios%'), 0),

    'mesesPeriodo', (SELECT count(DISTINCT to_char(data_vencimento, 'YYYY-MM')) FROM base)
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_destaques_resultado(uuid, date, date) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_destaques_resultado(uuid, date, date) TO service_role;

NOTIFY pgrst, 'reload schema';
