---
name: financeiro-regras
description: Regras de negócio para limpar e interpretar dados financeiros do Conta Azul — contas bancárias ativas, transferências internas, Conta Modelo (reparcelamentos), Conta Atrasada. Use sempre que calcular receita, despesa, EBITDA, fluxo de caixa, saldo bancário ou qualquer KPI financeiro. Use ao criar dashboard, KPI, alerta ou agente que toca em finanças.
---

# Skill: Regras Financeiras GP SafeWork

## Quando usar
- Implementar qualquer cálculo de receita/despesa/EBITDA/lucro
- Mostrar saldo bancário ou fluxo de caixa
- Criar novo dashboard ou KPI financeiro
- Programar alerta sobre finanças
- Configurar agente Plata

## Why
Sem essas regras, **todo número está errado**. O Conta Azul mistura:
- Contas bancárias fechadas com saldo errado
- Transferências entre empresas (não é receita/despesa real)
- "Conta Modelo" fictícia usada para registrar baixa de parcelamentos
- Lançamentos duplicados via "Conta Atrasada"

## Helpers prontos em `web/lib/financeiro/regras.ts`

```typescript
import {
  carregarCategoriasExcluidas,  // async, com cache 5min
  isTransferenciaInterna,
  isContaModelo,
  isContaAtrasada,
  filtrarParaDRE,        // exclui transferência + conta atrasada
  filtrarParaFluxoCaixa, // exclui transferência + conta modelo
} from '@/lib/financeiro/regras'
```

Padrão de uso:
```typescript
const excluidas = await carregarCategoriasExcluidas(sb)
const dre  = filtrarParaDRE(lancamentos, excluidas)         // para DRE/Receita/Despesa
const caixa = filtrarParaFluxoCaixa(lancamentos, excluidas) // para Fluxo de Caixa
```

## Regra 1 — Contas bancárias ATIVAS

Tabela `contas_bancarias_ativas` define quais contas são reais.
View `v_saldos_ativos` faz join com `saldos_bancarios` (sync Conta Azul) por:
1. Número de conta exato (`numero_cc` ignorando hífens)
2. Match em `padroes_match` (array de strings ILIKE)

**Total: 17 contas ativas** (2 por empresa, exceto SW Meio Ambiente que só tem 1).

Para listar saldos: `sb.from('v_saldos_ativos').select('*')` — NUNCA usar `saldos_bancarios` direto.

## Regra 2 — Transferências internas (EXCLUIR)

Tabela `categorias_excluidas` tem 3 variantes:
- `Transferência entre contas do grupo`
- `9.00 TRANSFERÊNCIA ENTRE CONTAS DO GRUPO`
- `Transferencia entre contas do grupo` (sem acento)

São movimentação entre empresas do grupo, não são receita/despesa real.
Função `isTransferenciaInterna()` normaliza acentos + caixa pra casar variações futuras.

## Regra 3 — Conta Modelo (fictícia para reparcelamentos)

Fluxo:
1. Despesa original cai numa conta real
2. Cleber "transfere" para Conta Modelo para dar baixa (fictícia)
3. Cria novo lançamento na "conta atrasada" com nova data negociada

Regras:
| Aspecto | Lançamento na Conta Modelo | Lançamento na Conta Atrasada |
|---|---|---|
| Saldo da conta | IGNORAR (não é dinheiro) | IGNORAR (não é dinheiro) |
| DRE/Despesa | ✅ CONTA (despesa do mês original) | ❌ NÃO conta (duplicaria) |
| Fluxo de Caixa | ❌ NÃO conta (não é saída real) | ✅ CONTA (vai sair de verdade) |

Estado atual: `filtrarParaFluxoCaixa()` e `filtrarParaDRE()` ainda **não** filtram por nome do banco
porque o sync atual não traz o nome da conta no lançamento. Quando o sync for enriquecido, essas
funções já estão prontas para usar `isContaModelo()` e `isContaAtrasada()`.

## KPIs aprovados pelo Cleber (Cockpit do CFO)

Linha 1 (resultado do mês):
1. **Receita do mês** (com delta MoM)
2. **Despesa do mês** (com delta MoM)
3. **Lucro do mês** = Receita − Despesa (com delta)
4. **Margem do mês** = Lucro ÷ Receita (% com semáforo)

Linha 2 (riscos e dívidas):
5. **Contas Atrasadas** (a pagar + a receber, com qtd e dias)
6. **Empréstimos** (a pagar + a receber + pago no mês)

## ❌ KPIs REJEITADOS — não recolocar

- **Caixa Líquido (positivo - dívida em cheque especial)** — saldos negativos NÃO são cheque especial
- **Cobertura de Folha** — Cleber prefere margem operacional
- **Custo do Cheque Especial** — grupo NÃO usa CE, deixa de pagar outras contas
- **Burn rate / Runway** — métricas de startup, não acionáveis aqui

## ⚠️ Interpretação CRÍTICA — saldos bancários negativos

**NÃO são cheque especial nem dívida ativa com banco.**
Significam: contas/boletos vencidos pendentes (especialmente em contas digitais Iugu/IP do Conta Azul).
Reflete o mesmo problema que aparece em "Contas Atrasadas A Pagar".

Não somar como custo financeiro. Não estimar juros.

## Categorias de empréstimo (regex)

Detecção em `categoria` (case-insensitive):
| Tipo | Regex |
|---|---|
| Sócios | `/empr[eé]stimo.*s[oó]cio/` ou `/s[oó]cio.*empr[eé]stimo/` |
| Bancos | `/empr[eé]stimo.*banco/` |
| Terceiros | `/empr[eé]stimo.*terceiro/` |
| Mútuo entre Contas | `/m[uú]tuo\s+entre\s+contas/` |
| Parcelamento | `/parcelamento/` |
| Juros Parcelamento | `/juros\s+sobre\s+parcelamento/` |
| Outros | `/empr[eé]stimo/` (catch-all) |
