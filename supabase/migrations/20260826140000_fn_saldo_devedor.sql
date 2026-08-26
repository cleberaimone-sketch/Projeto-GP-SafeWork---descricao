-- ============================================================================
-- Saldo devedor — quanto o grupo ainda deve, e como isso amortiza
-- ============================================================================
-- A página de Atrasados só enxerga o que já venceu, e ainda recorta por ano.
-- Com isso some (a) tudo que vence daqui pra frente e (b) o atrasado de anos
-- anteriores — que hoje é a maior parte da dívida.
--
-- Aqui a pergunta é outra: quanto ainda devo, no total, e quanto disso já foi
-- quitado em cada linha do plano de contas.
--
-- "Em aberto" = pendente + vencido. Fora: cancelado, transferência entre
-- contas do grupo (não é dívida com terceiro) e o não-operacional patrimonial.
-- ============================================================================

-- Dívida por linha do plano de contas: o que falta e o que já saiu.
create or replace function fn_divida_por_categoria(
  p_ano        int  default null,   -- null = todos os anos
  p_empresa_id uuid default null
)
returns table (
  categoria        text,
  em_aberto        numeric,
  ja_pago          numeric,
  total            numeric,
  atrasado         numeric,
  a_vencer         numeric,
  titulos_abertos  bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    trim(l.categoria),
    coalesce(sum(l.valor) filter (where l.status in ('vencido','pendente')), 0),
    coalesce(sum(l.valor) filter (where l.status in ('pago','parcial')), 0),
    coalesce(sum(l.valor), 0),
    coalesce(sum(l.valor) filter (where l.status in ('vencido','pendente')
                                    and l.data_vencimento <  current_date), 0),
    coalesce(sum(l.valor) filter (where l.status in ('vencido','pendente')
                                    and l.data_vencimento >= current_date), 0),
    count(*) filter (where l.status in ('vencido','pendente'))
  from lancamentos_financeiros l
  where l.tipo = 'despesa'
    and l.status <> 'cancelado'
    and l.categoria is not null
    and not fn_nao_operacional(l.categoria)
    and fn_normalizar(l.categoria) not in (select fn_normalizar(categoria) from categorias_excluidas)
    and (p_ano is null or extract(year from l.data_vencimento)::int = p_ano)
    and (p_empresa_id is null or l.empresa_id = p_empresa_id)
  group by trim(l.categoria)
  having coalesce(sum(l.valor) filter (where l.status in ('vencido','pendente')), 0) > 0
$$;

-- Cronograma do que está em aberto: quanto vence em cada mês.
-- Sem recorte de ano — o saldo devedor não respeita exercício. O que já venceu
-- é devolvido com mes = null, para a página tratar como "deveria ter saído".
create or replace function fn_divida_cronograma(p_empresa_id uuid default null)
returns table (
  mes     date,      -- 1º dia do mês de vencimento; null = já vencido
  valor   numeric,
  titulos bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    case when l.data_vencimento < current_date then null
         else date_trunc('month', l.data_vencimento)::date end,
    coalesce(sum(l.valor), 0),
    count(*)
  from lancamentos_financeiros l
  where l.tipo = 'despesa'
    and l.status in ('vencido','pendente')
    and l.data_vencimento is not null
    and not fn_nao_operacional(l.categoria)
    and fn_normalizar(l.categoria) not in (select fn_normalizar(categoria) from categorias_excluidas)
    and (p_empresa_id is null or l.empresa_id = p_empresa_id)
  group by 1
$$;

revoke all on function fn_divida_por_categoria(int, uuid) from public, anon, authenticated;
revoke all on function fn_divida_cronograma(uuid)          from public, anon, authenticated;
grant execute on function fn_divida_por_categoria(int, uuid) to service_role;
grant execute on function fn_divida_cronograma(uuid)         to service_role;

notify pgrst, 'reload schema';
