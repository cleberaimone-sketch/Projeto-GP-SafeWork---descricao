-- Despesa que era regular numa unidade e virou esparsa no exercício atual.
--
-- Nasceu de uma auditoria em 04/09/2026: a SW Medianeira parecia ter cortado
-- despesa administrativa de R$ 168.750 para R$ 116.714, e não tinha. O aluguel
-- dela está lançado só em janeiro e fevereiro de 2026 — as outras cinco
-- unidades têm os oito meses. Faltavam ~R$ 18 mil só nessa linha.
--
-- Por que POR UNIDADE e não por categoria: no agregado do grupo o aluguel tem
-- os oito meses, porque as outras unidades lançam normalmente. O buraco da
-- Medianeira desaparece na soma. A granularidade é a feature.
--
-- Por que não serve a fn_despesa_nao_lancada: ela aprende o que é "recorrente"
-- olhando os meses fechados do PRÓPRIO ano (having count(*) >= 6) e só projeta
-- sobre meses futuros. Uma despesa que parou em fevereiro nunca acumula seis
-- meses, nunca vira recorrente, e nunca é vista. Quem para cedo é exatamente
-- quem escapa.

drop function if exists public.fn_despesa_recorrente_irregular(integer, integer, uuid);

create or replace function public.fn_despesa_recorrente_irregular(
  p_ano integer default null,
  p_ate_mes integer default null,
  p_empresa_id uuid default null
)
returns table(
  empresa_id uuid,
  unidade text,
  categoria text,
  meses_base integer,
  media_base numeric,
  meses_lancados integer,
  ultimo_mes integer,
  faltando numeric
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with alvo as (
    select
      coalesce(p_ano, extract(year from current_date)::int) as ano,
      -- Só meses fechados: o mês em curso ainda vai receber lançamento.
      coalesce(p_ate_mes,
        case when coalesce(p_ano, extract(year from current_date)::int)
                  < extract(year from current_date)::int
             then 12
             else greatest(extract(month from current_date)::int - 1, 1) end) as ate_mes
  ),
  base as (
    select
      l.empresa_id,
      e.nome_curto                               as unidade,
      trim(l.categoria)                          as categoria,
      extract(year from l.data_vencimento)::int  as y,
      extract(month from l.data_vencimento)::int as m,
      sum(l.valor)                               as valor
    from lancamentos_financeiros l
    join empresas e on e.id = l.empresa_id
    cross join alvo a
    where l.status <> 'cancelado'
      and l.tipo = 'despesa'
      -- Custo, administrativa e financeira. Deduções (2.x) ficam de fora: têm
      -- alerta próprio, e entrar aqui duplicaria o mesmo aviso.
      and trim(l.categoria) ~ '^[3-5]'
      and fn_normalizar(l.categoria) not in (select fn_normalizar(categoria) from categorias_excluidas)
      and extract(year from l.data_vencimento) in (a.ano, a.ano - 1)
      and extract(month from l.data_vencimento) <= a.ate_mes
      and (p_empresa_id is null or l.empresa_id = p_empresa_id)
    group by 1, 2, 3, 4, 5
  ),
  -- A régua: mesma janela de meses no exercício anterior, na MESMA unidade.
  anterior as (
    select b.empresa_id, b.unidade, b.categoria,
           count(*)::int as meses_base,
           avg(b.valor)  as media_base
    from base b cross join alvo a
    where b.y = a.ano - 1
    group by 1, 2, 3
    having count(*) >= 6
  ),
  atual as (
    select b.empresa_id, b.categoria,
           count(*)::int  as meses_lancados,
           max(b.m)::int  as ultimo_mes
    from base b cross join alvo a
    where b.y = a.ano
    group by 1, 2
  )
  select
    ant.empresa_id, ant.unidade, ant.categoria,
    ant.meses_base,
    round(ant.media_base, 2),
    atu.meses_lancados,
    atu.ultimo_mes,
    round(ant.media_base * (ant.meses_base - atu.meses_lancados), 2) as faltando
  from anterior ant
  -- INNER JOIN de propósito: a categoria precisa ter ao menos um lançamento no
  -- exercício atual. É o que separa "parou de ser lançada" de "foi encerrada"
  -- e, principalmente, de RECLASSIFICADA — a Medianeira migrou "4.03.02
  -- Remuneração Mensal de Sócios" para "4.03.01 Pró-labore" em 2026, e sem
  -- esta junção a categoria antiga apareceria como R$ 16 mil sumidos.
  join atual atu
    on atu.empresa_id = ant.empresa_id
   and atu.categoria  = ant.categoria
  where atu.meses_lancados <= ant.meses_base / 2.0
    -- Abaixo disso o alerta custa mais atenção do que vale.
    and ant.media_base * (ant.meses_base - atu.meses_lancados) >= 1000
  order by faltando desc
$function$;

grant execute on function public.fn_despesa_recorrente_irregular(integer, integer, uuid)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
