-- ============================================================
-- Caixa do Dia — decisões de pagamento + prioridade por categoria
-- ============================================================
-- Painel operacional onde o financeiro decide o que pagar. O estado do usuário
-- (decisão, override de prioridade) fica FORA de lancamentos_financeiros, que é
-- sobrescrito pelo sync do Conta Azul. Chaveado por lancamento_id → quando a
-- conta vira 'pago' no Conta Azul, ela sai da fila sozinha, e a decisão fica no
-- histórico.

-- Decisão por lançamento
create table if not exists decisoes_pagamento (
  id uuid primary key default gen_random_uuid(),
  lancamento_id text not null unique,      -- id do lançamento (fonte_id do Conta Azul)
  decisao text,                            -- 'pagar' | 'adiar' | null
  data_prevista date,                      -- quando pretende pagar
  prioridade_override text,                -- 'intocavel' | 'normal' | null (exceção pontual)
  observacao text,
  decidido_por uuid,
  decidido_em timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists idx_decisoes_decisao on decisoes_pagamento(decisao);
create index if not exists idx_decisoes_data_prevista on decisoes_pagamento(data_prevista);

-- Prioridade permanente por categoria (override da regra automática de "intocável")
create table if not exists categorias_prioridade (
  categoria text primary key,
  intocavel boolean not null default false,
  atualizado_em timestamptz default now()
);

grant select, insert, update, delete on decisoes_pagamento   to anon, authenticated, service_role;
grant select, insert, update, delete on categorias_prioridade to anon, authenticated, service_role;

notify pgrst, 'reload schema';
