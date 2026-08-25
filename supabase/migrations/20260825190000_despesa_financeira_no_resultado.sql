-- ============================================================================
-- Despesa financeira volta para o resultado + consolidação de duplicatas
-- ============================================================================
-- Na DRE tradicional (Lei 6.404/76, CPC 26), a estrutura é:
--
--   Receita Bruta
--   (−) Deduções                      → Receita Líquida
--   (−) Custo dos Serviços            → Lucro Bruto
--   (−) Despesas Operacionais         → Resultado Operacional (EBIT)
--   (±) Resultado Financeiro          ← grupo 5 entra AQUI
--                                     → Resultado antes do IR
--   (−) IR/CSLL                       → LUCRO LÍQUIDO
--
-- Ou seja: despesa financeira sai do lucro OPERACIONAL, mas entra no lucro
-- LÍQUIDO. A regra anterior tirava o grupo 5 do resultado, o que só estaria
-- certo se o número exibido fosse EBIT — e não é, é resultado.
--
-- Grupos 6, 7 e 8 continuam fora, e isso está correto: compra de imobilizado,
-- principal de empréstimo e principal de parcelamento são conta patrimonial,
-- não despesa. O que deles chega à DRE são os juros — que são justamente o
-- grupo 5, agora incluído.
--
-- Aproveita para eliminar duas funções que dupliquei em 25/08 sem ter visto as
-- canônicas: fn_normalizar_categoria (= fn_normalizar) e
-- fn_categoria_nao_operacional (= fn_nao_operacional). Conferido antes de
-- remover: mesma classificação nas 160 categorias e mesmos 5.023 lançamentos
-- excluídos como transferência.
-- ============================================================================

-- 1) A regra canônica passa a manter o grupo 5 no resultado.
create or replace function fn_nao_operacional(txt text)
returns boolean
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  -- 6 investimento · 7 empréstimo · 8 parcelamento — conta patrimonial.
  -- O grupo 5 (juros) NÃO entra aqui: é despesa financeira e compõe o
  -- resultado do exercício.
  SELECT COALESCE(substring(trim(COALESCE(txt, '')) FROM '^([0-9])'), '') IN ('6','7','8')
      OR fn_normalizar(txt) LIKE 'EMPRESTIMO%'
      OR fn_normalizar(txt) = 'VENDA DE ATIVOS'
      OR fn_normalizar(txt) = 'OI'
$$;

-- 2) As duas RPCs criadas hoje passam a usar as funções canônicas.
create or replace function fn_kpis_command_center(p_ano int default null)
returns table (
  ano int, receita_ano numeric, despesa_ano numeric, resultado_ano numeric,
  inadimplencia numeric, qtd_inadimplencia int,
  a_pagar numeric, qtd_a_pagar int,
  despesas_vencidas numeric, qtd_despesas_vencidas int
)
language sql stable security definer set search_path = public as $$
  with alvo as (
    select coalesce(p_ano, extract(year from current_date)::int) as ano
  ),
  excluidas as (
    select fn_normalizar(categoria) as cat from categorias_excluidas
  ),
  fluxo as (
    select l.tipo, l.valor, l.status
    from lancamentos_financeiros l, alvo a
    where l.status <> 'cancelado'
      and l.data_vencimento >= make_date(a.ano, 1, 1)
      and l.data_vencimento <= make_date(a.ano, 12, 31)
      and fn_normalizar(l.categoria) not in (select cat from excluidas)
  ),
  dre as (
    select l.tipo, l.valor, l.status
    from lancamentos_financeiros l, alvo a
    where l.status <> 'cancelado'
      and l.data_vencimento >= make_date(a.ano, 1, 1)
      and l.data_vencimento <= make_date(a.ano, 12, 31)
      and fn_normalizar(l.categoria) not in (select cat from excluidas)
      and not fn_nao_operacional(l.categoria)
  )
  select
    (select ano from alvo),
    coalesce((select sum(valor) from dre where tipo = 'receita'), 0),
    coalesce((select sum(valor) from dre where tipo = 'despesa'), 0),
    coalesce((select sum(valor) from dre where tipo = 'receita'), 0)
      - coalesce((select sum(valor) from dre where tipo = 'despesa'), 0),
    coalesce((select sum(valor) from dre where tipo = 'receita' and status = 'vencido'), 0),
    (select count(*) from dre where tipo = 'receita' and status = 'vencido')::int,
    coalesce((select sum(valor) from fluxo where tipo = 'despesa' and status in ('pendente','vencido')), 0),
    (select count(*) from fluxo where tipo = 'despesa' and status in ('pendente','vencido'))::int,
    coalesce((select sum(valor) from dre where tipo = 'despesa' and status = 'vencido'), 0),
    (select count(*) from dre where tipo = 'despesa' and status = 'vencido')::int
$$;

create or replace function fn_dre_unidade_mensal(p_ano int default null)
returns table (
  empresa_id uuid, unidade text, mes int, linha text, total numeric, qtd bigint
)
language sql stable security definer set search_path = public
as $$
  with alvo as (
    select coalesce(p_ano, extract(year from current_date)::int) as ano
  ),
  excluidas as (
    select fn_normalizar(categoria) as cat from categorias_excluidas
  ),
  base as (
    select
      l.empresa_id,
      e.nome_curto                               as unidade,
      extract(month from l.data_vencimento)::int as mes,
      case
        when trim(l.categoria) like '8.01.02%' then 'parc_contas_antigas'
        when trim(l.categoria) like '8.01.03%' then 'parc_contas_atuais'
        when trim(l.categoria) like '8.01.04%' then 'parc_lucro_presumido'
        else case substring(trim(l.categoria) from '^[0-9]')
          when '1' then 'receita_bruta'
          when '2' then 'deducoes'
          when '3' then 'custo_servicos'
          when '4' then 'despesas_admin'
          when '5' then 'despesas_financeiras'
          when '6' then 'investimentos'
          when '7' then 'emprestimos_socios'
          when '8' then 'parc_outros'
        end
      end                                        as linha,
      case when l.tipo = 'despesa' then -l.valor else l.valor end as valor_com_sinal
    from lancamentos_financeiros l
    join empresas e on e.id = l.empresa_id
    cross join alvo a
    where l.status <> 'cancelado'
      and l.data_vencimento >= make_date(a.ano, 1, 1)
      and l.data_vencimento <= make_date(a.ano, 12, 31)
      and fn_normalizar(l.categoria) not in (select cat from excluidas)
  )
  select empresa_id, unidade, mes, linha,
         round(sum(valor_com_sinal)::numeric, 2), count(*)
  from base
  where linha is not null
  group by empresa_id, unidade, mes, linha
$$;

revoke all on function fn_kpis_command_center(int) from public, anon, authenticated;
revoke all on function fn_dre_unidade_mensal(int)  from public, anon, authenticated;
grant execute on function fn_kpis_command_center(int) to service_role;
grant execute on function fn_dre_unidade_mensal(int)  to service_role;

-- 3) Fora as duplicatas, agora sem nenhum dependente.
drop function if exists fn_categoria_nao_operacional(text);
drop function if exists fn_normalizar_categoria(text);

notify pgrst, 'reload schema';
