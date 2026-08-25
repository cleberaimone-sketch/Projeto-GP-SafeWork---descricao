-- ============================================================================
-- DRE por unidade e mês — base dos gráficos da página /financeiro/unidades
-- ============================================================================
-- Replica a estrutura da planilha "DRE - Resumido" que era preenchida à mão a
-- partir do Conta Azul: uma linha por unidade × mês × linha do DRE.
--
-- O plano de contas do Conta Azul já carrega a classificação no próprio nome
-- da categoria ("3.01.01 Honorários Clínicas Parceiras"), então o 1º dígito
-- define a linha do DRE, exatamente como na planilha:
--   1 Receita Bruta · 2 Deduções · 3 Custo dos Serviços · 4 Desp. Administrativas
--   5 Desp. Financeiras · 6 Investimentos · 7 Empréstimos de Sócios · 8 Parcelamentos
--   9 Transferência entre contas do grupo → NUNCA entra (não é receita nem despesa)
--
-- Sinal: receita positiva, despesa negativa — como a planilha — para que o
-- gráfico empilhe na direção certa sem a página ter de inverter nada.
-- ============================================================================

create or replace function fn_dre_unidade_mensal(p_ano int default null)
returns table (
  empresa_id  uuid,
  unidade     text,
  mes         int,
  linha       text,
  total       numeric,
  qtd         bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with alvo as (
    select coalesce(p_ano, extract(year from current_date)::int) as ano
  ),
  excluidas as (
    select fn_normalizar_categoria(categoria) as cat from categorias_excluidas
  ),
  base as (
    select
      l.empresa_id,
      e.nome_curto                                    as unidade,
      extract(month from l.data_vencimento)::int      as mes,
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
      end                                             as linha,
      -- despesa entra negativa, como no demonstrativo em papel
      case when l.tipo = 'despesa' then -l.valor else l.valor end as valor_com_sinal
    from lancamentos_financeiros l
    join empresas e on e.id = l.empresa_id
    cross join alvo a
    where l.status <> 'cancelado'
      and l.data_vencimento >= make_date(a.ano, 1, 1)
      and l.data_vencimento <= make_date(a.ano, 12, 31)
      and fn_normalizar_categoria(l.categoria) not in (select cat from excluidas)
  )
  select empresa_id, unidade, mes, linha,
         round(sum(valor_com_sinal)::numeric, 2), count(*)
  from base
  where linha is not null          -- descarta o que não tem código de plano de contas
  group by empresa_id, unidade, mes, linha
$$;

revoke all on function fn_dre_unidade_mensal(int) from public, anon, authenticated;
grant execute on function fn_dre_unidade_mensal(int) to service_role;

notify pgrst, 'reload schema';
