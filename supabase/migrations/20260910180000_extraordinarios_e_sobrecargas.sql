-- Ver o corpo da função e lib/financeiro/extraordinarios.ts para o contexto.
-- Aplicada via MCP em 10/09/2026.

create or replace function public.fn_lancamentos_extraordinarios(
  p_ano int, p_empresa_id uuid default null, p_ate_mes int default 12,
  p_fator numeric default 5, p_piso_share numeric default 0.05,
  p_piso_valor numeric default 20000
)
returns table(
  empresa_id uuid, nome_empresa text, data_vencimento date, categoria text,
  descricao text, valor numeric, mediana_categoria numeric,
  vezes_a_mediana numeric, share_receita_empresa numeric
)
language sql stable security definer set search_path to 'public'
as $$
  with base as (
    select l.id, l.empresa_id, e.nome_curto, l.data_vencimento, trim(l.categoria) as categoria,
           l.descricao, l.valor::numeric as valor
    from lancamentos_financeiros l
    join empresas e on e.id = l.empresa_id
    where l.status <> 'cancelado' and l.tipo = 'receita'
      and trim(coalesce(l.categoria,'')) ~ '^1\.'
      and extract(year from l.data_vencimento)::int = p_ano
      and extract(month from l.data_vencimento)::int <= p_ate_mes
      and (p_empresa_id is null or l.empresa_id = p_empresa_id)
      and fn_normalizar(l.categoria) not in (select fn_normalizar(categoria) from categorias_excluidas)
  ),
  ref as (
    select empresa_id, categoria,
           (percentile_cont(0.5) within group (order by valor))::numeric as mediana
    from base group by 1,2
  ),
  total_empresa as (select empresa_id, sum(valor)::numeric as receita_ano from base group by 1),
  -- Valor que se repete 3+ vezes no ano é rotina, não evento: é o que derruba
  -- os R$ 24.000 que a SafeT fatura todo mês (25x a mediana dela).
  recorrencia as (
    select b.id, count(o.id) as vezes
    from base b
    join base o on o.empresa_id = b.empresa_id and o.categoria = b.categoria
                and o.valor between b.valor * 0.95 and b.valor * 1.05
    group by b.id
  )
  select b.empresa_id, b.nome_curto, b.data_vencimento, b.categoria, b.descricao,
         round(b.valor, 2), round(r.mediana, 2),
         round(b.valor / nullif(r.mediana, 0), 1),
         round(b.valor / nullif(t.receita_ano, 0), 4)
  from base b
  join ref r using (empresa_id, categoria)
  join total_empresa t using (empresa_id)
  join recorrencia rec on rec.id = b.id
  where r.mediana > 0 and b.valor >= r.mediana * p_fator
    and b.valor >= t.receita_ano * p_piso_share
    and b.valor >= p_piso_valor and rec.vezes < 3
  order by b.valor desc
$$;

revoke execute on function public.fn_lancamentos_extraordinarios(int, uuid, int, numeric, numeric, numeric)
  from public, anon, authenticated;
grant execute on function public.fn_lancamentos_extraordinarios(int, uuid, int, numeric, numeric, numeric)
  to service_role;

-- `create or replace` com assinatura diferente NÃO substitui: cria sobrecarga
-- ao lado. Estas três ficaram para trás quando as funções ganharam parâmetros.
-- Nenhum código as chama, e uma chamada com o número de argumentos da versão
-- velha resolveria para ela em silêncio, sem o filtro que o chamador pensou ter.
drop function if exists public.fn_lancamentos_extraordinarios(int, uuid, int, numeric, numeric);
drop function if exists public.fn_soc_empresas_ativas(integer);
drop function if exists public.fn_divida_cronograma(uuid);

notify pgrst, 'reload schema';
