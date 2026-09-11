-- Orçamento simulado: espelho onde há padrão, valor estável onde não há, com o
-- teto de evento extraordinário valendo nos dois caminhos.
-- Aplicada via MCP em 11/09/2026. Ver o corpo da função para o racional.
--
-- Cleber abriu a tela e descreveu o problema: "custo do serviço, tem vinte e
-- cinco, fevereiro vinte e oito, março quatrocentos e cinquenta, depois onze
-- mil". Era o espelho copiando 2025 mês a mês em categoria esporádica —
-- "Alimentação – Engenharia" foi de R$ 25 a R$ 2.233 conforme o mês, e R$ 25
-- em janeiro não é meta, é o acaso de um mês sem viagem.
--
-- Duas armadilhas encontradas ao escrever esta versão, ambas visíveis só nos
-- dados: o join lateral multiplicava os doze meses por cada mês do ano base e
-- violava a chave única; e aplicar o teto só no espelho fazia o caminho
-- uniforme dividir o total BRUTO por doze — "1.04.01 Treinamentos" da SafeT
-- saiu a R$ 94.312 POR MÊS porque o total de 2025 carregava os R$ 824.680 da
-- Venda 9200. Com o teto antes da agregação, fica R$ 35.124.

create or replace function public.fn_gerar_orcamento_simulado(
  p_ano_base int default 2025, p_ano_destino int default 2026,
  p_teto_mediana numeric default 3, p_piso_anual numeric default 1200,
  p_meses_para_regular int default 8, p_razao_para_regular numeric default 5
)
returns table(linhas_geradas bigint, meses_limitados bigint, unidades bigint,
              categorias_espelhadas bigint, categorias_uniformes bigint)
language plpgsql security definer set search_path to 'public'
as $function$
begin
  delete from metas_orcamentarias
  where ano = p_ano_destino and empresa_id is not null and observacao like 'simulado de %';

  return query
  with real_base as (
    select l.empresa_id, trim(l.categoria) as categoria,
           case when l.tipo='receita' then 'receita' else 'despesa' end as tipo,
           extract(month from l.data_vencimento)::int as mes, sum(l.valor) as valor
    from lancamentos_financeiros l
    where l.status <> 'cancelado'
      and l.data_vencimento >= make_date(p_ano_base,1,1)
      and l.data_vencimento <= make_date(p_ano_base,12,31)
      and fn_normalizar(l.categoria) not in (select fn_normalizar(categoria) from categorias_excluidas)
      and trim(coalesce(l.categoria,'')) ~ '^[0-9]'
    group by 1,2,3,4
  ), mediana as (
    select empresa_id, categoria, tipo,
           (percentile_cont(0.5) within group (order by valor))::numeric as mediana
    from real_base group by 1,2,3
  ), limitado as (
    select r.*, m.mediana,
           least(r.valor, m.mediana * p_teto_mediana)::numeric as valor_limitado,
           r.valor > m.mediana * p_teto_mediana as foi_limitado
    from real_base r join mediana m using (empresa_id, categoria, tipo)
  ), ref as (
    select empresa_id, categoria, tipo, mediana, sum(valor_limitado) as total_ano,
           max(valor_limitado) / nullif(min(valor_limitado),0) as razao,
           (count(*) filter (where valor_limitado > 0) >= p_meses_para_regular
            and coalesce(max(valor_limitado)/nullif(min(valor_limitado),0), 999) <= p_razao_para_regular) as regular
    from limitado group by 1,2,3,4
  ), a_inserir as (
    select l.empresa_id, l.mes, l.categoria, l.tipo, round(l.valor_limitado,2) as valor_meta,
           case when l.foi_limitado
                then 'simulado de '||p_ano_base||' · mes atipico limitado a '||p_teto_mediana
                     ||'x a mediana (real foi '||round(l.valor)::text||')'
                else 'simulado de '||p_ano_base||' · espelho do mesmo mes' end as observacao
    from limitado l join ref using (empresa_id, categoria, tipo)
    where ref.regular and ref.total_ano >= p_piso_anual and l.valor_limitado > 0
    union all
    select ref.empresa_id, m.mes, ref.categoria, ref.tipo, round((ref.total_ano/12)::numeric,2),
           'simulado de '||p_ano_base||' · valor uniforme (variou '
             ||round(coalesce(ref.razao,0))::text||'x entre meses no ano base)'
    from ref cross join generate_series(1,12) as m(mes)
    where not ref.regular and ref.total_ano >= p_piso_anual and ref.total_ano/12 > 0
  ), inseridas as (
    insert into metas_orcamentarias (empresa_id, ano, mes, categoria, tipo, valor_meta, observacao)
    select empresa_id, p_ano_destino, mes, categoria, tipo, valor_meta, observacao from a_inserir
    returning empresa_id, observacao
  )
  select count(*)::bigint,
         count(*) filter (where observacao like '%limitado%')::bigint,
         count(distinct empresa_id)::bigint,
         count(*) filter (where observacao like '%espelho%')::bigint,
         count(*) filter (where observacao like '%uniforme%')::bigint
  from inseridas;
end;
$function$;

-- `create or replace` com assinatura diferente cria sobrecarga em vez de
-- substituir — terceira vez nesta base. A de quatro parâmetros sai.
drop function if exists public.fn_gerar_orcamento_simulado(integer, integer, numeric, numeric);

notify pgrst, 'reload schema';
