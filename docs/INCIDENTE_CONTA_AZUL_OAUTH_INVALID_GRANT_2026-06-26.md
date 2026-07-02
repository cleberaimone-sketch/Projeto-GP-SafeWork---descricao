# Incidente — Conta Azul OAuth `invalid_grant` (2026-06-26)

> Relatório de incidente de integração financeira. **Diagnóstico/controle apenas — nada operacional novo foi executado.** Sem secrets, sem refresh_tokens, sem dados sensíveis.

## Resumo do incidente
A autenticação OAuth do Conta Azul (refresh_token flow, Cognito `auth.contaazul.com`) está falhando com **HTTP 400 `invalid_grant`** para **todas as empresas** do grupo. Consequência: o **sync financeiro do Conta Azul está parado** e qualquer leitura da API (incluindo a Subfase 1.3-B / `/v1/pessoas`) está bloqueada **antes** de chegar aos endpoints de dados.

## Empresas afetadas
**11 de 11** (sem expor tokens): GP SafeWork, SafeWork Medianeira, SafeWork Foz do Iguaçu, SafeWork Santa Helena, SafeWork Londrina, Safe+, SafeT, SafeR&S, SafeHelp, SafeWork Meio Ambiente, SafeSolucoes.

## Último sync bem-sucedido conhecido
- SafeWork Santa Helena — **2026-06-14 12:01** (mais recente do grupo).
- SafeT e SafeWork Foz — 2026-06-13 12:01.
- Desde **~14/06** não há registro de sync `sucesso`. ⇒ ~12 dias sem sincronização financeira.

## Horários dos erros `invalid_grant` (sync_log)
- Cron de **2026-06-26 20:01–20:02** — `invalid_grant` nas 11 empresas.
- Cron de **2026-06-26 16:01** — `invalid_grant` (ex.: SafeR&S) — mesmo padrão.
- Padrão consistente: todo disparo do cron desde a parada falha no refresh.

## Impacto operacional
- **Financeiro desatualizado** no dashboard: receitas/despesas/saldos do Conta Azul congelados desde ~14/06.
- KPIs do Cockpit, DRE, fluxo de caixa e Mapa de Empresas refletem dados defasados na parte que depende do Conta Azul.
- **Bloqueia a Subfase 1.3-B** (leitura de pessoas/CNPJ) — sem autenticação não há leitura.
- Saldos via **Pluggy (Open Finance)** não são afetados por este incidente (fonte independente).

## O que foi testado (descoberta mínima 1.3-B)
- Tentativa 1 — empresa `SafeSolucoes` (1ª da tabela): **400 invalid_grant** no refresh.
- Tentativa 2 — empresa `SafeWork Santa Helena` (sync sucesso mais recente): **400 invalid_grant** no refresh.
- Ambas via `ContaAzulClient` server-side (sem curl/token manual), 1 empresa por vez.

## O que NÃO foi testado
- O endpoint **`/v1/pessoas/{id}` não foi alcançado** em nenhuma tentativa (falha no OAuth, antes).
- Não se testou listagem de pessoas, nem múltiplos IDs, nem múltiplas empresas além das 2 acima.

## Confirmações de segurança
- **`/v1/pessoas` não foi alcançado.**
- **Não houve rotação** de refresh_token (Cognito rejeitou antes de emitir novo).
- **Não houve persistência** (callback só dispara em refresh bem-sucedido).
- **Não houve escrita** em banco. Sem sync amplo, sem staging, sem cruzamento SOC, sem Golden Record.
- As tentativas produziram **exatamente o mesmo `invalid_grant`** que o cron de produção — ou seja, **o estado já estava quebrado**; nada foi degradado pela investigação.

## Hipótese provável
**Refresh_tokens inválidos/expirados/revogados** para todas as empresas. Causas plausíveis:
- Expiração por inatividade/política do Cognito do Conta Azul.
- Rotação concorrente perdida (dois processos usando o mesmo refresh_token; um rotaciona e invalida o outro sem persistir o novo).
- Revogação no lado Conta Azul (mudança de credencial de app, app desautorizado).
- Defasagem do `refresh_token` salvo em `conta_azul_tokens` vs. o último válido.

## Plano de recuperação
1. **Reautorizar** o Conta Azul pelo fluxo oficial em `/dashboard/financeiro/sync` (OAuth `authorize` → `callback`).
2. Começar por **1 empresa**.
3. Confirmar o **callback OAuth** (retorno com sucesso).
4. Confirmar **novo refresh_token persistido** em `conta_azul_tokens` (`atualizado_em` recente).
5. Rodar um **sync mínimo normal** dessa empresa e confirmar `sucesso` no `sync_log`.
6. Validar que o **próximo refresh não retorna `invalid_grant`**.
7. Só então repetir a **descoberta mínima da 1.3-B** (1 ID, 1 GET) com token fresco.

## Checklist de reautorização por empresa
- [ ] Acessar `/dashboard/financeiro/sync`.
- [ ] Iniciar OAuth da empresa (authorize).
- [ ] Concluir login/consentimento no Conta Azul.
- [ ] Callback retorna sucesso.
- [ ] `conta_azul_tokens.refresh_token` atualizado (`atualizado_em` novo).
- [ ] Sync mínimo da empresa → `sync_log` com `status=sucesso`.
- [ ] Novo refresh subsequente **sem** `invalid_grant`.

## Critérios para considerar uma empresa recuperada
- Refresh_token novo persistido.
- Pelo menos 1 sync `sucesso` após a reautorização.
- Um segundo refresh (sync seguinte) **sem** `invalid_grant`.

## Critério para retomar a Subfase 1.3-B
- ≥ 1 empresa com OAuth reautorizado e sync normal bem-sucedido.
- Refresh_token novo persistido; sem `invalid_grant`.
- Working tree limpo.
- **Autorização explícita do Cleber.**

## Anexo — método preservado (NÃO commitado)
Durante a tentativa, foi adicionado ao `web/lib/conta-azul/client.ts` o método mínimo abaixo. Ele **não foi validado** (o OAuth falhou antes) e o working tree será **revertido** para ficar limpo. Trecho preservado aqui para reuso quando a 1.3-B for retomada:

```ts
// Detalhe de pessoa (cliente/fornecedor) por ID — API Pessoas v1.
// Path no plural conforme doc oficial; usado para obter CNPJ p/ reconciliação.
getPessoa(id: string) {
  return apiGet<Record<string, unknown>>(this.creds, `/v1/pessoas/${id}`)
}
```
(Inserir dentro da classe `ContaAzulClient`, após `getSaldoConta`.)
