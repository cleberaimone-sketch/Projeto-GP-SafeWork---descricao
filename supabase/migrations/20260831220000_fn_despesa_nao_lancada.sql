-- Estima a despesa recorrente que ainda não foi lançada nos meses à frente.
--
-- Toda projeção de caixa aqui parte dos títulos existentes. Se as contas do
-- mês que vem ainda não entraram no Conta Azul, a curva mostra folga que não
-- existe. Em 31/08/2026 faltavam ~R$ 435 mil em setembro, ~R$ 475 mil em
-- outubro e ~R$ 503 mil em novembro — o equivalente a quase um mês inteiro de
-- operação em cada um.
--
-- Método: uma categoria é "recorrente" se aparece em pelo menos 6 dos meses já
-- fechados do exercício. Para cada mês futuro, o que falta é a média mensal
-- dessa categoria menos o que já está lançado nele. O aviso some sozinho
-- conforme o lançamento se normaliza.
create or replace function fn_despesa_nao_lancada(
  p_ano        int  default null,
  p_empresa_id uuid default null
)
returns table (
  mes int, lancado numeric, esperado numeric, faltando numeric, categorias_sem bigint
)
language sql stable security definer set search_path = public
as $$
  with alvo as (
    select coalesce(p_ano, extract(year from current_date)::int) as ano,
           extract(month from current_date)::int as mes_corrente
  ),
  base as (
    select trim(l.categoria) as categoria,
           extract(month from l.data_vencimento)::int as mes,
           sum(l.valor) as valor
    from lancamentos_financeiros l, alvo a
    where l.status <> 'cancelado' and l.tipo = 'despesa'
      and l.data_vencimento >= make_date(a.ano, 1, 1)
      and l.data_vencimento <= make_date(a.ano, 12, 31)
      and fn_normalizar(l.categoria) not in (select fn_normalizar(categoria) from categorias_excluidas)
      and (p_empresa_id is null or l.empresa_id = p_empresa_id)
    group by 1, 2
  ),
  recorrentes as (
    select b.categoria, avg(b.valor) as media
    from base b, alvo a
    where b.mes < a.mes_corrente
    group by b.categoria
    having count(*) >= least(6, (select mes_corrente - 1 from alvo))
  ),
  futuros as (select generate_series((select mes_corrente from alvo), 12) as mes),
  cruzado as (
    select f.mes, r.categoria, r.media,
           coalesce((select b.valor from base b
                     where b.categoria = r.categoria and b.mes = f.mes), 0) as lancado
    from futuros f cross join recorrentes r
  )
  select mes, round(sum(lancado), 2), round(sum(media), 2),
         round(greatest(sum(media) - sum(lancado), 0), 2),
         count(*) filter (where lancado = 0)
  from cruzado group by mes order by mes
$$;

revoke all on function fn_despesa_nao_lancada(int, uuid) from public, anon, authenticated;
grant execute on function fn_despesa_nao_lancada(int, uuid) to service_role;

notify pgrst, 'reload schema';
