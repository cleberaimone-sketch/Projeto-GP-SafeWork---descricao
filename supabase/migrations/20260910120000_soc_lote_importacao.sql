-- Importação do SOC idempotente por janela.
--
-- O espelho duplicou 8.725 exames em 09/09 e mais 13.879 em 10/09. A causa: o
-- fonte_id é o hash da linha crua, então quando lerTexto() corrigiu a leitura
-- ISO-8859-1 o mesmo exame passou a gerar outra chave, e o upsert virou insert.
-- Normalizar o hash resolve ESTE caso, mas a fragilidade continua: qualquer
-- mudança futura no parsing reduplica a base inteira, em silêncio.
--
-- A trava estrutural é não depender da chave. A máscara de exames filtra por
-- DATAEXAME (verificado: data_exame nunca sai da janela pedida, enquanto
-- data_ficha vai de 2022 a 2026), então cada importação carimba um lote e, só
-- depois de inserir com sucesso, apaga da MESMA faixa de datas o que sobrou de
-- lotes anteriores. Reimportar uma janela passa a produzir exatamente o
-- conteúdo que o SOC devolveu, sem depender de como o texto foi decodificado.
--
-- Insere-antes-de-apagar é deliberado: se a chamada ao SOC falhar ou vier
-- vazia, nada é apagado e a janela continua com o dado velho.

alter table soc_exames   add column if not exists lote_id uuid;
alter table soc_licencas add column if not exists lote_id uuid;

-- O delete varre por faixa de data e lote; sem índice ele faz seq scan em
-- 230 mil linhas a cada uma das 21 janelas.
create index if not exists idx_soc_exames_lote   on soc_exames   (data_exame, lote_id);
create index if not exists idx_soc_licencas_lote on soc_licencas (data_inicio, lote_id);

notify pgrst, 'reload schema';
