# Arquitetura — GP Command Center

> **Documento de arquitetura e proposta visual (read-only).** Não contém implementação de código.
> Painel executivo do Grupo SafeWork: consolida visão, indicadores, alertas, sinais e status dos módulos.
> **O Command Center NÃO é dono de dado e NÃO executa ações operacionais críticas.**
>
> Versão 0.2 · Atualizado com dados reais de diagnóstico (SOC lido, incidente Conta Azul) · Sem dados sensíveis · Sem secrets

---

## Posicionamento

```
        ┌──────────────────────────────────────────────┐
        │            GP COMMAND CENTER                   │
        │   visão executiva · read-only · decisão humana │
        │   LUI · Plata · Lari · Dieguito                │
        └──────────────────────────────────────────────┘
                          ▲ lê (eventos / read-models / indicadores / sinais)
        ┌─────────────────┴──────────────────────────────┐
        │   GP Intelligence / Maestro (camada conceitual) │  interpreta · recomenda
        ├─────────────────────────────────────────────────┤
        │            GP OS Core / Hub (alvo)              │  barramento futuro
        └─────────────────▲──────────────────────────────┘
   ┌──────────┬───────────┼───────────┬──────────────┬─────────────┐
  ERP Core  SST Core   Sales IA/CRM  Client Portal  Produtos Dig.  Legados
                                          (Conta Azul, SOC, SigeCloud, D4Sign, RD Station, Pluggy)
```

O Command Center **mostra**; o **Maestro interpreta e recomenda**; o **humano decide** ações críticas.

---

## 1. Objetivo do Command Center
Dar à diretoria a **visão executiva** do grupo, em um só lugar:
- **Financeiro** (caixa, receita, a receber/pagar, inadimplência, margem)
- **Operação SST** (ASOs/exames, documentos, vencimentos, produção)
- **Comercial** (funil, propostas, conversão)
- **Clientes** (ativos, críticos, jornada)
- **Produtos Digitais** (uso, receita, status)
- **Integrações** (saúde de cada fonte)
- **Riscos** e **Sinais operacionais**
- **Saúde dos módulos e dos dados**

Responde a 3 perguntas: **Como estamos? · O que precisa de atenção? · O que decidir?**

## 2. O que ele PODE fazer
Visualizar · Consolidar · Priorizar · Alertar · Apontar gargalos · Mostrar tendência · Abrir pendência (de acompanhamento, no domínio do próprio Command Center) · Apoiar decisão · Mostrar **saúde dos dados**.

## 3. O que ele NÃO PODE fazer
❌ Alterar dado operacional crítico · ❌ Emitir cobrança · ❌ Liberar inadimplente · ❌ Assinar documento · ❌ Aprovar ASO · ❌ Alterar contrato · ❌ Alterar ficha clínica · ❌ Excluir dados · ❌ Executar automação crítica sem humano.

---

## 4. Primeira versão sugerida — V0/V1 (somente leitura)
Painel **read-only**, com **cards e tabelas**, **sem nenhuma escrita**. Cada número exibe um **selo de origem**: `REAL` · `ESTIMADO` · `INDISPONÍVEL` · `BLOQUEADO`.

Blocos/telas:
1. **Visão Geral** · 2. **Financeiro** · 3. **Operação SST** · 4. **Comercial** · 5. **Clientes Críticos** · 6. **Integrações** · 7. **Produtos Digitais** · 8. **Sinais e Alertas** · 9. **Saúde dos Dados** · 10. **Incidentes**

---

## 5. Indicadores iniciais por bloco
Selo conforme o estado **atual** das fontes.

### Visão Geral
| Indicador | Selo atual | Fonte |
|---|---|---|
| Receita do mês | BLOQUEADO (Conta Azul defasado desde ~14/06) | ERP/Conta Azul |
| Saldo bancário Pluggy | REAL (parcial — 1 conta conectada) | Pluggy |
| Contas a receber | BLOQUEADO | Conta Azul |
| Contas a pagar | BLOQUEADO | Conta Azul |
| Clientes ativos estimados | ESTIMADO (via SOC, sem Golden Record) | SOC |
| Exames últimos 30 dias | REAL (11.184) | SOC |
| Propostas em aberto | INDISPONÍVEL (CRM não integrado) | CRM |
| Alertas críticos | REAL (incidente Conta Azul) | interno |

### Financeiro
| Indicador | Selo | Observação |
|---|---|---|
| Lançamentos Conta Azul existentes | REAL (49.143) | **defasados** (sync parado) |
| Status do sync Conta Azul | REAL | **CRÍTICO** |
| Último sync bem-sucedido | REAL | ~14/06/2026 |
| Empresas com OAuth quebrado | REAL | **11/11** |
| Saldos Pluggy | REAL | parcial (1 conta) |
| Contas a receber/pagar | BLOQUEADO | depende do sync |
| Inadimplência | BLOQUEADO | depende do sync |
| Margem | BLOQUEADO/ESTIMADO | quando sync voltar |

### SST
| Indicador | Selo | Valor |
|---|---|---|
| Empresas SOC | REAL | 2.423 |
| Empresas SOC com CNPJ | REAL | 2.179 (~90%) |
| Empresas SOC sem CNPJ | REAL | 244 |
| Empresas com exames nos últimos 30 dias | REAL | 446 |
| Exames últimos 30 dias | REAL | 11.184 |
| Funcionários ativos detalhados | ESTIMADO (amostra) | 46.338 na amostra; total exige varredura |
| Unidades | ESTIMADO (amostra) | 2.279 na amostra |
| Inconsistências NUMERO_VIDAS | REAL | ~13 empresas guarda-chuva |

### Comercial / CRM
Leads · Oportunidades · Propostas · Contratos pendentes · Follow-ups atrasados · Agentes ativos · Status GP Sales IA → **INDISPONÍVEL** (RD Station/CRM não integrados; Hub já publica `lead_criado` — ponto de partida REAL).

### Client Portal
Clientes com acesso · Documentos publicados · Chamados · Pendências · Cobranças visualizadas · Uploads · Uso da IA → **INDISPONÍVEL** (portal em construção).

### Produtos Digitais
Produtos ativos / MVP / pausados · Receita estimada · Usuários · Conversões · Incidentes → **INDISPONÍVEL** (definir fonte).

### Integrações
| Fonte | Status atual |
|---|---|
| Conta Azul | **CRÍTICO** (OAuth invalid_grant 11/11) |
| SOC | **OK** (read-only validado) |
| Pluggy | **ATENÇÃO** (só 1 conta conectada) |
| D4Sign | **PAUSADO** (não integrado) |
| SigeCloud | **PAUSADO** (não inventariado) |
| RD Station | **PAUSADO** (não integrado) |
| Hub (GP OS Core) | **ATENÇÃO** (publica eventos; read-models pendentes) |

---

## 6. Sinais operacionais iniciais
Semáforo: 🟢 **Verde** (regular) · 🟡 **Amarelo** (atenção) · 🔴 **Vermelho** (exige ação) · ⛔ **Bloqueado** (operação suspensa por decisão formal).

| Sinal | Nível |
|---|---|
| Conta Azul OAuth quebrado em 11/11 empresas | 🔴 Vermelho |
| Subfase 1.3-B (leitura de pessoas) | ⛔ Bloqueado (NO-GO formal) |
| Cliente com exame recente e sem financeiro vinculado | 🟡→🔴 |
| Empresa SOC sem CNPJ | 🟡 Amarelo |
| Contrato assinado e sem faturamento | 🔴 Vermelho |
| ASO feito sem PDF publicado | 🟡 Amarelo |
| Cliente inadimplente tentando agendar | 🔴 Vermelho |
| Produto digital ativo sem métrica | 🟡 Amarelo |

Cada sinal deve carregar: origem, nível, entidade afetada e (quando houver) ação sugerida pelo Maestro — **executada por humano**.

---

## 7. Saúde dos dados
Bloco dedicado a deixar explícito **em que confiar**:
| Item | Estado atual |
|---|---|
| Clientes sem CNPJ | 244 no SOC (~10%) |
| Lançamentos financeiros sem `cliente_id` | **100%** (0 com vínculo) |
| Tabela `clientes` | **vazia** |
| SOC no banco local | **vazio** (só lido via API, não importado) |
| Legados não integrados | D4Sign, SigeCloud, RD Station |
| Tokens inválidos | Conta Azul 11/11 (`invalid_grant`) |
| Divergências SOC × financeiro × contratos | não reconciliadas (sem Golden Record) |
| Fontes desatualizadas | Conta Azul (~14/06) |

## 8. Relação com GP Intelligence / Maestro
- **Command Center** = mostra (painel).
- **Maestro** = interpreta, cruza, gera sinais e **recomenda**.
- **Humano** = decide e executa ações críticas.
O painel **não calcula** a inteligência nem executa recomendação — só exibe.

## 9. Dados e fontes atuais
| Categoria | Itens |
|---|---|
| **Reais já lidos** | SOC (2.423 empresas, 11.184 exames/30d), lançamentos Conta Azul (49.143, defasados), Pluggy (1 conta), eventos Hub (`lead_criado`) |
| **Ainda ausentes** | clientes (Conta Azul), CRM/RD Station, Client Portal, Produtos Digitais, D4Sign, SigeCloud |
| **Confiáveis** | SOC (CNPJ ~90%, CPF), Pluggy (saldo conectado) |
| **Não confiáveis** | `NUMERO_VIDAS` do SOC; financeiro sem `cliente_id` para análise por cliente |
| **Bloqueados por incidente** | tudo que depende do Conta Azul (receita, a receber/pagar, inadimplência) |

## 10. Roadmap
- **P0 — Documentação e arquitetura:** este doc, blocos/telas, sinais manuais/read-only. ✅ em curso.
- **P1 — Primeira tela read-only:** Visão Geral + Integrações + Incidentes, com dados já disponíveis (SOC, Pluggy, status sync) e selos de origem.
- **P2 — Hub e automação:** read-models via Hub; sinais automáticos; reconciliação SOC × Conta Azul (após OAuth restaurado e Golden Record).
- **P3 — Maestro:** recomendações, alertas inteligentes, visão preditiva.

## 11. Riscos
- Misturar fontes **sem Golden Record** → cliente/numeros errados.
- Usar **`NUMERO_VIDAS`** como headcount → superdimensionar.
- Usar **financeiro sem `cliente_id`** → análise por cliente inválida.
- Mostrar **dado defasado como atual** (ex.: Conta Azul) → decisão errada. Mitigação: **selo de origem + data**.
- **Vazar dado sensível** (saúde/financeiro) → acesso por papel, mascaramento.
- Permitir **ação crítica pelo painel** → proibido por design.
- Criar **confiança falsa** antes da reconciliação → selos honestos + bloco Saúde dos Dados.

## 12. Próximos passos recomendados (antes de qualquer código)
1. **Validar esta arquitetura** com o Cleber.
2. **Definir a primeira tela** (sugestão: Visão Geral + Integrações + Incidentes — usa só dados já disponíveis e honestos).
3. **Definir a fonte de cada indicador** e seu **selo** (real / estimado / indisponível / bloqueado).
4. **Manter ações críticas bloqueadas** por design.
5. Não implementar nada até a arquitetura e os selos serem aprovados.

---

## Apêndice — Estado de referência (diagnóstico)
- SOC: 2.423 empresas · 2.179 c/ CNPJ · 1.493 c/ vidas>0 · 446 c/ exames 30d · 11.184 exames/30d · `NUMERO_VIDAS` não confiável.
- Conta Azul: **NO-GO** — OAuth `invalid_grant` 11/11; sync parado ~14/06; 49.143 lançamentos defasados; `cliente_id` 0. Ver `INCIDENTE_CONTA_AZUL_OAUTH_INVALID_GRANT_2026-06-26.md`.
- Pluggy: fonte independente; 1 conta conectada.
- Banco local: `clientes`/`funcionarios`/`asos` vazios; reconciliação/Golden Record ainda não iniciados. Ver `DIAGNOSTICO_DADOS_LEGADOS_LEITURA_INTEGRAL.md`.
