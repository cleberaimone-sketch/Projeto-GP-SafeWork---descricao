-- Gasto com profissional clínico, por unidade e por mês. Aplicada via MCP em
-- 11/09/2026. Ver o comentário abaixo para o porquê do recorte.
--
-- O painel mostrava cada tipo de profissional no grupo inteiro, e a decisão é
-- por unidade: em 2026 a Medianeira gasta ~R$ 10.500/mês com médico e Santa
-- Helena caiu de R$ 6.775 em março para R$ 1.525 em agosto. No consolidado as
-- duas curvas se anulam e nenhuma aparece.
create or replace function public.fn_custo_clinico_por_unidade(
  p_ano int, p_tipo text default 'medicos'   -- medicos | clinicas | fono | instrutores
)
returns table(unidade text, mes int, valor numeric)
language sql stable security definer set search_path to 'public'
as $$
  select e.nome_curto, extract(month from l.data_vencimento)::int,
         round(sum(l.valor)::numeric, 2)
  from lancamentos_financeiros l join empresas e on e.id = l.empresa_id
  where l.status <> 'cancelado' and l.tipo = 'despesa'
    and extract(year from l.data_vencimento)::int = p_ano
    and case p_tipo
      when 'medicos'     then lower(l.categoria) ~ 'honorários médicos|honorarios medicos'
      when 'clinicas'    then lower(l.categoria) ~ 'clínicas parceiras|clinicas parceiras'
      when 'fono'        then lower(l.categoria) ~ 'fonoaudióloga|fonoaudiologa|psicóloga|psicologa'
      when 'instrutores' then lower(l.categoria) ~ 'instrutores'
      else false
    end
  group by 1, 2 order by 1, 2
$$;

revoke execute on function public.fn_custo_clinico_por_unidade(int, text) from public, anon, authenticated;
grant execute on function public.fn_custo_clinico_por_unidade(int, text) to service_role;
notify pgrst, 'reload schema';
