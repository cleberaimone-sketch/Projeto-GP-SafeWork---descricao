-- ASO vencido por trabalhador. (Aplicada via MCP em 09/09/2026 — ver corpo da
-- função no banco para os comentários completos.)
--
-- Duas decisões que definem o número:
--
-- 1. Parte da lista de TRABALHADORES COM VÍNCULO e procura a consulta, não o
--    contrário. A versão anterior (fn_aso_situacao, removida) partia dos exames
--    e só enxergava quem fez — deixando de fora exatamente o caso mais grave,
--    quem não fez nenhum.
--
-- 2. "Sem consulta no espelho" conta como VENCIDO. O espelho cobre ~365 dias
--    (das 121.427 linhas, só 359 são anteriores), então não achar consulta ali
--    é não ter consulta no último ano — que é a definição de vencido. Separá-los
--    mostrava 5 onde o número real de quem precisa agendar era 2.285.
--
-- LIMITE: depende do cadastro de situação estar correto no SOC. Quem saiu e
-- continua 'Ativo' aparece como vencido; quem está ativo cadastrado como
-- 'Inativo' NÃO aparece — e esse é o silêncio perigoso.

drop function if exists public.fn_aso_situacao(integer);
