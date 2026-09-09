-- Fecha as tabelas criadas nesta semana sem RLS. Ver corpo da migration
-- aplicada em 09/09/2026 para o detalhe do que estava exposto.
--
-- Resumo: 8 tabelas em `public` estavam com RLS DESABILITADO e com
-- `grant select, insert, update to anon` — entre elas soc_exames_trabalhador
-- (exames de 28 mil pessoas, com CPF e parecer médico) e soc_funcionarios
-- (CPF, nome, cargo). O padrão foi copiado das tabelas de domínio do projeto
-- sem notar que essas carregam dado pessoal e de saúde.

alter table public.soc_exames                   enable row level security;
alter table public.soc_exames_trabalhador       enable row level security;
alter table public.soc_licencas                 enable row level security;
alter table public.soc_funcionarios             enable row level security;
alter table public.soc_importacoes              enable row level security;
alter table public.soc_importacoes_empresa      enable row level security;
alter table public.soc_importacoes_funcionarios enable row level security;
alter table public.conta_azul_token_rotacoes    enable row level security;

revoke all on public.soc_exames                   from anon, authenticated;
revoke all on public.soc_exames_trabalhador       from anon, authenticated;
revoke all on public.soc_licencas                 from anon, authenticated;
revoke all on public.soc_funcionarios             from anon, authenticated;
revoke all on public.soc_importacoes              from anon, authenticated;
revoke all on public.soc_importacoes_empresa      from anon, authenticated;
revoke all on public.soc_importacoes_funcionarios from anon, authenticated;
revoke all on public.conta_azul_token_rotacoes    from anon, authenticated;
revoke all on public.mv_soc_empresas_ativas       from anon, authenticated;

-- Toda função nasce com EXECUTE para PUBLIC, e anon/authenticated herdam daí:
-- revogar só dos dois papéis não tem efeito. É de PUBLIC que precisa sair.
revoke execute on function public.fn_aso_situacao(integer)                                from public;
revoke execute on function public.fn_soc_exames_mensal(integer)                           from public;
revoke execute on function public.fn_soc_empresas_ativas(integer)                         from public;
revoke execute on function public.fn_soc_empresas_ativas(integer, integer, integer)       from public;
revoke execute on function public.fn_despesa_recorrente_irregular(integer, integer, uuid) from public;
revoke execute on function public.fn_dre_categoria_mensal(integer, uuid)                  from public;
revoke execute on function public.fn_saude_unidades(integer, integer)                     from public;
revoke execute on function public.fn_gerar_orcamento_simulado(integer, integer, numeric, numeric) from public;

grant execute on function public.fn_aso_situacao(integer)                                to service_role;
grant execute on function public.fn_soc_exames_mensal(integer)                           to service_role;
grant execute on function public.fn_soc_empresas_ativas(integer)                         to service_role;
grant execute on function public.fn_soc_empresas_ativas(integer, integer, integer)       to service_role;
grant execute on function public.fn_despesa_recorrente_irregular(integer, integer, uuid) to service_role;
grant execute on function public.fn_dre_categoria_mensal(integer, uuid)                  to service_role;
grant execute on function public.fn_saude_unidades(integer, integer)                     to service_role;
grant execute on function public.fn_gerar_orcamento_simulado(integer, integer, numeric, numeric) to service_role;

notify pgrst, 'reload schema';
