-- Espelho local do SOC para exames/ASO e licenças. Ver comentários no corpo.
-- (Conteúdo idêntico ao aplicado via MCP em 08/09/2026.)

create table if not exists public.soc_exames (
  id                uuid primary key default gen_random_uuid(),
  fonte_id          text not null unique,
  empresa_soc       text,
  nome_empresa      text,
  unidade           text,
  funcionario_nome  text,
  matricula         text,
  cpf               text,
  setor             text,
  cargo             text,
  data_ficha        date,
  tipo_ficha        text,
  data_exames       date,
  cod_exame         text,
  nome_exame        text,
  exame_alterado    text,
  sai_aso           text,
  parecer_aso       text,
  bruto             jsonb not null,
  importado_em      timestamptz not null default now()
);

create index if not exists idx_soc_exames_data on public.soc_exames (data_ficha desc);
create index if not exists idx_soc_exames_empresa on public.soc_exames (nome_empresa, data_ficha desc);
create index if not exists idx_soc_exames_func on public.soc_exames (cpf, data_ficha desc);

create table if not exists public.soc_licencas (
  id                uuid primary key default gen_random_uuid(),
  fonte_id          text not null unique,
  nome_empresa      text,
  funcionario_nome  text,
  cod_cid           text,
  tipo_licenca      text,
  data_inicio       date,
  afastamento_horas text,
  acidente_trajeto  text,
  bruto             jsonb not null,
  importado_em      timestamptz not null default now()
);

create index if not exists idx_soc_licencas_data on public.soc_licencas (data_inicio desc);
create index if not exists idx_soc_licencas_empresa on public.soc_licencas (nome_empresa, data_inicio desc);

create table if not exists public.soc_importacoes (
  id             uuid primary key default gen_random_uuid(),
  recurso        text not null,
  data_inicio    date not null,
  data_fim       date not null,
  registros      integer not null default 0,
  status         text not null,
  detalhe        text,
  iniciado_em    timestamptz not null default now(),
  finalizado_em  timestamptz,
  unique (recurso, data_inicio, data_fim)
);

grant select, insert, update on public.soc_exames to anon, authenticated, service_role;
grant select, insert, update on public.soc_licencas to anon, authenticated, service_role;
grant select, insert, update on public.soc_importacoes to anon, authenticated, service_role;

notify pgrst, 'reload schema';
