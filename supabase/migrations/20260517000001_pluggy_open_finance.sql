-- ============================================================
-- Pluggy / Open Finance — saldos bancários reais
-- ============================================================
-- Resolve o problema dos saldos imprecisos do Conta Azul.
-- Estrutura:
--   pluggy_items     → conexões com instituições financeiras (1 por banco)
--   pluggy_accounts  → contas bancárias dentro de cada item
--   v_saldos_pluggy  → view consumida pelo dashboard financeiro

-- ─── Tabela: pluggy_items ────────────────────────────────────
create table if not exists pluggy_items (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id) on delete set null,
  pluggy_item_id text not null unique,
  connector_id integer,
  instituicao_nome text,
  instituicao_imagem text,
  status text,                   -- UPDATED, UPDATING, LOGIN_ERROR, OUTDATED, WAITING_USER_INPUT
  execution_status text,
  status_detail jsonb,
  last_updated_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_pluggy_items_empresa on pluggy_items(empresa_id);
create index if not exists idx_pluggy_items_status on pluggy_items(status);

-- ─── Tabela: pluggy_accounts ─────────────────────────────────
create table if not exists pluggy_accounts (
  id uuid primary key default gen_random_uuid(),
  pluggy_item_id text not null references pluggy_items(pluggy_item_id) on delete cascade,
  empresa_id uuid references empresas(id) on delete set null,
  pluggy_account_id text not null unique,
  tipo text,                     -- BANK | CREDIT
  subtipo text,                  -- CHECKING_ACCOUNT, SAVINGS_ACCOUNT, CREDIT_CARD
  numero text,
  agencia text,
  marca text,                    -- "Itaú", "Bradesco", etc
  nome_titular text,
  nome_exibicao text,            -- ex: "Itaú · Ag 1234 · CC 56789"
  saldo numeric(18,2) default 0,
  saldo_disponivel numeric(18,2),
  limite_credito numeric(18,2),
  moeda text default 'BRL',
  atualizado_em timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists idx_pluggy_accounts_item on pluggy_accounts(pluggy_item_id);
create index if not exists idx_pluggy_accounts_empresa on pluggy_accounts(empresa_id);
create index if not exists idx_pluggy_accounts_subtipo on pluggy_accounts(subtipo);

-- ─── View: v_saldos_pluggy ────────────────────────────────────
-- Apenas contas correntes/poupança (não inclui cartão de crédito)
create or replace view v_saldos_pluggy as
  select
    a.id as conta_id,
    a.empresa_id,
    a.pluggy_account_id,
    a.pluggy_item_id,
    coalesce(a.nome_exibicao, a.marca || ' · ' || coalesce(a.numero, '')) as nome_exibicao,
    a.marca as banco,
    a.numero as numero_cc,
    a.agencia,
    a.subtipo as tipo_conta,
    a.saldo,
    a.saldo_disponivel,
    a.atualizado_em as data_referencia,
    'pluggy' as fonte_saldo,
    i.instituicao_nome,
    i.status as item_status
  from pluggy_accounts a
  join pluggy_items i on i.pluggy_item_id = a.pluggy_item_id
  where a.subtipo in ('CHECKING_ACCOUNT', 'SAVINGS_ACCOUNT')
  order by a.empresa_id, a.marca, a.numero;

-- ─── Permissões ───────────────────────────────────────────────
grant select, insert, update, delete on pluggy_items to anon, authenticated, service_role;
grant select, insert, update, delete on pluggy_accounts to anon, authenticated, service_role;
grant select on v_saldos_pluggy to anon, authenticated, service_role;

-- ─── Trigger: updated_at ──────────────────────────────────────
create or replace function update_pluggy_items_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_pluggy_items_updated_at on pluggy_items;
create trigger trg_pluggy_items_updated_at
  before update on pluggy_items
  for each row execute function update_pluggy_items_updated_at();

-- ─── Reload schema cache ──────────────────────────────────────
notify pgrst, 'reload schema';
