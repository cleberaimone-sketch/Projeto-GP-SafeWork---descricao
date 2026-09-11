-- Consultas × custo médico × receita, por unidade e mês. Aplicada via MCP em
-- 11/09/2026. Ver o corpo para o de-para entre SOC e Conta Azul.
create or replace function public.fn_atendimento_x_custo(p_ano int)
returns table(unidade text, mes int, consultas bigint, exames bigint,
              custo_medico numeric, custo_clinicas numeric, receita numeric)
language sql stable security definer set search_path to 'public'
as $$
  with de_para(prestador_soc, empresa_ca) as (
    values ('SAFEWORK FOZ','SW Foz'), ('SAFEWORK MEDIANEIRA','SW Medianeira'),
           ('SAFEWORK LONDRINA','SW Londrina'), ('SAFEWORK SANTA HELENA','SW Santa Helena'),
           ('SAFEWORK SÃO MIGUEL','SW São Miguel')
  ),
  atendimento as (
    select d.empresa_ca as unidade, extract(month from e.data_exame)::int as mes,
           count(*) filter (where upper(btrim(e.nome_exame)) like 'CONSULTA OCUPACIONAL%') as consultas,
           count(*) as exames
    from soc_exames e join de_para d on upper(e.prestador_nome) like d.prestador_soc || '%'
    where extract(year from e.data_exame)::int = p_ano group by 1,2
  ),
  custo as (
    select emp.nome_curto as unidade, extract(month from l.data_vencimento)::int as mes,
           sum(l.valor) filter (where lower(l.categoria) ~ 'honorários médicos|honorarios medicos')::numeric as custo_medico,
           sum(l.valor) filter (where lower(l.categoria) ~ 'clínicas parceiras|clinicas parceiras')::numeric as custo_clinicas
    from lancamentos_financeiros l join empresas emp on emp.id = l.empresa_id
    where l.status <> 'cancelado' and l.tipo='despesa'
      and extract(year from l.data_vencimento)::int = p_ano group by 1,2
  ),
  receita as (
    select emp.nome_curto as unidade, extract(month from l.data_vencimento)::int as mes,
           sum(l.valor)::numeric as receita
    from lancamentos_financeiros l join empresas emp on emp.id = l.empresa_id
    where l.status <> 'cancelado' and l.tipo='receita'
      and trim(coalesce(l.categoria,'')) ~ '^1\.'
      and extract(year from l.data_vencimento)::int = p_ano
      and fn_normalizar(l.categoria) not in (select fn_normalizar(categoria) from categorias_excluidas)
    group by 1,2
  ),
  universo as (
    select unidade, mes from atendimento
    union select unidade, mes from custo where unidade in (select empresa_ca from de_para)
  )
  select u.unidade, u.mes, coalesce(a.consultas,0), coalesce(a.exames,0),
         round(coalesce(c.custo_medico,0),2), round(coalesce(c.custo_clinicas,0),2),
         round(coalesce(r.receita,0),2)
  from universo u
  left join atendimento a using (unidade, mes)
  left join custo c using (unidade, mes)
  left join receita r using (unidade, mes)
  order by u.unidade, u.mes
$$;

revoke execute on function public.fn_atendimento_x_custo(int) from public, anon, authenticated;
grant execute on function public.fn_atendimento_x_custo(int) to service_role;
notify pgrst, 'reload schema';
