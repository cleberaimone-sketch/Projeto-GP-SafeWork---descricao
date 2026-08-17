-- Turmas de treinamento, uma linha por turma contratada.
--
-- Vem da coluna "Produtos" do relatório bianual, que é estruturada:
--
--   SAFE T - NR35 - TRABALHADOR (P) (1x R$ 1.390,00)
--   SAFE T - NR23 (P) (10x R$ 2.290,00) | SAFE T - NR07 (P) (10x R$ 2.290,00)
--
-- Cada item separado por " | " é uma turma. O (P)/(E)/(S) é a modalidade e o
-- "Nx" é a quantidade de vagas — não é multiplicador: o valor entre parênteses
-- já é o total daquela linha. Confirmado batendo a soma contra o valor da
-- venda; ex. "NR05 (E) (20x R$ 3.000,00)" numa venda de R$ 3.000, ou seja
-- R$ 150 por vaga, que é o preço de EAD que aparece solto na base.
--
-- vagas fica NULL quando o contrato não informa (turma fechada, "1x"): são 314
-- das 372 turmas. Preferimos NULL a um palpite — a página mostra turmas como
-- dado real e participantes apenas onde foram informados, deixando explícito
-- que a lotação não é registrada no restante. Decisão do Cleber em 17/08/2026.
--
-- Itens que não são treinamento (marmita, deslocamento, hospedagem) ficam de
-- fora: entram no valor da venda, mas não são turma.

CREATE TABLE IF NOT EXISTS public.turmas_treinamento (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id    uuid NOT NULL REFERENCES public.vendas_treinamento(id) ON DELETE CASCADE,
  empresa_id  uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  data_venda  date NOT NULL,
  norma       text NOT NULL,
  descricao   text,
  modalidade  text NOT NULL,          -- Presencial | EAD / Online | Semipresencial
  vagas       integer,                -- NULL = turma fechada, lotação não informada
  valor       numeric(14,2) NOT NULL DEFAULT 0,
  hash_dedup  text NOT NULL UNIQUE,
  criado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_turmas_treino_empresa_data
  ON public.turmas_treinamento (empresa_id, data_venda);

CREATE INDEX IF NOT EXISTS idx_turmas_treino_norma
  ON public.turmas_treinamento (norma);

ALTER TABLE public.turmas_treinamento ENABLE ROW LEVEL SECURITY;

-- Campos extras que só existem no relatório bianual, não no CSV de vendas.
ALTER TABLE public.vendas_treinamento
  ADD COLUMN IF NOT EXISTS grupo            text,
  ADD COLUMN IF NOT EXISTS origem_lead      text,
  ADD COLUMN IF NOT EXISTS produtos_raw     text,
  ADD COLUMN IF NOT EXISTS observacoes      text,
  ADD COLUMN IF NOT EXISTS responsavel_legal text;

NOTIFY pgrst, 'reload schema';
