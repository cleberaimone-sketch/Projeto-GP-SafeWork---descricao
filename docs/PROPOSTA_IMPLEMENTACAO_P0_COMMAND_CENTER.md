# Proposta de implementação — P0 estático da tela V0 (GP Command Center)

> **Proposta. NÃO autoriza implementação.** Descreve como construir um primeiro protótipo **estático / read-only** da V0, com **dados agregados documentados** (snapshot), sem chamadas externas, sem banco dinâmico, sem automação.
> Base: `ARQUITETURA_GP_COMMAND_CENTER.md`, `DESENHO_TELA_V0_COMMAND_CENTER.md`, `BACKLOG_V0_COMMAND_CENTER.md`, `DIAGNOSTICO_DADOS_LEGADOS_LEITURA_INTEGRAL.md`, `INCIDENTE_CONTA_AZUL_OAUTH_INVALID_GRANT_2026-06-26.md`.

---

## 1. Objetivo do P0
Protótipo **visual estático** para validar **layout, componentes, selos, estados e narrativa executiva** antes de conectar qualquer dado real. Mostra a empresa com honestidade usando o **snapshot do diagnóstico** já documentado. Nenhuma fonte ao vivo.

## 2. Escopo autorizado do P0
**Inclui:** página estática read-only · dados agregados documentados (snapshot) · selos REAL/ESTIMADO/INDISPONÍVEL/BLOQUEADO · estados visuais · incidentes · saúde dos dados · **nenhuma ação crítica**.

**Fora de escopo:** dados dinâmicos · query em banco · APIs externas · sync · autenticação nova · permissões complexas · edição de dados · exportação · alertas automáticos.

## 3. Estrutura de arquivos sugerida (adaptada ao padrão real do projeto)
> Padrão do projeto: dashboards em `app/dashboard/<area>/` com componentes **PascalCase junto da página**; libs em `lib/<area>/`. A proposta segue esse padrão (não usa `components/` global).

```
web/
├── app/dashboard/command-center/
│   ├── page.tsx                      # server component estático (monta a tela a partir do snapshot)
│   ├── CommandCenterClient.tsx       # 'use client' — layout/interação leve (se necessário)
│   ├── ExecutiveHeader.tsx
│   ├── DataReconciliationBanner.tsx
│   ├── ReliabilityBadge.tsx
│   ├── SignalBadge.tsx
│   ├── IndicatorCard.tsx
│   ├── CriticalSignalsPanel.tsx
│   ├── IntegrationsStatusGrid.tsx
│   ├── IncidentCard.tsx
│   ├── DataHealthTable.tsx
│   ├── SourceTimestamp.tsx
│   └── RecommendedAction.tsx
└── lib/command-center/
    ├── types.ts                      # enums e interfaces (selo, status, indicador, incidente…)
    └── snapshot.ts                    # SNAPSHOT estático agregado (constantes documentadas)
```
- Rota sugerida: `/dashboard/command-center` (ao lado de `/dashboard/lui`, o war room).
- Componentes pequenos e sem estado (apenas apresentação); página server lê o snapshot estático.

## 4. Dados estáticos / snapshot
Constantes agregadas em `lib/command-center/snapshot.ts` (valores já documentados no diagnóstico):

| Chave | Valor | Selo |
|---|---|---|
| empresasSOC | 2.423 | REAL |
| empresasSOC_comCNPJ | 2.179 | REAL |
| empresasComExames30d | 446 | REAL |
| exames30d | 11.184 | REAL |
| funcionariosAtivos | amostra 46.338 | ESTIMADO |
| receitaMes | — | BLOQUEADO |
| saldoPluggy | parcial (1 conta) | REAL parcial |
| goldenRecord | — | INDISPONÍVEL |
| contaAzulOAuth | 11/11 invalid_grant | — (incidente) |
| contaAzulUltimoSync | ~14/06/2026 | — |
| pluggyContas | 1 (parcial) | REAL parcial |

Cada entrada do snapshot carrega: `valor, selo, fonte, atualizadoEm, explicacao, acao`.
**Proibido no snapshot:** CPF, CNPJ individual, e-mail, telefone, payload bruto ou qualquer dado sensível — **somente agregados**.

## 5. Componentes P0
| Componente | Responsabilidade | Props mínimas | Comportamento | Estado vazio | Aceite |
|---|---|---|---|---|---|
| **CommandCenterPage** | Monta a tela a partir do snapshot | — (lê snapshot) | Renderiza blocos na ordem | blocos com EmptyState | carrega sem nenhuma fonte ao vivo |
| **ExecutiveHeader** | Título, data leitura, ambiente, status geral | `leituraEm, ambiente, statusGeral` | Mostra read-only + status | status "Indeterminado" | sempre exibe `read-only` |
| **DataReconciliationBanner** | Aviso fixo | `visivel` | Banner topo | — | sempre visível |
| **ReliabilityBadge** | Selo de confiabilidade | `nivel` | Badge colorido + texto | — | obrigatório em todo card |
| **SignalBadge** | Semáforo | `nivel` | Cor + rótulo textual | — | acessível (cor+texto) |
| **IndicatorCard** | Card de indicador | `titulo, valor, selo, fonte, atualizadoEm, explicacao, acao` | Exibe tudo | "—" + INDISPONÍVEL | nunca valor sem selo+fonte+data |
| **CriticalSignalsPanel** | Faixa de sinais | `sinais[]` | Ordena por severidade | "sem sinais críticos" | 🔴/⛔ primeiro |
| **IntegrationsStatusGrid** | Grid de integrações | `integracoes[]` | Status colorido | todas INDISPONÍVEL | cada uma com status |
| **IncidentCard** | Card de incidente | `titulo, severidade, fonte, impacto, proximoPasso, dono, status` | Exibe incidente | — | severidade + próximo passo visíveis |
| **DataHealthTable** | Tabela saúde dos dados | `verificacoes[]` | Linhas métrica/severidade | "sem verificações" | cada linha com severidade |
| **SourceTimestamp** | Última atualização por fonte | `fonte, atualizadoEm` | Data pt-BR | "sem leitura" | formato local |
| **RecommendedAction** | Texto de próximo passo | `texto` | Apenas texto | — | nunca vira botão de ação crítica |
| **BlockedState** | Estado bloqueado | `titulo, detalhe` | Mensagem + selo BLOQUEADO | — | não quebra layout |

## 6. Selos e estados visuais
**Selo de confiabilidade (enum conceitual):** `REAL` · `ESTIMADO` · `INDISPONIVEL` · `BLOQUEADO`.
**Status (integrações/sinais):** `OK` · `ATENCAO` · `CRITICO` · `PAUSADO` · `BLOQUEADO` · `FUNDACAO`.
Cores: 🟢 OK · 🟡 Atenção · 🔴 Crítico · ⚪ Indisponível/Pausado · ⛔ Bloqueado · 🔵 Fundação. Sempre **cor + rótulo textual** (acessibilidade).

## 7. Layout P0 (ordem da tela)
1. **ExecutiveHeader**
2. **DataReconciliationBanner** ("dados em reconciliação")
3. **Status geral** (derivado: hoje 🔴 Crítico)
4. **CriticalSignalsPanel**
5. **Grid Visão Geral** (IndicatorCards)
6. **IntegrationsStatusGrid**
7. **Lista de Incidentes** (IncidentCards)
8. **DataHealthTable**

## 8. Critérios de aceite do P0
- Nenhum indicador **sem selo**.
- Nenhum indicador **sem fonte**.
- Nenhum indicador **sem data/estado**.
- Financeiro **não aparece como atual** (selo BLOQUEADO + data do último sync).
- Conta Azul aparece como **bloqueado/crítico**.
- `NUMERO_VIDAS` **não** aparece como headcount.
- **Sem** dado pessoal individualizado.
- **Nenhuma** ação crítica clicável.
- Tela deixa claro que é **read-only**.
- Dados estáticos **centralizados** em `snapshot.ts`.
- Componentes **preparados para troca futura** por dados dinâmicos (mesma interface).

## 9. Testes / checks futuros
- **Typecheck** (`tsc --noEmit`) e **lint**.
- Teste simples de **renderização** (se houver stack de teste; o projeto valida via build).
- **Check anti-sensível:** garantir que `snapshot.ts` não contém CPF/CNPJ individual/e-mail/telefone (grep no CI ou revisão).
- **Check de completude:** todo IndicatorCard com `selo` + `fonte` + `atualizadoEm`.

## 10. Riscos e mitigações
| Risco | Mitigação |
|---|---|
| Snapshot ficar obsoleto | `atualizadoEm` por item + banner + nota "snapshot do diagnóstico" |
| Entender dado estático como ao vivo | DataReconciliationBanner fixo + SourceTimestamp |
| Dashboard bonito gerar confiança falsa | enum de selo obrigatório + bloco Saúde dos Dados |
| Componente nascer acoplado à fonte errada | dados só via `snapshot.ts` (uma fonte única, trocável) |
| Futuro dado dinâmico furar selo/fonte | tipos exigem `selo`+`fonte` na interface do indicador |

## 11. Ordem de implementação futura
- **A.** Criar `lib/command-center/types.ts` (enums/interfaces) e `snapshot.ts` (constantes agregadas).
- **B.** Criar badges (`ReliabilityBadge`, `SignalBadge`).
- **C.** Criar cards (`IndicatorCard`, `IncidentCard`, `DataHealthTable`).
- **D.** Montar `page.tsx` (+ `CommandCenterClient` se necessário) na ordem do layout.
- **E.** Adicionar blocos de Incidentes e Saúde dos Dados.
- **F.** Rodar **lint/typecheck**.
- **G.** Abrir **PR técnico** (sem dados reais; só snapshot).
- **H.** **Não** fazer deploy/merge sem aprovação do Cleber.

## 12. Confirmação de limites
**Esta proposta NÃO autoriza implementação.** A implementação do P0 só deve começar após **nova autorização explícita do Cleber**. Enquanto isso, permanece tudo no plano.

---

### Confirmação
Somente documentação. **Nada operacional foi executado** — sem código, sem rota, sem componente real, sem banco, sem migration, sem API externa, sem token, sem sync, sem automação, sem dados pessoais. Conferência de estrutura feita apenas por **leitura** do diretório do projeto.
