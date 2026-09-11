-- Ver o corpo da função. Aplicada via MCP em 11/09/2026.
-- Decompõe a variação de um mês de folha por categoria, contra a MEDIANA dos
-- outros meses. Julho/2026 ficou 11% acima e tinha seis desligamentos: a
-- rescisão é a quarta causa (R$ 2.799 de R$ 19.526), e o que puxou foi
-- honorário de PJ da engenharia. Procurar só a explicação esperada confirmaria
-- o palpite em vez de explicar o número.
create or replace function public.fn_pessoal_mes_atipico(
  p_ano int, p_mes int, p_ate_mes int default null, p_top int default 6
)
returns json
language sql stable security definer set search_path to 'public'
as $$
  with base as (
    select extract(month from l.data_vencimento)::int as mes,
           trim(l.categoria) as categoria, l.descricao, l.valor::numeric as valor
    from lancamentos_financeiros l
    where l.status <> 'cancelado' and l.tipo = 'despesa'
      and extract(year from l.data_vencimento)::int = p_ano
      and extract(month from l.data_vencimento)::int <= coalesce(p_ate_mes, 12)
      and lower(l.categoria) ~ 'honorários profissionais mei|honorarios profissionais mei|mão de obra direta|mao de obra direta|fgts|provisões|provisoes|rescis|dctfweb|pró-labore|pro-labore|comissões de vendedores|comissoes de vendedores'
  ),
  por_mes_cat as (select mes, categoria, sum(valor) as valor from base group by 1, 2),
  referencia as (
    select categoria, (percentile_cont(0.5) within group (order by valor))::numeric as mediana
    from por_mes_cat where mes <> p_mes group by categoria
  ),
  totais as (
    select
      (select coalesce(sum(valor), 0)::numeric from por_mes_cat where mes = p_mes) as total_mes,
      (select coalesce((percentile_cont(0.5) within group (order by t))::numeric, 0) from (
         select mes, sum(valor) t from por_mes_cat where mes <> p_mes group by mes) x) as mediana_mes
  ),
  desvios as (
    select p.categoria, p.valor, coalesce(r.mediana, 0) as mediana,
           p.valor - coalesce(r.mediana, 0) as excedente
    from por_mes_cat p left join referencia r using (categoria) where p.mes = p_mes
  ),
  nominais as (
    select b.descricao, b.valor from base b
    where b.mes = p_mes and lower(b.categoria) ~ 'rescis'
      and b.descricao is not null and btrim(b.descricao) <> ''
    order by b.valor desc limit 5
  )
  select json_build_object(
    'ano', p_ano, 'mes', p_mes,
    'total', round((select total_mes from totais), 2),
    'mediana_dos_outros_meses', round((select mediana_mes from totais), 2),
    'excedente', round((select total_mes - mediana_mes from totais), 2),
    'excedente_pct', case when (select mediana_mes from totais) > 0
      then round(100 * ((select total_mes from totais) - (select mediana_mes from totais))
                 / (select mediana_mes from totais), 1) else null end,
    'causas', coalesce((select json_agg(json_build_object(
        'categoria', categoria, 'valor', round(valor, 2),
        'mediana', round(mediana, 2), 'excedente', round(excedente, 2)) order by excedente desc)
      from (select * from desvios where excedente > 0 order by excedente desc limit p_top) d), '[]'::json),
    'rescisoes', coalesce((select json_agg(json_build_object('descricao', descricao, 'valor', round(valor, 2)))
      from nominais), '[]'::json)
  )
$$;

revoke execute on function public.fn_pessoal_mes_atipico(int, int, int, int) from public, anon, authenticated;
grant execute on function public.fn_pessoal_mes_atipico(int, int, int, int) to service_role;
notify pgrst, 'reload schema';
