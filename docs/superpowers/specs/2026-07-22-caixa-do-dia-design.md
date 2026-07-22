# Painel "Caixa do Dia" — design

**Data:** 2026-07-22
**Rota:** `/dashboard/financeiro/caixa`
**Status:** desenho aprovado, pronto para plano de implementação

## Problema

O time financeiro (e a agente Plata) precisa decidir todo dia **o que pagar e o que não pagar**. Hoje a informação existe, mas está espalhada e passiva: a tela `fluxo-caixa` mostra Previsto×Realizado, forecast de 13 semanas, saldo por banco e pendentes de 90 dias — nenhuma delas responde a pergunta operacional.

Escala real do problema (medido em 22/07/2026):

- **17 contas bancárias ativas · saldo consolidado R$ −229.969** (o grupo está negativo)
- **1.248 contas a pagar** em aberto (pendente/vencido)
- **1.463 contas a receber** em aberto
- 8–11 empresas, cada uma com conta própria

A pergunta que a tela precisa responder em segundos: **o que vence, quanto tenho, quanto falta, quem pago primeiro.**

## Decisões tomadas no brainstorming

| Questão | Decisão |
|---|---|
| A tela registra a decisão? | **Sim** — marcar no painel **e** gerar lista de pagamento |
| Unidade de caixa | **Misto** — cada empresa paga do próprio saldo; a matriz (GP) socorre quem não fecha |
| Ritmo de trabalho | **Diário** — abre em hoje + 7 dias, vencidos em destaque |
| Prioridade | **Pessoas são intocáveis**; o resto é negociável; **ajustável manualmente** |

## Regra de prioridade

**Intocável (nunca adiar):** folha CLT, PJ / honorários profissionais, estagiários, pró-labore, benefícios e FGTS. São pessoas que dependem do pagamento. A tela marca em vermelho e avisa se o usuário tentar adiar.

**Negociável:** todo o resto — impostos, aluguel, energia, empréstimos, parcelamentos, fornecedores, serviços. Ordenados por vencimento (o mais vencido na frente).

**Ajuste manual em dois níveis:**

1. **Por categoria** (regra permanente) — painel lateral *"Ajustar prioridades"*, aberto por botão **dentro da própria tela de Caixa** (não é rota nova). Lista as categorias do plano de contas com um toggle "intocável". Vem semeada com as categorias de pessoal; o usuário ajusta e vale dali em diante.
2. **Por conta** (exceção pontual) — na própria fila, um clique promove ou rebaixa aquele lançamento específico, sem alterar a regra da categoria.

Semente inicial de "intocável": categorias cujo nome casa com *mão de obra*, *honorários profissionais*, *estágio*, *pró-labore*, *salário*, *FGTS*, *benefícios*, *provisões com férias*, *rescisão*, *plano de saúde*. Cobre os grupos 3.0x (pessoal que entrega o serviço) e 4.01/4.03 (pessoal administrativo).

## Estrutura da tela

### 1. Faixa de topo — resposta consolidada
`HOJE + 7 DIAS · Vence R$ X · Tenho R$ Y · Falta R$ Z · ⚠ N empresas no vermelho`

### 2. Cartões por empresa
Um card por empresa: `saldo atual · vence no período · gap · aporte sugerido da matriz`. Ordenados por quem está pior. Quem fecha sozinha aparece em verde. É a materialização do modelo "empresa cobre, matriz socorre".

### 3. Fila de pagamento (núcleo)
**Somente despesas** (`tipo = 'despesa'`) abertas — as receitas aparecem no bloco 6, como contexto. Tabela ordenada por **intocável → vencimento**, com vencidos no topo.

Colunas: `[✓] · Vencimento (+ "há N dias") · Empresa · Fornecedor/descrição · Categoria · Valor · Prioridade`

- Marcar a linha **recalcula o topo na hora** (saldo depois de pagar o marcado)
- Ação *Adiar* por linha (bloqueada com aviso para intocáveis)
- Ação de promover/rebaixar prioridade daquela conta
- Filtros: empresa · só intocáveis · só vencidos · busca por fornecedor/categoria

### 4. Barra de ação
`Selecionados: N contas · R$ X · saldo após pagar: R$ Y` + **[Marcar como "vou pagar"]** **[Gerar lista]**

### 5. Lista de pagamento gerada
Agrupada por empresa/banco, com total por empresa. Export CSV + impressão.

### 6. Bloco "o que entra"
A receber no período (previsto), porque muda a decisão — "segura até quinta que entra R$ X".

### 7. Resumo na home do financeiro
Card compacto: `Caixa hoje: vence R$ X · tenho R$ Y · falta R$ Z →` com link para a tela.

## Modelo de dados

### Leitura
- `lancamentos_financeiros` — abertos (`status in ('pendente','vencido')`), despesa e receita
- `v_saldos_ativos` — saldo real por conta/empresa (Pluggy + Conta Azul)

**Paginação obrigatória.** São 1.248 + 1.463 registros e o client Supabase corta em 1000. Essa armadilha já quebrou DRE, orçamento, fluxo-caixa e conciliação neste projeto — toda leitura desta tela pagina por `id` até esgotar.

### Nova tabela: `decisoes_pagamento`
Guarda o **estado do usuário sobre um lançamento** — decisão e override de prioridade. Fica **fora** de `lancamentos_financeiros` porque aquela tabela é sobrescrita pelo sync do Conta Azul.

```sql
create table if not exists decisoes_pagamento (
  id uuid primary key default gen_random_uuid(),
  lancamento_id text not null unique,     -- id do lançamento (Conta Azul)
  decisao text,                            -- 'pagar' | 'adiar' | null
  data_prevista date,                      -- quando pretende pagar
  prioridade_override text,                -- 'intocavel' | 'normal' | null
  observacao text,
  decidido_por uuid,
  decidido_em timestamptz default now(),
  created_at timestamptz default now()
);
```

### Nova tabela: `categorias_prioridade`
Regra permanente por categoria (o ajuste manual nível 1).

```sql
create table if not exists categorias_prioridade (
  categoria text primary key,
  intocavel boolean not null default false,
  atualizado_em timestamptz default now()
);
```

Quando o lançamento vira `pago` no Conta Azul, ele sai da fila automaticamente — a tela só lista abertos. A decisão fica no histórico sem precisar de limpeza.

## Cálculos

- **Vence no período** = soma dos abertos (despesa) com `data_vencimento <= hoje+7d`, incluindo os já vencidos
- **Tenho** = saldo de `v_saldos_ativos` (por empresa e consolidado)
- **Falta** = `vence − tenho`, quando positivo
- **Aporte da matriz** = por empresa, o `falta` de cada uma que não fecha sozinha
- **Saldo após pagar** = `saldo − soma dos marcados` (projeção simples, sem considerar entradas não confirmadas)

## Limites explícitos (não enganar o usuário)

A marcação é **intenção, não pagamento**. O pagamento real acontece no banco/Conta Azul e o status volta pelo sync. A tela deixa isso visível: se marcar e não pagar, a conta continua aparecendo como aberta. Não há escrita de volta no Conta Azul.

## Fora de escopo (YAGNI)

- Escrever/baixar pagamento no Conta Azul pela tela
- Agendamento ou remessa bancária (CNAB/pix em lote)
- Aprovação em múltiplos níveis (workflow de alçada)
- Previsão estatística de recebimento (usa só o que está lançado)

## Riscos

| Risco | Mitigação |
|---|---|
| Cap de 1000 linhas truncar a fila | Paginação obrigatória em toda leitura |
| Decisão divergir da realidade (marcou e não pagou) | Aviso explícito na tela; a fila sempre reflete o status real do Conta Azul |
| Sync apagar a decisão | Tabela separada, chaveada por `lancamento_id` |
| Saldo desatualizado dar falsa segurança | Mostrar data/hora da última atualização do saldo ao lado do "Tenho" |
