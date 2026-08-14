-- Vendas de treinamento da SafeT, vindas do relatório do comercial.
--
-- Por que não derivar do financeiro: os lançamentos do Conta Azul dão valor e
-- data, mas não dizem qual NR foi treinada, para qual cliente, em que unidade
-- nem se era cliente novo. O relatório comercial tem tudo isso, e é o que
-- permite mostrar produção de verdade — não só faturamento.
--
-- Origem: exportação "vendas-safet-todos", campos Data, Cliente, CNPJ,
-- Negociação, Valor, Vendedor, Unidade, Tipo de contrato, Forma de pagamento
-- e Cortesia. As NRs são extraídas do texto livre da negociação
-- ("(TREINAMENTO NR35 - 2026) FULANO") e normalizadas para NR-35.
--
-- hash_dedup permite reimportar a planilha sem duplicar: a mesma venda gera
-- sempre a mesma chave.

CREATE TABLE IF NOT EXISTS public.vendas_treinamento (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  data_venda       date NOT NULL,
  cliente          text NOT NULL,
  cnpj             text,
  descricao        text,
  valor            numeric(14,2) NOT NULL DEFAULT 0,
  vendedor         text,
  unidade          text,
  tipo_contrato    text,
  forma_pagamento  text,
  cortesia         boolean NOT NULL DEFAULT false,
  nrs              text[] NOT NULL DEFAULT '{}',
  modalidade       text,
  hash_dedup       text NOT NULL UNIQUE,
  criado_em        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendas_treino_empresa_data
  ON public.vendas_treinamento (empresa_id, data_venda);

CREATE INDEX IF NOT EXISTS idx_vendas_treino_nrs
  ON public.vendas_treinamento USING gin (nrs);

-- RLS ligado sem policy: padrão do banco. Acesso só por service_role.
ALTER TABLE public.vendas_treinamento ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
