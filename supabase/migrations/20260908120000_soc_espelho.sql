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

-- ── Série mensal para a tela (aplicada em 08/09/2026) ───────────────────────
create or replace function public.fn_soc_exames_mensal(p_ano integer default null)
returns table(ano integer, mes integer, consultas bigint, exames bigint, empresas bigint)
language sql stable security definer set search_path to 'public'
as $function$
  select
    extract(year from e.data_exame)::int   as ano,
    extract(month from e.data_exame)::int  as mes,
    count(*) filter (
      where upper(btrim(e.nome_exame)) like 'CONSULTA OCUPACIONAL%'
    )                                      as consultas,
    count(*)                               as exames,
    count(distinct e.nome_empresa)         as empresas
  from soc_exames e
  where e.data_exame is not null
    and (p_ano is null or extract(year from e.data_exame)::int = p_ano)
  group by 1, 2
  order by 1, 2
$function$;

grant execute on function public.fn_soc_exames_mensal(integer) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

-- ── Espelho por trabalhador (máscara 193540) e controle da varredura ────────
-- Aplicadas em 08/09/2026. Ver comentários nas migrations correspondentes.
create table if not exists public.soc_exames_trabalhador (
  id uuid primary key default gen_random_uuid(),
  fonte_id text not null unique,
  empresa_soc text, cod_funcionario text, funcionario_nome text,
  matricula text, cpf text, unidade text, setor text, cargo text,
  data_ficha date, tipo_ficha text, data_exame date,
  cod_exame text, nome_exame text, exame_alterado text,
  sai_aso text, parecer_aso text, seq_ficha text, seq_resultado text,
  bruto jsonb not null, importado_em timestamptz not null default now()
);
create index if not exists idx_sxt_cpf_data on public.soc_exames_trabalhador (cpf, data_ficha desc);
create index if not exists idx_sxt_empresa on public.soc_exames_trabalhador (empresa_soc, data_ficha desc);
create index if not exists idx_sxt_data on public.soc_exames_trabalhador (data_ficha desc);
create index if not exists idx_sxt_saiaso on public.soc_exames_trabalhador (sai_aso);

create table if not exists public.soc_importacoes_empresa (
  empresa_soc text primary key,
  registros integer not null default 0,
  status text not null, detalhe text,
  finalizado_em timestamptz not null default now()
);

create or replace function public.fn_soc_empresas_ativas(
  p_dias integer default 395, p_limite integer default 500, p_offset integer default 0
)
returns table(empresa_soc text, nome_empresa text, exames bigint)
language sql stable security definer set search_path to 'public'
as $function$
  select e.empresa_soc, max(e.nome_empresa), count(*)
  from soc_exames e
  where e.empresa_soc is not null and e.data_exame >= current_date - p_dias
  group by e.empresa_soc
  order by count(*) desc, e.empresa_soc
  limit p_limite offset p_offset
$function$;

grant select, insert, update on public.soc_exames_trabalhador to anon, authenticated, service_role;
grant select, insert, update on public.soc_importacoes_empresa to anon, authenticated, service_role;
grant execute on function public.fn_soc_empresas_ativas(integer, integer, integer) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
