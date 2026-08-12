-- Fecha as RPCs financeiras que estavam abertas sem login, e fixa o search_path
-- das funções do projeto.
--
-- ── Parte 1: RPC pública ────────────────────────────────────────────────────
-- Ligar RLS nas tabelas (migration 20260804163000) não fechou este caminho:
-- estas cinco funções são SECURITY DEFINER, ou seja, rodam com a permissão do
-- dono e IGNORAM o RLS. Como anon tinha EXECUTE, qualquer um com a anon key
-- chamava /rest/v1/rpc/fn_financeiro_por_empresa sem login e recebia receita e
-- despesa consolidadas de todas as empresas. Verificado por requisição real.
--
-- Revogamos de anon E de authenticated: as cinco são chamadas exclusivamente
-- pelas páginas de dashboard via createServiceClient (service_role), que não é
-- afetado por REVOKE. Nenhum caminho do app usa estes roles para RPC.

-- ATENÇÃO ao PUBLIC: no Postgres, toda função nasce com EXECUTE concedido a
-- PUBLIC. Revogar só de anon e authenticated NÃO fecha nada — os dois herdam
-- de PUBLIC e continuam executando. Verificado na prática: após revogar apenas
-- os dois roles nominais, a RPC seguia devolvendo dados pela anon key.
-- O REVOKE FROM PUBLIC é o que efetivamente fecha.

REVOKE EXECUTE ON FUNCTION public.fn_financeiro_categorias(date, date, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_financeiro_empresa_mes(date, date)            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_financeiro_mensal(date, date, uuid, text)     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_financeiro_por_empresa(date, date)            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_orcamento_ano(integer, uuid)                  FROM PUBLIC, anon, authenticated;

-- service_role precisa continuar executando: é o client das páginas de dashboard.
GRANT EXECUTE ON FUNCTION public.fn_financeiro_categorias(date, date, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_financeiro_empresa_mes(date, date)            TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_financeiro_mensal(date, date, uuid, text)     TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_financeiro_por_empresa(date, date)            TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_orcamento_ano(integer, uuid)                  TO service_role;

-- ── Parte 2: search_path ────────────────────────────────────────────────────
-- Sem search_path fixo, quem chama a função pode manipular o search_path da
-- sessão e fazer a função resolver nomes de tabela/operador para objetos
-- plantados em outro schema. Em função SECURITY DEFINER isso vira escalonamento
-- de privilégio, já que o corpo roda como o dono (postgres).
--
-- Não mexemos nas funções das extensões pg_trgm e unaccent — são gerenciadas
-- pela extensão e devem ser alteradas por ela.

ALTER FUNCTION public.fn_financeiro_categorias(date, date, uuid, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_financeiro_empresa_mes(date, date)            SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_financeiro_mensal(date, date, uuid, text)     SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_financeiro_por_empresa(date, date)            SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_orcamento_ano(integer, uuid)                  SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_nao_operacional(text)                         SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_normalizar(text)                              SET search_path = public, pg_temp;
ALTER FUNCTION public.trigger_set_updated_at()                         SET search_path = public, pg_temp;
ALTER FUNCTION public.update_pluggy_items_updated_at()                 SET search_path = public, pg_temp;

NOTIFY pgrst, 'reload schema';
