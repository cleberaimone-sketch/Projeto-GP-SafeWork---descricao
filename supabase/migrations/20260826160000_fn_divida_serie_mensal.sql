-- ============================================================================
-- Série histórica do saldo devedor vencido
-- ============================================================================
-- Quanto estava vencido e não pago no fim de cada mês, desde 2024.
--
-- Reconstrói o passado a partir das datas, já que não guardamos histórico de
-- status. Cada título gera dois eventos: entra na dívida no mês do vencimento
-- e sai no mês em que foi liquidado. O saldo de um mês é a soma acumulada dos
-- eventos até ali — linear no número de títulos. (A primeira versão cruzava
-- cada título com cada mês; correto, mas ficava mais lenta a cada mês novo.
-- Conferido: as duas dão diferença de R$ 0,00.)
--
-- Data de saída por status:
--   pago/parcial → data_pagamento
--   cancelado    → updated_at (aproximação: é quando o registro mudou)
--   em aberto    → não saiu, pesa até hoje
--
-- Incluir os cancelados até a data do cancelamento é o que faz o mutirão de
-- julho/2026 aparecer como queda, em vez de sumir do histórico inteiro.
--
-- Três detalhes que fazem o último ponto bater com o KPI de atrasado:
--   · só o que já venceu, e vencimento de HOJE ainda não é atraso (< e não <=)
--   · data de pagamento no futuro é lixo do Conta Azul (há título pago com
--     data em novembro e vencimento em fevereiro) — assume o vencimento
--   · título pago dentro do próprio mês do vencimento nunca esteve em atraso,
--     então não gera evento nenhum
--
-- Só "vencido", de propósito: um "total em aberto" retroativo contaria, em
-- janeiro de 2024, títulos de 2026 que ainda nem existiam — não temos data de
-- lançamento confiável para reconstruir isso.
-- ============================================================================

create or replace function fn_divida_serie_mensal(
  p_de date default null, p_ate date default null, p_empresa_id uuid default null
)
returns table (mes date, vencido numeric, titulos bigint)
language sql stable security definer set search_path = public
as $$
  with titulos as (
    select l.valor,
      date_trunc('month', l.data_vencimento)::date as mes_venc,
      date_trunc('month', case
        when l.status in ('pago','parcial')
          then case when l.data_pagamento between '2023-01-01' and current_date
                    then l.data_pagamento else l.data_vencimento end
        when l.status = 'cancelado' then l.updated_at::date
        else null end)::date as mes_saida
    from lancamentos_financeiros l
    where l.tipo = 'despesa'
      and l.data_vencimento is not null
      and l.data_vencimento < current_date
      and not fn_nao_operacional(l.categoria)
      and fn_normalizar(l.categoria) not in (select fn_normalizar(categoria) from categorias_excluidas)
      and (p_empresa_id is null or l.empresa_id = p_empresa_id)
  ),
  eventos as (
    select mes_venc as mes, valor as delta, 1::bigint as qtd from titulos
     where mes_saida is null or mes_saida > mes_venc
    union all
    select mes_saida, -valor, -1::bigint from titulos
     where mes_saida is not null and mes_saida > mes_venc
  ),
  por_mes as (select mes, sum(delta) as delta, sum(qtd) as qtd from eventos group by mes),
  acumulado as (
    select mes,
           sum(delta) over (order by mes) as vencido,
           sum(qtd)   over (order by mes) as titulos
    from por_mes
  )
  select mes, round(vencido, 2), titulos
  from acumulado
  where mes >= date_trunc('month', coalesce(p_de,  '2024-01-01'::date))::date
    and mes <= date_trunc('month', coalesce(p_ate, current_date))::date
  order by mes
$$;

revoke all on function fn_divida_serie_mensal(date, date, uuid) from public, anon, authenticated;
grant execute on function fn_divida_serie_mensal(date, date, uuid) to service_role;

notify pgrst, 'reload schema';
