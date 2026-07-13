-- ============================================================
-- Pluggy / Open Finance — EXTRATO (transações) para conciliação
-- ============================================================
-- Até aqui o sync só trazia SALDO (pluggy_accounts). Para conciliação
-- bancária (cruzar o que o ERP registra × o que de fato entrou/saiu no banco)
-- precisamos do extrato linha a linha. Cada transação vem do endpoint
-- /transactions do Pluggy (amount com sinal: negativo = débito, positivo =
-- crédito).

create table if not exists pluggy_transactions (
  id uuid primary key default gen_random_uuid(),
  pluggy_transaction_id text not null unique,      -- id da transação no Pluggy
  pluggy_account_id text not null references pluggy_accounts(pluggy_account_id) on delete cascade,
  empresa_id uuid references empresas(id) on delete set null,
  data date,                                       -- data da transação
  descricao text,
  valor numeric(18,2) not null default 0,          -- sinal: - = saída, + = entrada
  tipo text,                                       -- DEBIT | CREDIT
  categoria text,                                  -- categoria do Pluggy (pode ser nula)
  saldo_apos numeric(18,2),                        -- balance após a transação
  status text,                                     -- PENDING | POSTED
  raw jsonb,                                        -- payload bruto (auditoria)
  -- Conciliação
  conciliado boolean not null default false,
  lancamento_id text,                              -- id do lançamento do ERP casado
  metodo_conciliacao text,                         -- 'auto' | 'manual'
  conciliado_em timestamptz,
  created_at timestamptz default now(),
  atualizado_em timestamptz default now()
);

create index if not exists idx_pluggy_tx_account   on pluggy_transactions(pluggy_account_id);
create index if not exists idx_pluggy_tx_empresa   on pluggy_transactions(empresa_id);
create index if not exists idx_pluggy_tx_data      on pluggy_transactions(data);
create index if not exists idx_pluggy_tx_valor     on pluggy_transactions(empresa_id, valor);
create index if not exists idx_pluggy_tx_conciliado on pluggy_transactions(conciliado);

grant select, insert, update, delete on pluggy_transactions to anon, authenticated, service_role;

notify pgrst, 'reload schema';
