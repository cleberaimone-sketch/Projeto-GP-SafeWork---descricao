-- Filtro de natureza nas consultas da dívida, para o seletor
-- "Todas / Operação / Dívida" valer na página inteira e não só no ranking.
--
--   p_natureza = 'operacional' → grupos 1-5, a operação
--                'financeira'  → 6,7,8 e afins, conta patrimonial
--                null          → tudo
--
-- Antes o seletor era estado local do ranking: mudava aquela lista e deixava
-- os gráficos acima e a visão anual abaixo contando outra coisa, o que fazia
-- a mesma tela mostrar dois universos ao mesmo tempo.

create or replace function fn_divida_cronograma(
  p_empresa_id uuid default null,
  p_natureza   text default null
)
returns table (mes date, valor numeric, titulos bigint)
language sql stable security definer set search_path = public
as $$
  select
    case when l.data_vencimento < current_date then null
         else date_trunc('month', l.data_vencimento)::date end,
    coalesce(sum(l.valor), 0), count(*)
  from lancamentos_financeiros l
  where l.tipo = 'despesa'
    and l.status in ('vencido','pendente')
    and l.data_vencimento is not null
    and fn_normalizar(l.categoria) not in (select fn_normalizar(categoria) from categorias_excluidas)
    and (p_empresa_id is null or l.empresa_id = p_empresa_id)
    and (p_natureza is null
         or (p_natureza = 'financeira'  and     fn_nao_operacional(l.categoria))
         or (p_natureza = 'operacional' and not fn_nao_operacional(l.categoria)))
  group by 1
$$;

drop function if exists fn_divida_serie_mensal(date, date, uuid);

create or replace function fn_divida_serie_mensal(
  p_de date default null, p_ate date default null,
  p_empresa_id uuid default null, p_natureza text default null
)
returns table (mes date, vencido numeric, venceu numeric, pago numeric, cancelado numeric, titulos bigint)
language sql stable security definer set search_path = public
as $$
  with titulos as (
    select l.valor,
      date_trunc('month', l.data_vencimento)::date as mes_venc,
      case when l.status = 'cancelado'
             and (l.data_pagamento is null
                  or l.data_pagamento not between '2023-01-01' and current_date)
           then 'cancelamento' else 'pagamento' end as forma_saida,
      date_trunc('month', case
        when l.status in ('pago','parcial','cancelado')
             and l.data_pagamento between '2023-01-01' and current_date
          then l.data_pagamento
        when l.status in ('pago','parcial') then l.data_vencimento
        when l.status = 'cancelado'         then l.updated_at::date
        else null end)::date as mes_saida
    from lancamentos_financeiros l
    where l.tipo = 'despesa'
      and l.data_vencimento is not null
      and l.data_vencimento < current_date
      and fn_normalizar(l.categoria) not in (select fn_normalizar(categoria) from categorias_excluidas)
      and (p_empresa_id is null or l.empresa_id = p_empresa_id)
      and (p_natureza is null
           or (p_natureza = 'financeira'  and     fn_nao_operacional(l.categoria))
           or (p_natureza = 'operacional' and not fn_nao_operacional(l.categoria)))
  ),
  eventos as (
    select mes_venc as mes, valor as delta, valor as venceu,
           0::numeric as pago, 0::numeric as cancelado, 1::bigint as qtd
      from titulos where mes_saida is null or mes_saida > mes_venc
    union all
    select mes_saida, -valor, 0,
           case when forma_saida = 'pagamento'    then valor else 0 end,
           case when forma_saida = 'cancelamento' then valor else 0 end,
           -1::bigint
      from titulos where mes_saida is not null and mes_saida > mes_venc
  ),
  por_mes as (select mes, sum(delta) as delta, sum(venceu) as venceu,
                     sum(pago) as pago, sum(cancelado) as cancelado, sum(qtd) as qtd
              from eventos group by mes),
  acumulado as (
    select mes, venceu, pago, cancelado,
           sum(delta) over (order by mes) as vencido,
           sum(qtd)   over (order by mes) as titulos
    from por_mes
  )
  select mes, round(vencido,2), round(venceu,2), round(pago,2), round(cancelado,2), titulos
  from acumulado
  where mes >= date_trunc('month', coalesce(p_de,  '2024-01-01'::date))::date
    and mes <= date_trunc('month', coalesce(p_ate, current_date))::date
  order by mes
$$;

revoke all on function fn_divida_cronograma(uuid, text)               from public, anon, authenticated;
revoke all on function fn_divida_serie_mensal(date, date, uuid, text) from public, anon, authenticated;
grant execute on function fn_divida_cronograma(uuid, text)               to service_role;
grant execute on function fn_divida_serie_mensal(date, date, uuid, text) to service_role;

notify pgrst, 'reload schema';
