-- Ver o corpo das funções para o contexto. Aplicadas via MCP em 10/09/2026.

-- Resumo de ASO agregado no banco. O painel de medicina chamava
-- fn_aso_vencido() e contava as 21.308 linhas em JavaScript — o PostgREST corta
-- em 1.000 e a tela exibia "1.000 trabalhadores, 261 precisam de ação" contra
-- os 21.308 e 5.223 reais. Agregar aqui tira o número do teto e evita trafegar
-- o CPF de 21 mil pessoas para montar quatro contadores.
create or replace function public.fn_aso_resumo(p_dias int default 365, p_top_empresas int default 8)
returns json
language sql stable security definer set search_path to 'public'
as $$
  with base as (select * from fn_aso_vencido(p_dias)),
  por_situacao as (select situacao_aso, count(*) as qtd from base group by 1),
  por_empresa as (
    select coalesce(nome_empresa, '(sem empresa)') as empresa, count(*) as qtd
    from base where precisa_agendar group by 1 order by 2 desc limit p_top_empresas
  )
  select json_build_object(
    'trabalhadores', (select count(*) from base),
    'precisam_acao', (select count(*) from base where precisa_agendar),
    'por_situacao',  (select coalesce(json_object_agg(situacao_aso, qtd), '{}'::json) from por_situacao),
    'top_empresas',  (select coalesce(json_agg(json_build_object('empresa', empresa, 'qtd', qtd)), '[]'::json) from por_empresa)
  )
$$;

revoke execute on function public.fn_aso_resumo(int, int) from public, anon, authenticated;
grant execute on function public.fn_aso_resumo(int, int) to service_role;

-- ORDER BY completo em fn_orcamento_ano: `1,3` deixava `tipo` de fora, e mesma
-- categoria com receita e despesa no mesmo mês empata. Paginar sobre empate
-- repete uma linha e pula outra. A função está em 700 linhas — 70% do teto.
create or replace function public.fn_orcamento_ano(p_ano integer, p_empresa_id uuid default null)
returns table(categoria text, tipo text, mes integer, realizado numeric)
language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(lf.categoria,'(sem categoria)'), lf.tipo,
    extract(month from lf.data_pagamento)::int, coalesce(sum(lf.valor),0)
  from lancamentos_financeiros lf
  where lf.status in ('pago','parcial') and lf.data_pagamento is not null
    and lf.data_vencimento between make_date(p_ano,1,1) and make_date(p_ano,12,31)
    and (p_empresa_id is null or lf.empresa_id = p_empresa_id)
    and not exists (select 1 from categorias_excluidas ce
      where fn_normalizar(lf.categoria)=fn_normalizar(ce.categoria))
  group by 1,2,3 order by 1,2,3;
$function$;

notify pgrst, 'reload schema';
