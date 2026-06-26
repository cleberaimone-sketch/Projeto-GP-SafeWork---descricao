# Subfase 1.3-B — Detalhe read-only de pessoa (Conta Azul) para obter CNPJ

> **Desenho técnico. NADA EXECUTADO.** Nenhuma chamada à API, nenhuma tabela criada, nenhuma migration, nenhum sync, nenhum token tocado.
> Objetivo: obter o **CNPJ** (e contato) dos clientes do Conta Azul de forma read-only e segura, para habilitar o cruzamento confiável **SOC × Conta Azul por CNPJ**.
>
> Decisão aprovada: **1.3-B é o caminho alvo** (CNPJ obrigatório). 1.3-A (código CA + razão social) fica como apoio, **não** para match automático de alta confiança.

---

## Contexto (do código atual, já lido)
- `web/lib/conta-azul/client.ts`: `ContaAzulClient` sobre `api-v2.contaazul.com`.
- Helpers internos: `apiGet<T>(creds, path, params)` e `fetchAllPages<T>(creds, path, params)` (paginação `pagina`/`tamanho_pagina=100`).
- Auth: `ContaAzulCredentials { empresaNome, refreshToken, ... }`; refresh via Cognito com **persistência** do token rotacionado (`onTokenRefreshed` → `conta_azul_tokens`).
- Hoje o client tem `getContasReceber/Pagar`, `getContasBancarias`, `getSaldoConta` — **não** tem método de pessoa/cliente.

---

## 1. Endpoint/método previsto
- **API:** recurso de pessoas/clientes da Conta Azul (API de Pessoas v1, recurso no **plural** `GET /v1/pessoas` para listagem paginada e `GET /v1/pessoas/{id}` para detalhe). **Path exato a confirmar na documentação oficial da Conta Azul antes de qualquer implementação ou chamada real** (não foi chamado).
- **Novo método no client** (a implementar na execução, não agora):
  - `getPessoas()` → `fetchAllPages<ContaAzulPessoa>(creds, '/v1/pessoas', { ... })` (listagem com CNPJ embutido, se o recurso retornar).
  - `getPessoa(id)` → `apiGet<ContaAzulPessoa>(creds, '/v1/pessoas/${id}')` (detalhe, fallback quando a listagem não trouxer documento).
- Estratégia: preferir **listagem paginada** (1 varredura) e usar **detalhe por id** só para preencher lacunas.

## 2. Como reaproveitar o ContaAzulClient seguro
- Instanciar `new ContaAzulClient(creds)` com `creds` montadas a partir de `conta_azul_tokens` (uma por empresa).
- Usar **exclusivamente** `apiGet`/`fetchAllPages` existentes — eles já injetam `Bearer`, renovam o access_token quando expira e **persistem** a rotação. Zero novo fluxo de auth.
- O método novo é só mais um `path` sobre a mesma mecânica já validada.

## 3. Como evitar curl/API manual
- Toda chamada via `ContaAzulClient` server-side (rotina/route dedicada). **Proibido** curl/Postman/script no OAuth ou na API.
- O hook `PreToolUse-guardrails.sh` já **bloqueia** curl em `auth.contaazul.com/oauth2/token`.

## 4. Como evitar refresh indevido
- `apiGet` só renova quando o access_token expira; **não** forçar refresh.
- **Uma execução por janela**, sem chamadas concorrentes ao refresh (evita corrida que rotaciona em duplicidade).
- Em `401`, deixar o client renovar **uma vez** e seguir; em falha persistente, abortar e logar (não retentar em loop).

## 5. Campos capturados
| Campo staging | Origem (pessoa CA) | Observação |
|---|---|---|
| `codigo_ca` | `id` | chave legada CA |
| `cnpj` (ou `cpf`) | `documento` | **chave alvo** do cruzamento |
| `tipo` | PJ/PF | define se é CNPJ ou CPF |
| `razao_social` | `nome`/`razao_social` | |
| `nome_fantasia` | `nome_fantasia` | se houver |
| `email` | `email` | dado pessoal → mascarar em relatório |
| `telefone` | `telefone` | dado pessoal → mascarar |
| `cidade` / `uf` | `endereco.*` | |
| `ativo` | `status`/`ativo` | se o recurso expuser |
| `coletado_em` | (carimbo) | controle |

## 6. Tabela staging proposta (a criar só na execução)
`stg_clientes_conta_azul` — **isolada de produção** (prefixo `stg_`):
- `codigo_ca text PRIMARY KEY`
- `cnpj text`, `cpf text`, `tipo text`
- `razao_social text`, `nome_fantasia text`
- `email text`, `telefone text`, `cidade text`, `uf text`, `ativo boolean`
- `coletado_em timestamptz default now()`
- (opcional) `raw jsonb` para auditoria
- **Não** referenciar/alterar `clientes`, `lancamentos_financeiros` nem qualquer tabela de produção.

## 7. Idempotência
- `UPSERT` por `codigo_ca` (reexecução não duplica).
- Comparar `coletado_em` para reprocessar só o que mudou; opcionalmente hash do `raw`.

## 8. Logs
- `sync_log` com `fonte = 'conta_azul_pessoa'`: início/fim, empresa, páginas lidas, qtd pessoas, qtd com CNPJ, erros. **Sem dados pessoais** no log.

## 9. Mascaramento
- Em qualquer relatório: CNPJ/CPF/e-mail/telefone **mascarados**; só contagens e amostras anonimizadas.
- Staging com acesso restrito (service_role), nunca exposto em UI pública.

## 10. Limites / rate limit
- Paginação `tamanho_pagina=100` (padrão do client).
- Respeitar rate limit da api-v2: **throttle** entre páginas (ex.: ~200–300ms) e **backoff** em `429`.
- Processar **uma empresa por vez** (serial), não todas em paralelo.

## 11. Rollback
- Tudo em staging → rollback = `TRUNCATE`/`DROP` de `stg_clientes_conta_azul`.
- **Zero** impacto em produção, no Conta Azul ou no financeiro existente. Nenhuma escrita fora do staging.

## 12. Critérios go/no-go
- ✅ Path do recurso de pessoa **confirmado** na doc oficial da api-v2.
- ✅ `conta_azul_tokens` com token válido para a(s) empresa(s) alvo.
- ✅ Tabela `stg_*` criada e isolada; rota/rotina **sem** escrita em produção.
- ✅ Teste de **amostra mínima** aprovado (item 13).
- ✅ Autorização explícita do Cleber para executar.
- ❌ No-go se: path não confirmado, token inválido, ausência de staging, ou qualquer caminho que escreva em produção.

## 13. Amostra mínima permitida para teste futuro
- **1 empresa**, **1 página** (≤100 pessoas) — OU `getPessoa(id)` para **1 id conhecido**.
- Objetivos do teste: validar (a) que o recurso retorna **documento/CNPJ**, (b) mapeamento de campos, (c) que o token **renova e persiste** sem queimar. Sem varrer toda a base.

## 14. Confirmação
**Nenhuma chamada real foi feita.** Este documento é apenas desenho técnico: nenhuma API chamada, nenhuma tabela criada, nenhuma migration rodada, nenhum sync, nenhum token tocado, nenhum secret exposto.
