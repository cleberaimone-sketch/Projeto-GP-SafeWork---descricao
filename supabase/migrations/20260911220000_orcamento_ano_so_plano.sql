-- fn_orcamento_ano passa a ler só categorias DO PLANO DE CONTAS.
-- Aplicada via MCP em 11/09/2026.
--
-- A tela de Orçamento cruza realizado com orçado, e os dois precisam falar do
-- mesmo universo. O gerador de metas ignora categoria sem código numérico, mas
-- esta função trazia todas — então o realizado mostrava linha que nunca terá
-- meta.
--
-- Cleber filtrou GP SafeWork e viu "uma receita grande numa empresa que nem tem
-- receita": era "Venda de Ativos", R$ 175.000 em 2025, a unidade móvel vendida.
-- Está lançada com tipo=receita, não tem código de plano, e classificarPorPlano
-- a trata como investimento nas outras telas. Aqui entrava como receita da
-- matriz, que fatura R$ 263 no ano.
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
    and trim(coalesce(lf.categoria,'')) ~ '^[0-9]'
    and not exists (select 1 from categorias_excluidas ce
      where fn_normalizar(lf.categoria)=fn_normalizar(ce.categoria))
  group by 1,2,3 order by 1,2,3;
$function$;
notify pgrst, 'reload schema';
