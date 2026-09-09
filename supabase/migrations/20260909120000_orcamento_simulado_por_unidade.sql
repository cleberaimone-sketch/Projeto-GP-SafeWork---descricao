-- Orçamento simulado por unidade para 2026, a partir de 2025.
--
-- O orçamento que existia era só consolidado do grupo (empresa_id nulo), então
-- "cada unidade contra o orçado" não tinha como ser respondido. O Cleber pediu
-- para simular com base no ano passado, conferir e editar à mão — este script
-- gera o ponto de partida.
--
-- DUAS DECISÕES QUE MUDAM O NÚMERO:
--
-- 1. Espelha MÊS A MÊS, não a média anual. A primeira tentativa foi mediana
--    vezes doze e deu R$ 4,2 mi de despesa para a matriz contra R$ 1,59 mi
--    reais — multiplicar por doze uma categoria que teve movimento em dois
--    meses infla tudo. O espelho preserva sazonalidade e fecha com o realizado.
--
-- 2. Teto de 3x a mediana por categoria. Sem ele, a Venda 9200 da SafeT
--    (R$ 412 mil em janeiro e outros R$ 412 mil em fevereiro de 2025) viraria
--    meta de janeiro e fevereiro de 2026, e a unidade nasceria com um
--    orçamento que ninguém consegue cumprir. Onde o teto agiu, a observação
--    guarda o valor real para conferência.
--
-- Piso de R$ 1.200/ano por categoria: abaixo disso é ruído, não meta.
-- As metas consolidadas do Cleber (empresa_id nulo) não são tocadas.

delete from metas_orcamentarias
where ano = 2026 and empresa_id is not null
  and observacao like 'simulado de 2025%';

with real2025 as (
  select l.empresa_id, trim(l.categoria) as categoria,
         case when l.tipo='receita' then 'receita' else 'despesa' end as tipo,
         extract(month from l.data_vencimento)::int as mes,
         sum(l.valor) as valor
  from lancamentos_financeiros l
  where l.status <> 'cancelado'
    and l.data_vencimento between '2025-01-01' and '2025-12-31'
    and fn_normalizar(l.categoria) not in (select fn_normalizar(categoria) from categorias_excluidas)
    -- Categoria sem código numérico fica fora: são as 102 linhas de 2025 em
    -- categorias soltas ("oi", "VERIFICAR ...") que nem plano de contas têm.
    and trim(coalesce(l.categoria,'')) ~ '^[0-9]'
  group by 1,2,3,4
), ref as (
  select empresa_id, categoria, tipo,
         percentile_cont(0.5) within group (order by valor) as mediana,
         sum(valor) as total_ano
  from real2025 group by 1,2,3
)
insert into metas_orcamentarias (empresa_id, ano, mes, categoria, tipo, valor_meta, observacao)
select r.empresa_id, 2026, r.mes, r.categoria, r.tipo,
       round(least(r.valor, ref.mediana * 3)::numeric, 2),
       case when r.valor > ref.mediana * 3
            then 'simulado de 2025 · mês atípico limitado a 3x a mediana (real foi '
                 || round(r.valor)::text || ')'
            else 'simulado de 2025 · espelho do mesmo mês' end
from real2025 r
join ref on ref.empresa_id = r.empresa_id and ref.categoria = r.categoria and ref.tipo = r.tipo
where ref.total_ano >= 1200
  and least(r.valor, ref.mediana * 3) > 0;
