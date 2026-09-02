-- Despesa da matriz lançada em SW Londrina (maio/2026)
--
-- Achado a partir de uma observação do Cleber: a despesa de Londrina em maio
-- destoava — R$ 134 mil contra ~R$ 50 mil nos demais meses. Não era valor a
-- mais: era despesa da GP SafeWork lançada na unidade errada.
--
-- O padrão que confirmou:
--   Honorários ref 02.2026 → ativo na GP    ✓
--   Honorários ref 03.2026 → ativo na GP    ✓
--   Honorários ref 04.2026 → ativo em Londrina  ✗  (venc. em maio)
--
-- E o texto de vários deles não deixa dúvida: "Internet Sede", "IPTU SALA 01",
-- "IPTU SALA 02", "Seguro Sala", "Bolsa GP e SafeHelp".
--
-- Cada título JÁ EXISTIA nas duas empresas com o mesmo fonte_id — o correto,
-- na GP, é que estava cancelado, enquanto o duplicado em Londrina ficava
-- ativo. A correção é inverter os status, sem criar nada novo. O sync não
-- recria: ele já pula fonte_id que existe ativo em outra empresa.
--
-- 38 títulos operacionais, R$ 77.306,20. Efeito:
--   despesa de Londrina em maio   124.530 → 47.224   (padrão dos outros meses)
--   lucro de Londrina em maio     -68.177 → +18.955
--   lucro da GP em maio           -46.441 → -133.572
--
-- Antes, o mesmo tratamento foi dado a "Bolsa GP e SafeHelp" (R$ 9.825,04).

with pares as (
  select l.fonte_id from lancamentos_financeiros l
  where l.fonte_id is not null group by l.fonte_id
  having count(distinct l.empresa_id) = 2
     and count(*) filter (where l.status <> 'cancelado') = 1
     and count(*) filter (where l.status = 'cancelado')  = 1
),
alvo as (
  select l.id as id_londrina, lc.id as id_gp, l.status as status_original
  from pares p
  join lancamentos_financeiros l  on l.fonte_id  = p.fonte_id and l.status <> 'cancelado'
  join empresas e  on e.id  = l.empresa_id
  join lancamentos_financeiros lc on lc.fonte_id = p.fonte_id and lc.status = 'cancelado'
  join empresas ec on ec.id = lc.empresa_id
  where e.nome_curto = 'SW Londrina' and ec.nome_curto = 'GP SafeWork'
    and l.tipo = 'despesa'
    and l.data_vencimento between '2026-05-01' and '2026-05-31'
    and fn_normalizar(l.categoria) not in (select fn_normalizar(categoria) from categorias_excluidas)
),
cancela as (
  update lancamentos_financeiros l
  set status = 'cancelado',
      observacao = coalesce(l.observacao,'') ||
        ' [empresa-errada-2026-09-02: despesa da matriz lançada em SW Londrina; o par correto está na GP SafeWork com o mesmo fonte_id]'
  from alvo a where l.id = a.id_londrina returning l.id
)
update lancamentos_financeiros l
set status = a.status_original,
    observacao = coalesce(l.observacao,'') ||
      ' [empresa-correta-2026-09-02: reativado; estava cancelado enquanto o duplicado ficava ativo em SW Londrina]'
from alvo a where l.id = a.id_gp;
