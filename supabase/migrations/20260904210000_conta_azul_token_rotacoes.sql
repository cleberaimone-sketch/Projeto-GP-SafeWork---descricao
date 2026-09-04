-- Auditoria da rotação do refresh_token do Conta Azul.
--
-- Em 28/08/2026 às 03:01 os oito tokens rotacionaram com sucesso. Em 29/08 às
-- 03:01, sete estavam inválidos — sem nenhuma execução entre as duas. Sem
-- registro do que foi enviado e do que voltou, não há como distinguir:
--
--   (a) o token novo não foi persistido e o sync tentou com o antigo
--   (b) o token novo foi persistido e o Cognito o invalidou por conta própria
--
-- São causas opostas: (a) é bug nosso, (b) é política do provedor. A tabela
-- guarda o HASH do token usado e do recebido — nunca o valor. sha256 truncado
-- basta para comparar duas rotações e é irreversível.

create table if not exists public.conta_azul_token_rotacoes (
  id             uuid primary key default gen_random_uuid(),
  empresa_nome   text not null,
  empresa_id     uuid,
  -- Hash do refresh_token ENVIADO ao Cognito nesta tentativa.
  hash_usado     text,
  -- Hash do refresh_token DEVOLVIDO. Nulo quando o Cognito não rotacionou
  -- (reusou o mesmo) ou quando a chamada falhou.
  hash_recebido  text,
  -- Se o token novo chegou a ser gravado em conta_azul_tokens.
  persistido     boolean,
  -- 'ok' | 'invalid_grant' | 'erro'
  resultado      text not null,
  detalhe        text,
  criado_em      timestamptz not null default now()
);

create index if not exists idx_ca_token_rot_empresa_data
  on public.conta_azul_token_rotacoes (empresa_nome, criado_em desc);

grant select, insert on public.conta_azul_token_rotacoes to anon, authenticated, service_role;

notify pgrst, 'reload schema';

-- ── Trava de renovação, entre instâncias ────────────────────────────────────
--
-- O client já deduplica refresh concorrente por empresa, mas só DENTRO do
-- processo (um Map em memória). Na Vercel cada invocação pode ser outra
-- lambda: dois syncs simultâneos leem o mesmo refresh_token do banco, ambos
-- chamam o Cognito, o primeiro rotaciona e o segundo recebe invalid_grant —
-- e a empresa queima até reautorização manual.
--
-- A trava vive na própria linha do token. Quem for renovar precisa vencer um
-- UPDATE condicional, que no Postgres é atômico: só uma transação consegue
-- marcar a linha. Quem perder pula a empresa em vez de disputar o Cognito.
--
-- Expira sozinha: se a função morrer no meio (a Vercel pode matá-la), a trava
-- vence em minutos em vez de deixar a empresa presa para sempre.
alter table public.conta_azul_tokens
  add column if not exists renovando_ate timestamptz;

comment on column public.conta_azul_tokens.renovando_ate is
  'Trava de renovação: enquanto no futuro, outra execução está renovando este token. Expira sozinha.';

notify pgrst, 'reload schema';
