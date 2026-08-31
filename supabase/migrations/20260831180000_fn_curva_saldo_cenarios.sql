-- ============================================================================
-- Curva de saldo — histórico real + cenários de projeção
-- ============================================================================
-- Três coisas que faltavam:
--
-- 1. HISTÓRICO. A série começava em current_date, então "hoje" era o primeiro
--    ponto e não havia o que separar. Agora os dias passados vêm do saldo real
--    gravado em snapshots_financeiros_diarios, e a linha de hoje divide o que
--    aconteceu do que é projeção. Só existe snapshot do consolidado, então o
--    histórico aparece apenas quando não há empresa filtrada.
--
-- 2. INADIMPLÊNCIA. A projeção assumia que todo título a receber seria
--    recebido. Nos últimos 12 meses, 10,4% do que venceu não foi pago
--    (R$ 729.712 de R$ 7.015.464). p_taxa_inadimplencia desconta esse
--    percentual das entradas previstas.
--
-- 3. DISTRIBUIÇÃO DO ATRASADO. Incluir os atrasados jogava tudo no dia de
--    hoje, o que derrubava a curva num degrau que ninguém vive: são R$ 2,8 mi.
--    p_distribuir_meses espalha esse valor em parcelas mensais iguais, que é
--    como a dívida costuma ser paga de fato. Com 0, mantém o comportamento
--    antigo de trazer tudo para hoje.
--
-- O saldo final não muda com a distribuição — o que muda é o caminho, e é o
-- caminho que diz quando o caixa aperta.
-- ============================================================================

drop function if exists fn_curva_saldo(uuid, integer, boolean);

create or replace function fn_curva_saldo(
  p_empresa_id          uuid    default null,
  p_dias                integer default 90,
  p_incluir_atrasados   boolean default false,
  p_taxa_inadimplencia  numeric default 0,     -- 0 a 100
  p_distribuir_meses    integer default 0,     -- 0 = tudo hoje
  p_dias_historico      integer default 0
)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with parametros as (
    select current_date as hoje,
           (current_date + (p_dias || ' days')::interval)::date as fim,
           greatest(coalesce(p_taxa_inadimplencia, 0), 0) / 100.0 as taxa,
           greatest(coalesce(p_distribuir_meses, 0), 0) as meses
  ),
  saldo_inicial as (
    select coalesce(sum(saldo), 0) as valor
    from v_saldos_ativos
    where p_empresa_id is null or empresa_id = p_empresa_id
  ),
  abertos as (
    select l.tipo, l.valor,
           coalesce(d.data_prevista, l.data_vencimento) as data_efetiva,
           l.data_vencimento < (select hoje from parametros) as atrasado
    from lancamentos_financeiros l
    left join decisoes_pagamento d on d.lancamento_id = l.id::text
    where l.status in ('pendente', 'vencido')
      and (p_empresa_id is null or l.empresa_id = p_empresa_id)
      and not exists (select 1 from categorias_excluidas ce
                      where fn_normalizar(ce.categoria) = fn_normalizar(l.categoria))
  ),
  atrasados as (
    select coalesce(sum(valor) filter (where tipo = 'receita'), 0) as receber,
           coalesce(sum(valor) filter (where tipo = 'despesa'), 0) as pagar
    from abertos where atrasado
  ),
  -- Parcelas do atrasado: uma por mês, a partir de hoje. Sem distribuição,
  -- uma única parcela em hoje com o valor cheio.
  parcelas_atrasado as (
    select
      case when (select meses from parametros) > 0
           then (select hoje from parametros) + (i * interval '1 month')
           else (select hoje from parametros) end::date as dia,
      (select receber from atrasados) / greatest((select meses from parametros), 1) as receber,
      (select pagar   from atrasados) / greatest((select meses from parametros), 1) as pagar
    from generate_series(0, greatest((select meses from parametros), 1) - 1) as i
    where p_incluir_atrasados
  ),
  dias as (
    select generate_series((select hoje from parametros),
                           (select fim  from parametros), '1 day')::date as dia
  ),
  movimento as (
    select d.dia,
           coalesce(sum(a.valor) filter (where a.tipo = 'receita'), 0) as entradas,
           coalesce(sum(a.valor) filter (where a.tipo = 'despesa'), 0) as saidas
    from dias d
    left join abertos a
      on a.data_efetiva = d.dia
     and not a.atrasado          -- atrasado entra pelas parcelas, nunca aqui
    group by d.dia
  ),
  com_atrasado as (
    select m.dia,
           m.entradas + coalesce((select sum(pa.receber) from parcelas_atrasado pa
                                  where pa.dia = m.dia), 0) as entradas_brutas,
           m.saidas   + coalesce((select sum(pa.pagar)   from parcelas_atrasado pa
                                  where pa.dia = m.dia), 0) as saidas
    from movimento m
  ),
  -- A inadimplência incide só sobre o que entra: parte do que se espera
  -- receber não chega.
  ajustado as (
    select dia,
           entradas_brutas * (1 - (select taxa from parametros)) as entradas,
           saidas
    from com_atrasado
  ),
  curva as (
    select dia, entradas, saidas, false as historico,
           (select valor from saldo_inicial)
             + sum(entradas - saidas) over (order by dia rows unbounded preceding) as saldo
    from ajustado
  ),
  -- Saldo que de fato existiu, do snapshot diário. Só do consolidado.
  historico as (
    select s.data as dia, 0::numeric as entradas, 0::numeric as saidas,
           true as historico, s.saldo_bancario as saldo
    from snapshots_financeiros_diarios s
    where s.empresa_id is null
      and p_empresa_id is null
      and coalesce(p_dias_historico, 0) > 0
      and s.data >= (select hoje from parametros) - p_dias_historico
      and s.data <  (select hoje from parametros)
  ),
  serie as (
    select * from historico
    union all
    select * from curva
  )
  select jsonb_build_object(
    'saldoInicial',    (select valor from saldo_inicial),
    'atrasadoPagar',   (select pagar   from atrasados),
    'atrasadoReceber', (select receber from atrasados),
    'incluiAtrasados', p_incluir_atrasados,
    'taxaInadimplencia', coalesce(p_taxa_inadimplencia, 0),
    'distribuirMeses',   coalesce(p_distribuir_meses, 0),
    'diasHistorico',     (select count(*) from historico),
    'saldoMinimo',    (select min(saldo) from curva),
    'diaSaldoMinimo', (select dia from curva order by saldo limit 1),
    'saldoFinal',     (select saldo from curva order by dia desc limit 1),
    'totalEntradas',  (select coalesce(sum(entradas), 0) from curva),
    'totalSaidas',    (select coalesce(sum(saidas), 0)   from curva),
    'pontos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'dia', dia, 'entradas', entradas, 'saidas', saidas,
               'saldo', saldo, 'historico', historico
             ) order by dia)
      from serie), '[]'::jsonb)
  );
$$;

revoke all on function fn_curva_saldo(uuid, integer, boolean, numeric, integer, integer)
  from public, anon, authenticated;
grant execute on function fn_curva_saldo(uuid, integer, boolean, numeric, integer, integer)
  to service_role;

notify pgrst, 'reload schema';
