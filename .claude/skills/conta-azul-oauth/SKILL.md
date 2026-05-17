---
name: conta-azul-oauth
description: Como integrar e sincronizar dados do Conta Azul via OAuth Cognito — fluxo de autorização, rotação de refresh_token, sync de lançamentos financeiros e contas bancárias. Use quando precisar disparar sync, depurar erros invalid_grant, criar nova consulta ou autorizar empresas no Conta Azul.
---

# Skill: Conta Azul OAuth + Sync

## Quando usar
- Disparar sync manual de uma ou várias empresas
- Depurar `invalid_grant` (token inválido)
- Adicionar nova empresa ao sync
- Mudar período de sincronização
- Implementar nova consulta na API v2

## Arquitetura
```
Cleber/UI ──► /api/conta-azul/authorize?empresa=X ──► Conta Azul (login)
                                                          │
                                                          ▼
                                          /api/conta-azul/callback
                                                          │
                                                          ▼
                                 INSERT conta_azul_tokens (refresh_token)

UI ──► /api/conta-azul/sync-manual { empresa_nome } ──► ContaAzulClient
                                                          │
                                                ┌─────────┴─────────┐
                                                ▼                   ▼
                                       Conta Azul API v2     UPDATE conta_azul_tokens
                                       (lança + saldos)      (refresh_token rotacionado)
                                                │
                                                ▼
                              UPSERT lancamentos_financeiros + saldos_bancarios
```

## ⚠️ Regra de OURO: refresh_token rotation

**NUNCA testar refresh_token via curl manualmente.**

Cognito do Conta Azul implementa **refresh rotation**: cada chamada `grant_type=refresh_token`
retorna access_token + um **NOVO refresh_token**, invalidando o anterior. Se eu testo manualmente
sem salvar o novo, queimo o token. Próxima sync real falha com `invalid_grant`.

✅ **Para verificar status**: ler `conta_azul_tokens.atualizado_em`, `sync_log`, contagens de
`lancamentos_financeiros` — tudo via banco, **sem tocar no Conta Azul**.

✅ **Para sincronizar de verdade**: chamar `/api/conta-azul/sync-manual` que persiste a rotação
via `setTokenRefreshCallback()`.

✅ **UI segura**: `/dashboard/financeiro/sync` mostra status sem queimar tokens.

❌ **Nunca** `curl -X POST https://auth.contaazul.com/oauth2/token` manual.

## Endpoints da API

- **OAuth**: `https://auth.contaazul.com/oauth2/token`
- **REST v2**: `https://api-v2.contaazul.com`

Caminhos usados:
- `GET /v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=&data_vencimento_ate=&pagina=&tamanho_pagina=`
- `GET /v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?...`
- `GET /v1/conta-financeira?apenas_ativo=true`
- `GET /v1/conta-financeira/{id}/saldo-atual`

Paginação: `tamanho_pagina=100`, iterar `pagina` até retornar < 100 itens.

## Empresas com token (verificável via `conta_azul_tokens`)

Atualmente: ~8 empresas autorizadas. SafeR&S e SafeHelp ainda não têm tokens
(serão integrados depois ou ficam manuais).

## Fluxo de autorização (quando precisa re-autorizar)

1. UI: `/api/conta-azul/authorize` (lista links HTML) ou
   `/api/conta-azul/authorize?empresa=NOME` (redireciona direto)
2. Cleber loga no Conta Azul com credenciais da empresa
3. Callback `/api/conta-azul/callback?code=&state=NOME` troca code por tokens
4. Salva em `conta_azul_tokens` (upsert por `empresa_nome`)

## Sync periodicamente

Como `sync-manual` foi criada para uso por UI autenticada, o cron tem rota separada
`/api/conta-azul/sync` que aceita header `x-cron-secret: ${CRON_SECRET}`.

## Mapeamento de status do Conta Azul

```typescript
const map: Record<string, string> = {
  ACQUITTED:       'pago',      // efetivamente pago
  PENDING:         'pendente',  // a vencer
  OVERDUE:         'vencido',   // venceu e não foi pago
  CANCELLED:       'cancelado',
  PARTIALLY_PAID:  'parcial',
}
```

## Categorias do plano de contas

O Conta Azul retorna `categorias: [{ nome }]`. Vão na coluna `categoria` da tabela
`lancamentos_financeiros`. Exemplos:
- `1.04.01 Treinamentos` (receita operacional principal)
- `4.01.02 Honorários Profissionais MEI/PJ – Administrativo` (despesa)
- `2.01.04 Simples Nacional – DAS` (imposto)
- `7.01.03 Empréstimos de Sócios` (empréstimo)
- `8.01.02 Parcelamento contas antigas` (parcelamento)
- `Transferência entre contas do grupo` (transferência interna — EXCLUIR de cálculos)

## Troubleshooting

| Erro | Causa | Solução |
|---|---|---|
| `invalid_grant` em todas empresas | Tokens queimados por teste manual | Re-autorizar via OAuth |
| Saldo retorna null | Conta inativa no Conta Azul | OK, view `v_saldos_ativos` filtra |
| Lançamentos não aparecem | Filtro de empresa errado | Conferir `empresa_id` no upsert |
| Sync demora > 60s | Empresa com 10k+ lançamentos | Esperado, paginação automática |
