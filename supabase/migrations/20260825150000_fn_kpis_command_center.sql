-- ============================================================================
-- KPIs do Centro de Comando — agregados no banco, janela anual
-- ============================================================================
-- Por que RPC e não leitura direta: o ano tem ~15 mil lançamentos e o PostgREST
-- corta em 1000. Paginar custaria 16 requisições a cada carregamento do painel.
-- Agrega aqui e devolve uma linha.
--
-- As regras replicam web/lib/financeiro/regras.ts. Mudou lá, muda aqui.
-- ============================================================================

-- Mesma normalização do normalizarTexto() no TS: sem acento, sem espaço nas
-- pontas, maiúscula. Usada para casar categoria com categorias_excluidas.
create or replace function fn_normalizar_categoria(p_texto text)
returns text
language sql
immutable
parallel safe
as $$
  select upper(translate(trim(coalesce(p_texto, '')),
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))
$$;

-- Grupos não-operacionais pelo 1º dígito do plano de contas do Conta Azul:
--   5 juros · 6 investimento · 7 empréstimo · 8 parcelamento
-- Saem do LUCRO, permanecem no FLUXO DE CAIXA (é dinheiro que sai mesmo).
-- Também saem os não-operacionais sem número, categorizados só por texto.
create or replace function fn_categoria_nao_operacional(p_categoria text)
returns boolean
language sql
immutable
parallel safe
as $$
  select coalesce(
    substring(trim(coalesce(p_categoria, '')) from '^[0-9]') in ('5','6','7','8')
    or fn_normalizar_categoria(p_categoria) like 'EMPRESTIMO%'
    or fn_normalizar_categoria(p_categoria) in ('VENDA DE ATIVOS', 'OI'),
    false)
$$;

create or replace function fn_kpis_command_center(p_ano int default null)
returns table (
  ano                 int,
  receita_ano         numeric,   -- DRE: operacional
  despesa_ano         numeric,   -- DRE: operacional
  resultado_ano       numeric,
  inadimplencia       numeric,   -- receita operacional vencida
  qtd_inadimplencia   int,
  a_pagar             numeric,   -- FLUXO: despesa em aberto (inclui empréstimo/parcelamento)
  qtd_a_pagar         int,
  despesas_vencidas   numeric,
  qtd_despesas_vencidas int
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
  -- Base de FLUXO: fora cancelado e transferência interna entre empresas do grupo.
  fluxo as (
    select l.tipo, l.valor, l.status
    from lancamentos_financeiros l, alvo a
    where l.status <> 'cancelado'
      and l.data_vencimento >= make_date(a.ano, 1, 1)
      and l.data_vencimento <= make_date(a.ano, 12, 31)
      and fn_normalizar_categoria(l.categoria) not in (select cat from excluidas)
  ),
  -- Base de DRE: o fluxo menos os grupos não-operacionais.
  dre as (
    select l.tipo, l.valor, l.status
    from lancamentos_financeiros l, alvo a
    where l.status <> 'cancelado'
      and l.data_vencimento >= make_date(a.ano, 1, 1)
      and l.data_vencimento <= make_date(a.ano, 12, 31)
      and fn_normalizar_categoria(l.categoria) not in (select cat from excluidas)
      and not fn_categoria_nao_operacional(l.categoria)
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

-- Funções nascem com EXECUTE para PUBLIC — revogar de PUBLIC, não só de anon.
revoke all on function fn_normalizar_categoria(text)      from public, anon, authenticated;
revoke all on function fn_categoria_nao_operacional(text) from public, anon, authenticated;
revoke all on function fn_kpis_command_center(int)        from public, anon, authenticated;
grant execute on function fn_normalizar_categoria(text)      to service_role;
grant execute on function fn_categoria_nao_operacional(text) to service_role;
grant execute on function fn_kpis_command_center(int)        to service_role;

create index if not exists idx_lancamentos_venc_tipo_status
  on lancamentos_financeiros (data_vencimento, tipo, status);

notify pgrst, 'reload schema';
