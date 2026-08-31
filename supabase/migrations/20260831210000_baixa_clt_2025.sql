-- Folha CLT de 2025 já estava quitada, faltava a baixa no Conta Azul
--
-- Cleber em 31/08/2026: os títulos de "4.01.12 Mão de Obra Direta - CLT -
-- Administrativo" em aberto são todos de 2025 e já foram pagos; o que faltou
-- foi dar baixa no Conta Azul. Ele vai regularizar lá; até então, a correção
-- fica aqui.
--
-- 22 títulos, R$ 86.466,68, todos entre janeiro e maio de 2025:
--   SW Meio Ambiente  19 títulos  R$ 78.157,47
--   Safe+              3 títulos  R$  8.309,21
--
-- data_pagamento = data_vencimento (aproximação: folha costuma ser paga na
-- data), com marcador na observação para a baixa ser reversível e para o sync
-- não desfazê-la.

update lancamentos_financeiros
set status = 'pago',
    data_pagamento = data_vencimento,
    observacao = coalesce(observacao, '') ||
      ' [baixa-clt-2026-08-31: folha de 2025 já quitada, faltava dar baixa no Conta Azul]'
where status in ('vencido', 'pendente')
  and fn_normalizar(categoria) like '%MAO DE OBRA DIRETA%CLT%'
  and extract(year from data_vencimento) = 2025;
