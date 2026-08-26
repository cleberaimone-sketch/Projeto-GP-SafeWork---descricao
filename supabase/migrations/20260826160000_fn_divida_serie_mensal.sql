-- ============================================================================
-- Série histórica do saldo devedor vencido
-- ============================================================================
-- Quanto estava vencido e não pago no fim de cada mês, e o que fez o saldo
-- mexer: o que venceu (entrou), o que foi pago (amortizou) e o que foi
-- cancelado (saiu sem pagamento).
--
-- Reconstrói o passado a partir das datas, já que não guardamos histórico de
-- status. Cada título gera dois eventos: entra na dívida no mês do vencimento
-- e sai no mês em que foi liquidado. O saldo de um mês é a soma acumulada dos
-- eventos até ali — linear no número de títulos.
--
-- Data de saída por status:
--   pago/parcial → data_pagamento
--   cancelado    → data_pagamento SE existir, senão updated_at
--   em aberto    → não saiu, pesa até hoje
--
-- ⚠️ O coalesce no cancelado não é detalhe. Dos 5.610 títulos cancelados em
-- julho/2026, 4.572 já tinham data de pagamento — eram duplicatas do sync que
-- já haviam sido pagas (5.610 títulos para apenas 1.223 fonte_id distintos).
-- Tratá-los como dívida até a data do cancelamento inflava o saldo de março a
-- junho/2026 em até R$ 1,9 milhão, e o pico da curva ia a R$ 4,5 mi em vez dos
-- R$ 2,58 mi reais. Os ~1.038 cancelados SEM pagamento são o mutirão de baixa
-- de backlog e continuam contando como dívida até serem cancelados, que é o
-- correto.
--
-- Três detalhes que fazem o último ponto bater com o KPI de atrasado:
--   · só o que já venceu, e vencimento de HOJE ainda não é atraso (< e não <=)
--   · data de pagamento no futuro é lixo do Conta Azul (há título pago com
--     data em novembro e vencimento em fevereiro) — assume o vencimento
--   · título pago dentro do próprio mês do vencimento nunca esteve em atraso,
--     então não gera evento nenhum
-- ============================================================================

drop function if exists fn_divida_serie_mensal(date, date, uuid);

create or replace function fn_divida_serie_mensal(
  p_de date default null, p_ate date default null, p_empresa_id uuid default null
)
returns table (
  mes         date,
  vencido     numeric,   -- saldo em atraso no fim do mês
  venceu      numeric,   -- entrou em atraso neste mês
  pago        numeric,   -- amortizado por pagamento neste mês
  cancelado   numeric,   -- saiu sem pagamento neste mês
  titulos     bigint
)
language sql stable security definer set search_path = public
as $$
  with titulos as (
    select l.valor,
      date_trunc('month', l.data_vencimento)::date as mes_venc,
      -- NULL BETWEEN dá NULL, e NOT NULL continua NULL: sem o teste explícito
      -- de is null, todo cancelado sem pagamento caía em 'pagamento' e o
      -- mutirão de julho aparecia como R$ 2,4 mi amortizados.
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
      -- Sem excluir grupos 6,7,8: parcelamento e empréstimo são dívida com
      -- terceiro como qualquer outra. Só transferência interna fica de fora.
      and fn_normalizar(l.categoria) not in (select fn_normalizar(categoria) from categorias_excluidas)
      and (p_empresa_id is null or l.empresa_id = p_empresa_id)
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
  por_mes as (
    select mes, sum(delta) as delta, sum(venceu) as venceu,
           sum(pago) as pago, sum(cancelado) as cancelado, sum(qtd) as qtd
    from eventos group by mes
  ),
  acumulado as (
    select mes, venceu, pago, cancelado,
           sum(delta) over (order by mes) as vencido,
           sum(qtd)   over (order by mes) as titulos
    from por_mes
  )
  select mes, round(vencido, 2), round(venceu, 2), round(pago, 2), round(cancelado, 2), titulos
  from acumulado
  where mes >= date_trunc('month', coalesce(p_de,  '2024-01-01'::date))::date
    and mes <= date_trunc('month', coalesce(p_ate, current_date))::date
  order by mes
$$;

revoke all on function fn_divida_serie_mensal(date, date, uuid) from public, anon, authenticated;
grant execute on function fn_divida_serie_mensal(date, date, uuid) to service_role;

notify pgrst, 'reload schema';
