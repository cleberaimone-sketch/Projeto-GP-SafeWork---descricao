-- Distribuição de atendimentos do espelho do SOC — por unidade e por tipo.
-- Ver o comentário no corpo das funções. Aplicada via MCP em 10/09/2026.

create or replace function public.fn_soc_consultas_por_unidade(p_ano int default null)
returns table(categoria text, unidade text, consultas bigint)
language sql stable security definer set search_path to 'public'
as $$
  with base as (
    select
      case
        when e.prestador_nome ilike 'SAFEWORK %' and e.prestador_nome ilike '%(PR_PRIO)%'
          then 'propria'
        when e.prestador_nome ilike 'P %CREDENCIAMENTO%' or e.prestador_nome ilike 'SOCNET%'
          then 'credenciada'
        else 'indefinido'
      end as categoria,
      case
        when e.prestador_nome ilike 'SAFEWORK %' and e.prestador_nome ilike '%(PR_PRIO)%'
          then initcap(btrim(substring(e.prestador_nome from '(?i)SAFEWORK\s+(.*?)\s*\(')))
        when e.prestador_nome ilike 'P %CREDENCIAMENTO%' or e.prestador_nome ilike 'SOCNET%'
          then coalesce(nullif(btrim(e.prestador_cidade), ''), 'Sem cidade')
        else coalesce(nullif(btrim(e.prestador_nome), ''), '(prestador em branco)')
      end as unidade
    from soc_exames e
    where e.data_exame is not null
      and (p_ano is null or extract(year from e.data_exame)::int = p_ano)
      and upper(btrim(e.nome_exame)) like 'CONSULTA OCUPACIONAL%'
  )
  select categoria, unidade, count(*) as consultas
  from base group by 1, 2 order by 3 desc
$$;

create or replace function public.fn_soc_exames_por_tipo(p_ano int default null, p_limite int default 15)
returns table(tipo text, quantidade bigint)
language sql stable security definer set search_path to 'public'
as $$
  select btrim(e.nome_exame) as tipo, count(*) as quantidade
  from soc_exames e
  where e.data_exame is not null
    and nullif(btrim(e.nome_exame), '') is not null
    and (p_ano is null or extract(year from e.data_exame)::int = p_ano)
  group by 1 order by 2 desc limit p_limite
$$;

-- O projeto tem default privileges que concedem EXECUTE a anon e authenticated
-- em toda função criada em public. `revoke ... from public` NÃO desfaz isso: o
-- grant é nominal por role. Sem as três linhas abaixo, fn_aso_vencido — que
-- lista trabalhador com ASO vencido — fica chamável sem login pela API REST.
-- Conferir depois em pg_proc.proacl: o alvo é {postgres=X,service_role=X}.
revoke execute on function public.fn_aso_vencido(integer)                  from public, anon, authenticated;
revoke execute on function public.fn_soc_consultas_por_unidade(integer)    from public, anon, authenticated;
revoke execute on function public.fn_soc_exames_por_tipo(integer, integer) from public, anon, authenticated;
grant  execute on function public.fn_soc_consultas_por_unidade(integer)    to service_role;
grant  execute on function public.fn_soc_exames_por_tipo(integer, integer) to service_role;

notify pgrst, 'reload schema';
