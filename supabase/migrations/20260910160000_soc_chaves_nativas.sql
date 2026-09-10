-- Troca a chave de soc_exames_trabalhador e soc_funcionarios por
-- identificadores do próprio SOC. Aplicada via MCP em 10/09/2026.
--
-- Elas usavam hash do texto como fonte_id, o mesmo desenho que duplicou 22.266
-- exames em soc_exames quando a decodificação ISO-8859-1 foi corrigida: o
-- conteúdo mudou de bytes, o hash mudou junto e o upsert virou insert. As duas
-- estavam íntegras só por terem sido carregadas depois do conserto, em carga
-- única — a próxima mudança de parsing as quebraria igual.
--
-- Nenhuma precisa de hash. O SOC já devolve identificador estável:
--   soc_exames_trabalhador → CODIGOSEQUENCIALRESULTADO
--     121.427 linhas, 121.427 valores distintos, nenhum vazio.
--   soc_funcionarios → empresa + CODIGO
--     21.355 linhas, 21.355 pares distintos.
-- Como os campos já estão gravados, a migração é um update e não exige
-- recarregar nada. As chaves antigas são hex de 32 caracteres com sufixo "#n"
-- e as novas são numéricas, então não há colisão durante a troca.

update soc_exames_trabalhador
   set fonte_id = seq_resultado
 where seq_resultado is not null and seq_resultado <> ''
   and fonte_id <> seq_resultado;

update soc_funcionarios
   set fonte_id = empresa_soc || '#' || cod_funcionario
 where cod_funcionario is not null and cod_funcionario <> ''
   and fonte_id <> empresa_soc || '#' || cod_funcionario;

notify pgrst, 'reload schema';
