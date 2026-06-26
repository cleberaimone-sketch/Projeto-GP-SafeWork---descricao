# Backlog técnico — V0 read-only do GP Command Center

> **Documento de backlog. Sem código, sem componentes reais, sem rota, sem banco.** Quebra a tela V0 em componentes, fontes, selos, read-models, estados, critérios de aceite, riscos e ordem de implementação.
> Base: `ARQUITETURA_GP_COMMAND_CENTER.md`, `DESENHO_TELA_V0_COMMAND_CENTER.md`, `DIAGNOSTICO_DADOS_LEGADOS_LEITURA_INTEGRAL.md`, `INCIDENTE_CONTA_AZUL_OAUTH_INVALID_GRANT_2026-06-26.md`.

---

## 1. Objetivo da V0
Tela executiva **somente leitura** que mostra o **status real** do grupo: dados disponíveis, bloqueios, incidentes e saúde dos dados — com **selo de confiabilidade** em cada número. Não decide nem executa nada.

## 2. Escopo da V0
**Inclui:** cabeçalho executivo · banner "dados em reconciliação" · sinais críticos · cards de Visão Geral · integrações · lista de incidentes · saúde dos dados.

**Fora de escopo:** financeiro consolidado completo · Golden Record · ações críticas · automações · cruzamento SOC × Conta Azul · edição de dados · sync manual.

## 3. Componentes propostos
Convenção: cada um descrito por **objetivo · props conceituais · fonte · estado normal · vazio · erro · aceite.**

### CommandCenterPage
- **Objetivo:** orquestra os blocos da V0.
- **Props:** `{ snapshot }` (dados agregados já lidos + metadados de fonte/data).
- **Fonte:** composição dos demais.
- **Normal:** renderiza todos os blocos. **Vazio:** mostra blocos com EmptyState. **Erro:** mostra ErrorState por bloco, sem derrubar a página.
- **Aceite:** carrega mesmo com qualquer fonte indisponível.

### ExecutiveHeader
- **Objetivo:** título, data/hora da leitura, ambiente (read-only), status geral.
- **Props:** `{ leituraEm, ambiente, statusGeral }`.
- **Fonte:** interno (derivado dos sinais). **Vazio/Erro:** status "Indeterminado".
- **Aceite:** sempre exibe ambiente `read-only` e a data da leitura.

### DataReconciliationBanner
- **Objetivo:** aviso fixo "dados em reconciliação — não usar para decisão financeira definitiva".
- **Props:** `{ visivel }`. **Fonte:** constante (enquanto não houver Golden Record).
- **Aceite:** sempre visível na V0.

### ReliabilityBadge
- **Objetivo:** selo REAL / ESTIMADO / INDISPONÍVEL / BLOQUEADO.
- **Props:** `{ nivel }`. **Aceite:** obrigatório em todo IndicatorCard.

### SignalBadge
- **Objetivo:** semáforo 🟢🟡🔴⛔ (+⚪/🔵).
- **Props:** `{ nivel }`. **Aceite:** cor + rótulo textual (acessibilidade).

### IndicatorCard
- **Objetivo:** card de indicador.
- **Props:** `{ titulo, valor, selo, fonte, atualizadoEm, explicacao, acao }`.
- **Normal:** valor + selo + fonte + data. **Vazio:** "—" + selo INDISPONÍVEL. **Erro:** ErrorState interno + selo INDISPONÍVEL.
- **Aceite:** nunca renderiza valor sem selo + fonte + data.

### CriticalSignalsPanel
- **Objetivo:** faixa de sinais críticos no topo.
- **Props:** `{ sinais[] }`. **Vazio:** "sem sinais críticos". **Aceite:** ordena por severidade (🔴/⛔ primeiro).

### IntegrationsStatusGrid
- **Objetivo:** grid/tabela de status das integrações.
- **Props:** `{ integracoes[] }`. **Fonte:** sync_log + config. **Vazio:** lista todas como INDISPONÍVEL.
- **Aceite:** cada integração com status + último sucesso/erro.

### IncidentCard
- **Objetivo:** card de incidente.
- **Props:** `{ titulo, severidade, fonte, impacto, proximoPasso, dono, status }`.
- **Aceite:** exibe severidade + próximo passo + dono.

### DataHealthTable
- **Objetivo:** tabela de saúde dos dados.
- **Props:** `{ verificacoes[] }`. **Aceite:** cada linha com métrica + severidade + observação.

### SourceTimestamp
- **Objetivo:** "última atualização" por fonte.
- **Props:** `{ fonte, atualizadoEm }`. **Vazio:** "sem leitura". **Aceite:** formato local pt-BR.

### RecommendedAction
- **Objetivo:** texto de próximo passo (não executa nada).
- **Props:** `{ texto }`. **Aceite:** nunca vira botão de ação crítica.

### EmptyState / ErrorState / BlockedState
- **Objetivo:** estados padronizados (sem dado / erro de leitura / bloqueado por incidente).
- **Props:** `{ titulo, detalhe }`. **Aceite:** mensagem clara + selo correspondente; nunca quebra o layout.

## 4. Indicadores da Visão Geral
| Indicador | Valor inicial | Selo | Fonte | Data/freq. | Query/read-model | Fallback | Risco |
|---|---|---|---|---|---|---|---|
| Empresas SOC | 2.423 | REAL | SOC read-only | sob demanda (lento) | contagem máscara 215358 | cache do diagnóstico | latência/timeout SOC |
| Empresas SOC c/ CNPJ | 2.179 | REAL | SOC | sob demanda | filtro CNPJ na 215358 | cache | — |
| Empresas c/ exames (30d) | 446 | REAL | SOC | diário | distinct empresa na 191865 | cache | janela 30d |
| Exames últimos 30 dias | 11.184 | REAL | SOC | diário | contagem 191865 | cache | volume |
| Funcionários ativos | amostra 46.338 | ESTIMADO | amostra SOC | sob demanda | varredura 192399 (custosa) | rótulo "amostra" | extrapolação errada |
| Receita do mês | — | BLOQUEADO | Conta Azul | — | (bloqueado p/ OAuth) | mostrar último sync | dado defasado |
| Saldo Pluggy | parcial | REAL parcial | Pluggy/`v_saldos_pluggy` | tempo real | `select v_saldos_pluggy` | "parcial (N contas)" | cobertura parcial |
| Golden Record | — | INDISPONÍVEL | — | — | (não existe) | "não criado" | confiança falsa |

## 5. Integrações
| Integração | Status | Selo | Fonte | Último sucesso | Último erro | Ação recomendada | Critério p/ mudar status |
|---|---|---|---|---|---|---|---|
| SOC | 🟢 OK | REAL | API read-only | leitura recente | — | — | erro de leitura → ATENÇÃO |
| Conta Azul | 🔴 CRÍTICO | REAL | sync_log | ~14/06 | invalid_grant 11/11 | reautorizar | sync sucesso → OK |
| Pluggy | 🟡 ATENÇÃO | REAL parcial | `v_saldos_pluggy` | conexão Safe+ | — | conectar demais | todas contas → OK |
| D4Sign | ⛔ PAUSADO | INDISPONÍVEL | — | — | — | inventariar | integração iniciada → ATENÇÃO |
| SigeCloud | ⛔ PAUSADO | INDISPONÍVEL | — | — | — | levantar acesso | dados lidos → ATENÇÃO |
| RD Station | ⛔ PAUSADO | INDISPONÍVEL | — | — | — | integrar CRM | dados lidos → ATENÇÃO |
| GP OS Hub | 🟡 ATENÇÃO | REAL parcial | eventos | `lead_criado` | — | publicar read-models | read-models ativos → OK |
| ERP Core | 🔵 FUNDAÇÃO | INDISPONÍVEL | — | — | — | construir | em produção → OK |
| SST Core | 🔵 FUNDAÇÃO | INDISPONÍVEL | — | — | — | construir | em produção → OK |
| CRM Core | 🔵 FUNDAÇÃO | INDISPONÍVEL | — | — | — | construir | em produção → OK |
| Client Portal | ⚪ INDISPONÍVEL | INDISPONÍVEL | — | — | — | definir fonte | dados disponíveis → ATENÇÃO |
| Produtos Digitais | ⚪ INDISPONÍVEL | INDISPONÍVEL | — | — | — | definir fonte | métricas disponíveis → ATENÇÃO |

## 6. Incidentes (backlog)
| Incidente | Severidade | Impacto | Fonte | Dono | Próximo passo | Status | Critério de resolução |
|---|---|---|---|---|---|---|---|
| Conta Azul OAuth invalid_grant | 🔴 CRÍTICO | Financeiro parado ~12d | sync_log | Cleber/Plata | reautorizar 1 empresa | Aberto | 1 empresa c/ sync sucesso + refresh OK |
| 1.3-B bloqueada | ⛔ BLOQUEADO | Sem CNPJ p/ cruzar | decisão | Cleber | aguardar OAuth | Aberto | OAuth restaurado + GO |
| Golden Record inexistente | 🟡 ATENÇÃO | Sem cliente consolidado | diagnóstico | — | reconciliar SOC×CA | Aberto | Golden Record v1 |
| Financeiro sem cliente_id | 🔴 CRÍTICO | Análise por cliente inviável | banco | — | vínculo na reconciliação | Aberto | % significativo vinculado |
| SOC NUMERO_VIDAS não confiável | 🟡 ATENÇÃO | Headcount inflado | SOC | Lari | usar contagem detalhada | Conhecido | headcount por 192399 |
| Empresas do grupo sem CNPJ (banco) | 🔴 CRÍTICO | Sem chave de cruzamento | banco | Cleber | preencher 8 CNPJs | Aberto | 8/8 com CNPJ |
| Tabela clientes vazia | 🔴 CRÍTICO | Sem cadastro mestre | banco | — | popular via reconciliação | Aberto | clientes > 0 validados |

## 7. Saúde dos Dados (verificações)
| Verificação | Como medir (conceitual) | Severidade atual |
|---|---|---|
| Empresas (grupo) sem CNPJ | contar `empresas` c/ cnpj nulo | 🔴 11/11 |
| Clientes inexistentes | `count(clientes)` | 🔴 0 |
| Financeiro sem cliente_id | `count(lancamentos where cliente_id null)` | 🔴 49.143 |
| Dados SOC sem staging | tabelas SOC locais vazias | 🟡 |
| Conta Azul sem OAuth válido | sync_log invalid_grant | 🔴 11/11 |
| Legados não integrados | D4Sign/SigeCloud/RD | ⚪ |
| Pluggy parcial | contas conectadas vs esperadas | 🟡 |
| Ausência de Golden Record | flag interna | 🟡 |
| Estimado vs real | razão de indicadores ESTIMADO | informativo |

## 8. Queries / read-models necessários
- **Já disponível (banco local, leitura direta):** `v_saldos_pluggy`, `sync_log` (status Conta Azul), `count(clientes)`, `count(lancamentos_financeiros where cliente_id is null)`, `empresas` (CNPJ nulo).
- **Disponível por leitura read-only (externo, lento):** contagens SOC (215358, 191865, 192399) — usar **cache/snapshot**, não em tempo real.
- **Bloqueado:** qualquer coisa do Conta Azul (receita, a receber/pagar, inadimplência) até OAuth voltar.
- **Futuro via Hub:** read-models de ERP/SST/CRM/Portal/Produtos Digitais.
> Nenhum SQL final escrito aqui — apenas descrição conceitual.

## 9. Estados vazios e de erro
| Situação | Comportamento |
|---|---|
| Fonte indisponível | EmptyState + selo INDISPONÍVEL |
| Dado bloqueado | BlockedState + selo BLOQUEADO + data do último dado |
| Incidente ativo | card de incidente em destaque |
| Erro de leitura | ErrorState no bloco (não derruba a página) |
| Token inválido | status integração CRÍTICO + incidente |
| Dado estimado | selo ESTIMADO + nota "amostra" |
| Dado não confiável | rótulo explícito (ex.: NUMERO_VIDAS) |
| Não implementado | selo INDISPONÍVEL + "fonte a definir" |

## 10. Critérios de aceite da V0
- Nenhum indicador **sem selo**.
- Nenhum indicador **sem fonte + data**.
- **Nenhum** dado financeiro mostrado como atual enquanto Conta Azul bloqueado.
- `NUMERO_VIDAS` **nunca** como headcount.
- **Sem** dados pessoais individualizados.
- **Todos** os incidentes críticos visíveis.
- **Todas** as ações críticas bloqueadas (somente leitura).
- A tela **funciona mesmo** com fontes indisponíveis (degradação graciosa).

## 11. Ordem de implementação futura
- **P0** — componentes **estáticos** com dados **agregados documentados** (snapshot deste diagnóstico).
- **P1** — leitura read-only do **banco local** para SOC (cache)/incidentes/saúde dos dados.
- **P2** — status de **integrações** (sync_log) e bloco de **saúde dos dados** dinâmico.
- **P3** — integração com **read-models do Hub**.
- **P4** — **sinais do Maestro** (recomendações).

## 12. Riscos
- **Confiança falsa** (mitigar: selos + banner).
- **Dado defasado** exibido como atual (mitigar: data por fonte + BLOQUEADO).
- **Vazamento de dado sensível** (mitigar: só agregados, sem CNPJ/CPF individual).
- **Automação indevida** (mitigar: V0 sem nenhuma ação).
- **Acoplamento direto com módulos** (mitigar: preferir snapshot/read-models, não chamar módulos ao vivo).
- **Dashboards bonitos sem fonte confiável** (mitigar: critério "sem selo/fonte → não exibe").
- **Misturar diagnóstico com produção** (mitigar: ambiente rotulado read-only/diagnóstico).

## 13. Próximos passos
Após validar este backlog, o próximo passo recomendado é **implementar um protótipo estático read-only (P0)** — componentes com os dados **agregados já documentados** (sem chamar nenhuma fonte ao vivo), para validar layout e selos. Alternativas: criar PR técnico com componentes sem dados reais; ou aguardar a reautorização do Conta Azul antes de qualquer leitura dinâmica de financeiro. **Recomendação: P0 estático primeiro** (não depende de nada ao vivo, risco mínimo).

---

### Confirmação
Somente documentação. **Nada operacional foi executado** — sem código, sem componente real, sem rota, sem banco, sem migration, sem API externa, sem token, sem sync, sem automação, sem dados pessoais.
