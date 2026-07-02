# Desenho — Tela V0 (read-only) do GP Command Center

> **Documento de desenho visual. Sem código, sem implementação.** Define a primeira experiência da tela V0 do Command Center usando **apenas dados já disponíveis**, com **selo de confiabilidade em todos os indicadores**.
> Não depende de Golden Record, Conta Azul reautorizado ou integrações completas.

---

## 1. Objetivo da tela V0
Mostrar a empresa com **honestidade operacional**: o que sabemos de verdade (SOC, Pluggy, status de sync, incidentes), o que está estimado, o que está indisponível e o que está bloqueado. A V0 **não tenta parecer completa** — ela torna visível o estado real do dado. Serve para a diretoria enxergar a operação e os bloqueios **antes** da reconciliação e da reautorização do Conta Azul.

## 2. Princípio visual
**Todo** card/indicador exibe:
- **Título**
- **Valor**
- **Selo de confiabilidade:** `REAL` · `ESTIMADO` · `INDISPONÍVEL` · `BLOQUEADO`
- **Fonte** (ex.: SOC read-only, Pluggy, interno)
- **Data/hora da última atualização**
- **Explicação curta** (1 linha)
- **Ação recomendada / próximo passo**

Regra de ouro: **nenhum número sem selo + fonte + data.**

## 3. Layout geral
```
┌──────────────────────────────────────────────────────────┐
│ [CABEÇALHO EXECUTIVO]                                      │
├──────────────────────────────────────────────────────────┤
│ [LINHA DE STATUS GERAL]                                    │
├──────────────────────────────────────────────────────────┤
│ [BLOCO DE SINAIS CRÍTICOS]                                 │
├──────────────────────────────────────────────────────────┤
│ [VISÃO GERAL — grid de cards]                              │
├──────────────────────────────────────────────────────────┤
│ [INTEGRAÇÕES]                                              │
├──────────────────────────────────────────────────────────┤
│ [INCIDENTES]                                               │
├──────────────────────────────────────────────────────────┤
│ [SAÚDE DOS DADOS]                                          │
└──────────────────────────────────────────────────────────┘
```

## 4. Cabeçalho executivo
- **Título:** “GP Command Center”
- **Data/hora da leitura** (quando o painel foi carregado)
- **Ambiente:** `diagnóstico / read-only`
- **Aviso fixo:** “⚠️ Dados em reconciliação — não usar para decisão financeira definitiva”
- **Status geral:** **Atenção / Crítico** (calculado dos sinais; hoje = **Crítico**, por causa do Conta Azul)
- **Última atualização disponível** (por fonte; ex.: SOC hoje, Conta Azul ~14/06)

## 5. Bloco 1 — Visão Geral (cards)
| Card | Valor | Selo | Fonte | Ação/próximo passo |
|---|---|---|---|---|
| Empresas SOC | 2.423 | REAL | SOC read-only | base p/ reconciliação |
| Empresas SOC com CNPJ | 2.179 (~90%) | REAL | SOC | chave de cruzamento |
| Empresas c/ exames (30d) | 446 | REAL | SOC | indicador operacional |
| Exames últimos 30 dias | 11.184 | REAL | SOC | produção SST |
| Funcionários ativos | amostra 46.338 | ESTIMADO | amostra SOC | varredura completa pendente |
| Receita do mês | — | BLOQUEADO | Conta Azul (OAuth) | reautorizar Conta Azul |
| Saldo bancário Pluggy | parcial (1 conta) | REAL parcial | Pluggy | conectar demais contas |
| Clientes com Golden Record | — | INDISPONÍVEL | — | criar Golden Record |

## 6. Bloco 2 — Integrações (cards/tabela)
| Integração | Status | Detalhe |
|---|---|---|
| SOC | 🟢 OK | dados read-only disponíveis |
| Conta Azul | 🔴 CRÍTICO | 11/11 OAuth `invalid_grant` |
| Pluggy | 🟡 ATENÇÃO | 1 conta conectada |
| D4Sign | ⛔ PAUSADO | não integrado |
| SigeCloud | ⛔ PAUSADO | não inventariado |
| RD Station | ⛔ PAUSADO | não integrado |
| GP OS Hub | 🟡 ATENÇÃO | publica eventos; read-models pendentes |
| Client Portal | ⚪ INDISPONÍVEL | em construção |
| Produtos Digitais | ⚪ INDISPONÍVEL | fonte a definir |
| SST Core | 🔵 FUNDAÇÃO | em construção |
| ERP Core | 🔵 FUNDAÇÃO | em construção |

## 7. Bloco 3 — Incidentes
Campos por incidente: **título · severidade · fonte · impacto · próximo passo · dono sugerido · status**.

| Incidente | Severidade | Fonte | Impacto | Próximo passo | Dono | Status |
|---|---|---|---|---|---|---|
| Conta Azul OAuth `invalid_grant` | 🔴 CRÍTICO | sync_log | Financeiro parado ~12 dias | Reautorizar 1 empresa | Cleber/Plata | Aberto |
| 1.3-B (leitura pessoas) bloqueada | ⛔ BLOQUEADO | decisão | Sem CNPJ p/ cruzar | Aguarda OAuth | Cleber | Aberto |
| Golden Record inexistente | 🟡 ATENÇÃO | diagnóstico | Sem cliente consolidado | Reconciliar SOC×CA | — | Aberto |
| Financeiro sem `cliente_id` | 🔴 CRÍTICO | banco | Análise por cliente inviável | Vínculo na reconciliação | — | Aberto |
| SOC `NUMERO_VIDAS` não confiável | 🟡 ATENÇÃO | SOC | Headcount inflado | Usar contagem detalhada | Lari | Conhecido |

## 8. Bloco 4 — Saúde dos Dados (cards)
| Card | Valor | Selo/Severidade | Observação |
|---|---|---|---|
| Empresas do grupo sem CNPJ (banco local) | 11/11 | 🔴 CRÍTICO | corrigir cadastro das 8 operacionais |
| Tabela `clientes` vazia | 0 | 🔴 CRÍTICO | sem cadastro mestre |
| Lançamentos financeiros sem `cliente_id` | 49.143 | 🔴 CRÍTICO | 100% sem vínculo |
| Empresas SOC sem CNPJ | 244 | 🟡 ATENÇÃO | validação humana |
| Empresas SOC guarda-chuva | ~13 | 🟡 ATENÇÃO | `NUMERO_VIDAS` irreal |
| Conta Azul último sync | ~14/06 | 🔴 CRÍTICO | dado defasado |
| Dados D4Sign | — | ⚪ INDISPONÍVEL | não integrado |
| Dados SigeCloud | — | ⚪ INDISPONÍVEL | não inventariado |

## 9. Estados visuais
| Estado | Cor | Significado |
|---|---|---|
| OK | 🟢 Verde | regular |
| Atenção | 🟡 Amarelo | acompanhar |
| Crítico | 🔴 Vermelho | exige ação |
| Indisponível | ⚪ Cinza | sem dado/fonte |
| Bloqueado | ⛔ | suspenso por decisão/incidente formal |
| Fundação | 🔵 Azul | módulo em construção (informativo) |

## 10. Componentes sugeridos (sem implementar)
- **CardIndicador** — título, valor, selo, fonte, data, explicação, ação.
- **SeloConfiabilidade** — badge REAL/ESTIMADO/INDISPONÍVEL/BLOQUEADO.
- **CardIntegracao** — nome da fonte + status colorido + detalhe.
- **CardIncidente** — título, severidade, impacto, próximo passo, dono, status.
- **TabelaSaudeDados** — linhas com métrica + severidade.
- **LinhaTempoIncidentes** — histórico/ordem dos incidentes.
- **BannerAvisoDadosEmReconciliacao** — aviso fixo no topo.

## 11. Wireframe textual
```
┌─ GP COMMAND CENTER ───────────────  leitura: <data/hora>  ambiente: read-only ─┐
│ ⚠️ Dados em reconciliação — não usar para decisão financeira definitiva         │
│ STATUS GERAL: 🔴 CRÍTICO (Conta Azul parado)        última atualização: por fonte│
├────────────────────────────────────────────────────────────────────────────────┤
│ SINAIS CRÍTICOS:  🔴 Conta Azul OAuth 11/11   ⛔ 1.3-B bloqueada                  │
├────────────────────────────────────────────────────────────────────────────────┤
│ VISÃO GERAL                                                                       │
│ [Empresas SOC 2.423 REAL] [c/ CNPJ 2.179 REAL] [Exames 30d 11.184 REAL]          │
│ [Func. ativos ESTIMADO]   [Receita BLOQUEADO]  [Saldo Pluggy REAL parcial]       │
│ [Golden Record INDISPONÍVEL]                                                     │
├────────────────────────────────────────────────────────────────────────────────┤
│ INTEGRAÇÕES   SOC🟢  ContaAzul🔴  Pluggy🟡  D4Sign⛔  Sige⛔  RD⛔  Hub🟡          │
├────────────────────────────────────────────────────────────────────────────────┤
│ INCIDENTES    🔴 OAuth invalid_grant · ⛔ 1.3-B · 🔴 sem cliente_id · 🟡 GR         │
├────────────────────────────────────────────────────────────────────────────────┤
│ SAÚDE DOS DADOS  clientes:0 🔴 · lançtos s/ cliente:49.143 🔴 · SOC s/CNPJ:244 🟡 │
└────────────────────────────────────────────────────────────────────────────────┘
```

## 12. Regras anti-confiança falsa
- **Não** mostrar financeiro como atual enquanto o Conta Azul estiver bloqueado (usar selo BLOQUEADO + data do último sync).
- **Não** usar `NUMERO_VIDAS` como headcount.
- **Não** mostrar cliente consolidado sem Golden Record.
- **Não** cruzar SOC × Conta Azul por nome (só por CNPJ, no futuro).
- **Não** exibir dado sensível individualizado (CNPJ/CPF/contato).
- **Não** permitir nenhuma ação crítica na V0 (somente leitura).

## 13. Próximo passo
1. **Validar este desenho** com o Cleber.
2. Criar o **backlog técnico da V0** (componentes, fontes por card, selos).
3. **Só depois** implementar a tela read-only.
4. Manter **todos os indicadores com fonte + selo + data**.

---

### Confirmação
Somente documentação. **Nada operacional foi executado** — sem código, sem banco, sem migration, sem API externa, sem token, sem sync, sem automação, sem dados pessoais individualizados.
