-- ============================================================
-- Extrato bancário UNIFICADO — base da conciliação
-- ============================================================
-- O Conta Azul não está no Open Finance (Pluggy) e a API dele NÃO expõe extrato
-- bruto. Então a conciliação passa a aceitar EXTRATO IMPORTADO (arquivo OFX/CSV
-- exportado do Conta Azul / Itaú / Cora), unificado com o que vem do Pluggy.
--
-- Uma tabela só, agnóstica de fonte. Substitui pluggy_transactions
-- (que não chegou a ser usada). hash_dedup garante reimport idempotente:
--   - OFX:    'ofx|<conta_ref>|<FITID>'
--   - Pluggy: 'pluggy|<transaction_id>'

create table if not exists extrato_bancario (
  id uuid primary key default gen_random_uuid(),
  fonte text not null,                     -- 'ofx' | 'csv' | 'pluggy' | 'manual'
  conta_ref text,                          -- id/rótulo estável da conta
  conta_nome text,                         -- nome amigável exibido
  empresa_id uuid references empresas(id) on delete set null,
  data date,
  descricao text,
  valor numeric(18,2) not null default 0,  -- sinal: + entrada, - saída
  tipo text,                               -- CREDIT | DEBIT
  documento text,                          -- FITID (OFX) / nº documento
  hash_dedup text not null unique,         -- evita duplicar em reimport
  raw jsonb,
  -- Conciliação
  conciliado boolean not null default false,
  lancamento_id text,                      -- lançamento do ERP casado
  metodo_conciliacao text,                 -- 'auto' | 'manual'
  conciliado_em timestamptz,
  importado_em timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists idx_extrato_empresa    on extrato_bancario(empresa_id);
create index if not exists idx_extrato_conta       on extrato_bancario(conta_ref);
create index if not exists idx_extrato_data        on extrato_bancario(data);
create index if not exists idx_extrato_valor       on extrato_bancario(empresa_id, valor);
create index if not exists idx_extrato_conciliado  on extrato_bancario(conciliado);
create index if not exists idx_extrato_fonte       on extrato_bancario(fonte);

grant select, insert, update, delete on extrato_bancario to anon, authenticated, service_role;

notify pgrst, 'reload schema';
