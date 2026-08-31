-- Empréstimo a sócios era distribuição de lucro
--
-- Cleber em 31/08/2026: o que está lançado como "7.01.03 Empréstimos de
-- Sócios" foi na verdade divisão de lucro. Ficou registrado como empréstimo no
-- ERP, mas não é conta que a empresa precise pagar — não deve aparecer como
-- dívida nem na fila de contas a pagar.
--
-- Baixados como PAGOS (não cancelados): o dinheiro de fato saiu para os
-- sócios, então continua sendo saída de caixa na data. É o mesmo tratamento
-- dos outros 610 títulos da categoria, que já estavam pagos. Cancelar faria o
-- valor sumir também do fluxo, o que seria errado.
--
-- 69 títulos, R$ 354.206,13:
--   SafeT             27 títulos  R$ 260.926,02  jan–mai/2025
--   Safe+             39 títulos  R$  77.050,05  jan–mar/2025
--   SW Meio Ambiente   1 título   R$  15.238,06  mar/2025
--   SW Medianeira      2 títulos  R$     992,00  ago/2026
--
-- data_pagamento = data_vencimento, e a observação guarda o motivo, para a
-- baixa ser reversível como foi a do backlog.

update lancamentos_financeiros
set status = 'pago',
    data_pagamento = data_vencimento,
    observacao = coalesce(observacao, '') ||
      ' [baixa-divisao-lucro-2026-08-31: registrado como empréstimo a sócios no ERP, mas era distribuição de lucro já realizada]'
where status in ('vencido', 'pendente')
  and trim(categoria) like '7.01.03%';
