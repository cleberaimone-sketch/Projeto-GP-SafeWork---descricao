-- Elimina o NULL da trava de renovação do Conta Azul.
--
-- Com a coluna anulável, a condição precisaria ser
-- "renovando_ate is null or renovando_ate < now()", que no supabase-js vira um
-- .or() com o timestamp embutido na string do filtro. Frágil dos dois lados, e
-- num caminho em que errar tem custo alto: se o filtro não casar, o sync pula
-- TODAS as empresas achando que estão travadas.
--
-- Com uma sentinela antiga no lugar do NULL, a condição vira um .lt() simples
-- e o caminho é o mesmo para linha nova e linha destravada.
update public.conta_azul_tokens
   set renovando_ate = timestamptz '1970-01-01 00:00:00+00'
 where renovando_ate is null or renovando_ate > now();

alter table public.conta_azul_tokens
  alter column renovando_ate set default timestamptz '1970-01-01 00:00:00+00';

alter table public.conta_azul_tokens
  alter column renovando_ate set not null;

comment on column public.conta_azul_tokens.renovando_ate is
  'Trava de renovacao: no futuro = outra execucao esta renovando este token. 1970 = destravado. Expira sozinha.';

notify pgrst, 'reload schema';
