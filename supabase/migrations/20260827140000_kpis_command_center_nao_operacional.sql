-- O Centro de Comando mostrava só o resultado operacional. Investimento,
-- empréstimo e parcelamento saíam do caixa sem aparecer em lugar nenhum —
-- R$ 780.487 em 2026. A RPC passa a devolver as duas leituras: o resultado da
-- operação e o que sobra depois do que é conta patrimonial.
drop function if exists fn_kpis_command_center(int);

create or replace function fn_kpis_command_center(p_ano int default null)
returns table (
  ano int, receita_ano numeric, despesa_ano numeric, resultado_ano numeric,
  nao_operacional numeric, geracao_caixa numeric,
  inadimplencia numeric, qtd_inadimplencia int,
  a_pagar numeric, qtd_a_pagar int,
  despesas_vencidas numeric, qtd_despesas_vencidas int
)
language sql stable security definer set search_path = public as $$
  with alvo as (select coalesce(p_ano, extract(year from current_date)::int) as ano),
  excluidas as (select fn_normalizar(categoria) as cat from categorias_excluidas),
  fluxo as (
    select l.tipo, l.valor, l.status, fn_nao_operacional(l.categoria) as nao_op
    from lancamentos_financeiros l, alvo a
    where l.status <> 'cancelado'
      and l.data_vencimento >= make_date(a.ano, 1, 1)
      and l.data_vencimento <= make_date(a.ano, 12, 31)
      and fn_normalizar(l.categoria) not in (select cat from excluidas)
  ),
  t as (
    select
      coalesce(sum(valor) filter (where tipo='receita' and not nao_op), 0) as rec,
      coalesce(sum(valor) filter (where tipo='despesa' and not nao_op), 0) as desp,
      coalesce(sum(valor) filter (where tipo='despesa' and nao_op), 0)     as naoop
    from fluxo
  )
  select
    (select ano from alvo),
    t.rec, t.desp, t.rec - t.desp,
    t.naoop, t.rec - t.desp - t.naoop,
    coalesce((select sum(valor) from fluxo where tipo='receita' and status='vencido' and not nao_op), 0),
    (select count(*) from fluxo where tipo='receita' and status='vencido' and not nao_op)::int,
    coalesce((select sum(valor) from fluxo where tipo='despesa' and status in ('pendente','vencido')), 0),
    (select count(*) from fluxo where tipo='despesa' and status in ('pendente','vencido'))::int,
    coalesce((select sum(valor) from fluxo where tipo='despesa' and status='vencido'), 0),
    (select count(*) from fluxo where tipo='despesa' and status='vencido')::int
  from t
$$;

revoke all on function fn_kpis_command_center(int) from public, anon, authenticated;
grant execute on function fn_kpis_command_center(int) to service_role;
notify pgrst, 'reload schema';
