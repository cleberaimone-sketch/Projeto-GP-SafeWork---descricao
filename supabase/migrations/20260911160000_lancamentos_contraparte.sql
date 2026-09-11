-- Nome da contraparte do lançamento: quem pagou ou quem recebeu.
-- Aplicada via MCP em 11/09/2026.
--
-- A API do Conta Azul devolve `fornecedor` e `cliente` em cada evento
-- financeiro, e o tipo ContaAzulItemFinanceiro já os declarava — mapLancamento
-- é que não os copiava. O honorário da Larissa chegava como "Honorários ref
-- 08.2026", R$ 8.000, sem dizer de quem era.
--
-- Com o quadro migrado de CLT para PJ, é este campo que dá custo por PESSOA.
-- Sem ele, o custo de pessoal só existe agregado por categoria.
--
-- É dado pessoal (LGPD). A tabela já tem RLS e nenhum grant para anon.
alter table lancamentos_financeiros add column if not exists contraparte text;

create index if not exists idx_lanc_contraparte
  on lancamentos_financeiros (contraparte, data_vencimento)
  where contraparte is not null;

notify pgrst, 'reload schema';
