-- Remove índice único redundante em lancamentos_financeiros.
--
-- Existiam DOIS objetos únicos sobre exatamente as mesmas colunas
-- (empresa_id, fonte_id, fonte):
--
--   1. lancamentos_empresa_fonte_unique      → CONSTRAINT (mantida)
--   2. lancamentos_empresa_fonteid_fonte_uniq → índice avulso (removido aqui)
--
-- Mantemos a constraint, não o índice avulso: o ON CONFLICT do sync se apoia na
-- constraint, e ela é o objeto declarado no schema. O índice duplicado só
-- custava escrita a cada upsert — em lotes de 500 durante o sync, era trabalho
-- dobrado sem retorno.

DROP INDEX IF EXISTS public.lancamentos_empresa_fonteid_fonte_uniq;

NOTIFY pgrst, 'reload schema';
