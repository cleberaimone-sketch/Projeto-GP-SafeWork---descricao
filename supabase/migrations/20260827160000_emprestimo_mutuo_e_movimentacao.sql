-- Empréstimo Mútuo entre Contas é movimentação, não empréstimo
--
-- Decisão do Cleber em 27/08/2026: transferência entre contas e empréstimo
-- mútuo entre contas do grupo são a mesma coisa — dinheiro andando de bolso
-- para bolso. Não é despesa nem receita, e também não é fluxo: fica fora de
-- tudo, como as demais transferências.
--
-- Estava classificado como não-operacional (grupo 7 por texto), o que o tirava
-- do lucro mas o mantinha no fluxo de caixa, fazendo a geração de caixa
-- parecer R$ 81.225 menor em 2026.
--
-- Uma linha basta: fn_normalizar remove acento, então cobre as duas grafias
-- que existem na base ("Empréstimo Mutuo" e "Emprestimo Mutuo") — 93 títulos,
-- R$ 152.136,70.
--
-- Não confundir com "Empréstimos de Sócios/Bancos/Terceiros": esses são dívida
-- real com terceiro e continuam como não-operacional (fora do lucro, dentro do
-- fluxo).

insert into categorias_excluidas (categoria, motivo)
select 'Empréstimo Mutuo entre Contas',
       'Movimentação entre contas do próprio grupo — não é despesa nem receita.'
where not exists (
  select 1 from categorias_excluidas
  where fn_normalizar(categoria) = fn_normalizar('Empréstimo Mutuo entre Contas')
);
