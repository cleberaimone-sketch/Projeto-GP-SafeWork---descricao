# CONTEXT.md — GP SafeWork · Projeto de IA e Automação
> Gerado em: 08/05/2026 · Conversa com Cleber (CEO)

---

## 1. QUEM É O GP SAFEWORK

**GP SafeWork** é uma holding de Saúde e Segurança do Trabalho (SST) sediada em **Medianeira, PR**.
- Site: gpsafework.com.br · Instagram: @gpsafework
- Responsável legal da holding: **Jane**
- CEO / fundador: **Cleber**

---

## 2. ESTRUTURA SOCIETÁRIA COMPLETA

### Subsidiárias ativas (CNPJ próprio, sob a holding GP SafeWork)
| Empresa | Foco | Status |
|---|---|---|
| SafeWork Medianeira | SST regional | Ativa |
| SafeWork Foz do Iguaçu | SST regional | Ativa |
| SafeWork Santa Helena | SST regional | Ativa |
| SafeWork Londrina | SST regional | Ativa |
| Safe+ | Rede credenciada nacional (equipe própria + parceiros) | Ativa |
| SafeT | Treinamentos SST | Ativa · já tem clientes |
| SafeR&S | NR-01 + Recrutamento e Seleção | Ativa · já tem clientes |
| SafeHelp | Produtos digitais SST | Ativa · em desenvolvimento |

### Em nome de Cleber — serão desativadas
| Empresa | Status |
|---|---|
| SafeMeioAmbiente | Ativa, alguns dados, encerrando |
| SafeSoluções | Ativa, encerrando |

### Projetos futuros — sem CNPJ ainda
SafeLicita · SafePi · SafeBus · SafeBank · SafeCarbon

---

## 3. DEPARTAMENTOS INTERNOS

| Departamento | Gerente | Observação |
|---|---|---|
| Medicina | Larissa Vargas | 4 clínicas + New Life (parceira) |
| Engenharia | Diego Chies | TSTs nas unidades |
| Comercial | Luis Rabelo | Supervisora: Nathielli Vargas |
| Financeiro | **VAGO** | Supervisora: Evelyn Lavyne |
| RH / Pessoas | Leticia Perico | Também toca SafeR&S |
| Processos / Tech | Carlos Eduardo | Coordena estagiários + Maestro + Unisyst |
| Gerente Geral | Josiane Klaus | Visão geral da operação |

---

## 4. TIME COMPLETO

### Medicina
**Gerente:** Larissa Vargas

**Clínica Medianeira:** Camila Jung (Exames), Ana Paula (Fono), Dra. Gabriela (Médica), Dra. Andressa (Médica), Felipe Sbardelongo (Psicólogo), Gabrielly Carvalho (Exames), Roseli da Silva (Triagem), Adrielly (Freq. Terças)

**Clínica Londrina:** Milena Pereira (Recepção), Gesminy (Fono), Cristiane (Psicóloga), Vinícius (Médico), Enf. Natália (RT COREN), Débora Farias (Exames)

**Clínica Santa Helena:** Ana Caroline (Recepção), Natieli Simoneti (Psicóloga), Jessica (Fono), Loreni (Limpeza)

**Clínica Foz do Iguaçu:** Aline Gabriele (Recepção), Claudia (Fono), Camila Bazus (Médica), Janyse (Fono), Elis Regina (Psicóloga), Taís Carvalho (Exames), Aline Becker (Triagem)

**New Life (parceira):** Geyci de Carvalho (Estagiária Medicina)

### Engenharia
**Gerente:** Diego Chies (Coord. Seg. Trabalho)

Jhonatan Almeida (RT Engenharia), Carla de Lima (Coord. Adm.), Eduardo de Oliveira (TST Londrina), Tiago Maiorano (TST Foz), Hillyard Adrian (TST), Dani Dahmer (TRES Foz), Marcelo R. (Estágio Adm.), Maria Jaciara (Auxiliar Adm.), Janaina Flores (Auxiliar Adm.)

**E-Social:** Bruna Amarante (Supervisora Administrativa)

### Comercial
**Gerente:** Luis Rabelo · **Supervisora:** Nathielli Vargas

Lucas Botelho, Douglas J. de Andrade, Greicy Furtado (Comercial), Juan de Lima (Credenciamento Safe+), Weidiane (Adm. Comercial), Luccas Facundo (Analista de Marketing)

### Financeiro
**Supervisora:** Evelyn Lavyne · **Gerente: VAGO**

Maria Leticia, Murilo Gonçalves, Gabriele C. Teles (Financeiro), Giovanna Planelis (Estágio BI Financeiro), Maria (Compras)

### RH
**Gerente:** Leticia Perico · **Supervisora:** Eduarda Colussi

Lucia Ap (Aux. Limpeza), Luis Oliveira (Suporte TI)

### SafeHelp / Tech
**Gerente de Processos:** Carlos Eduardo

**Implantação sistemas:** Giovanna (Unisyst)

**Estagiários Tech (5):** Lucas Alamini, Huender de Lima, Rafael Vieira, Herick, Kiria

### Safe+ · Rede Credenciada
Jiani Jung (Supervisora Santa Helena), Leticia Rosso (Liberação de Exames), Eduardo Forlin, Igor da Costa, Bruna Vitória (Agendamentos)

### SafeT
Petra S. Machado (Comercial), Moha (Instrutor)

---

## 5. SISTEMAS E STACK ATUAL

### Sistemas operacionais
| Sistema | Função | Status |
|---|---|---|
| **SOC** | Medicina + Engenharia (ASOs, laudos, PGR, PCMSO) | Ativo · fonte principal |
| **Maestro** | Automações de processos SOC | Em implantação (Carlos + terceiro) |
| **Conta Azul** | ERP financeiro atual (10 logins, 1 por empresa) | Ativo · será substituído |
| **Unisyst** | Novo ERP (tem integração nativa com SOC) | Em implantação (Giovanna) |
| **Agilize** | Plataforma contábil externa (recebe NFs, processa) | Ativo |
| **D4sign** | Contratos digitais | Ativo |
| **RD Station** | CRM e marketing | Ativo |
| **ClickUp** | Gestão de projetos (20+ projetos) | Ativo |
| **Z-API / Evolution API** | WhatsApp Business | Ativo |

### Produtos SafeHelp (em desenvolvimento)
| Produto | Status | Stack destino |
|---|---|---|
| SafeChat IA | Bubble → migrando | Next.js + Supabase |
| SafeDocs | Bubble → migrando | Next.js + Supabase |
| SafeApp | Só no Figma, build do zero | Next.js + Supabase |

### Infraestrutura tech
- **Supabase** — banco central (projeto: `safeapp-test` · `xsewprgzlhpxvjrslpnz`)
- **N8N / Make** — orquestração de automações
- **Mac Mini M4** (16GB RAM) — servidor local sempre ligado
- **Claude API (Anthropic)** — LLM de todos os agentes

---

## 6. STACK FINANCEIRA — FLUXO CORRETO

```
Unisyst (processa boletos, NFs, faturamento)
    ↓ N8N (automação a construir)
Agilize (contabilidade — recebe NFs e processa)
```

**Conta Azul:** 10 logins separados hoje (1 por empresa)
**Unisyst:** quando pronto, centraliza em 1 login — migração dos conectores N8N

**Roadmap financeiro:**
1. **Agora** — integrar Conta Azul (10 logins) → Supabase via N8N
2. **Médio prazo** — automatizar Unisyst → Agilize (envio de NFs)
3. **Futuro** — ERP financeiro próprio baseado no modelo Unisyst

---

## 7. OBJETIVO DO PROJETO — VISÃO GERAL

**Objetivo central:** Automatizar o grupo GP SafeWork com IA, criando um ecossistema de agentes autônomos que aprendem, executam e aperfeiçoam processos — com um **Centro de Comando** (painel na parede da sala de reuniões) que exibe tudo em tempo real.

### Arquitetura de Agentes

| Agente | Função | Dono |
|---|---|---|
| **LUI (CEO)** | Visão estratégica, briefing diário 7h, WhatsApp + dashboard | Cleber |
| **Agente Secretária** | Atende clientes externos (WhatsApp, web, email), ASOs, agendamentos | Todos |
| **Agente Comercial** | Pipeline, prospecção, CRM | Luis Rabelo |
| **Agente Financeiro** | Inadimplência, fluxo, alertas, DRE | Evelyn Lavyne |
| **Agente Medicina** | ASOs, consultas, conformidade, alertas | Larissa Vargas |
| **Agente Engenharia** | Laudos, PGR, PCMSO, atrasos | Diego Chies |
| **Agente Processos** | Automações, BPM, projetos | Carlos Eduardo |
| **Agente RH** | Pessoas, turnover, onboarding | Leticia Perico |
| **SafeChat IA** | Agente por empresa cliente (produto SafeHelp) | Carlos / SafeHelp |

### Centro de Comando (War Room)
- **Hardware:** Mac Mini M4 plugado em tela/TV na sala de reuniões
- **Dois modos:**
  - **Passivo** (dia a dia) — KPIs rolando, alertas, status das empresas
  - **Interativo** (reuniões) — drill-down por empresa, chat com LUI, relatórios
- **Navegação:** visão holding + drill-down por empresa

---

## 8. BI — ESTRUTURA DE RELATÓRIOS (38 relatórios, 7 módulos)

### Financeiro (9 relatórios)
- FIN·01 Contas a Receber Diário por Unidade — `Conta Azul`
- FIN·02 Saldos Bancários Tempo Real — `Open Finance / Pluggy` (a definir)
- FIN·03 Fluxo de Caixa Projetado vs Realizado — `Conta Azul + Unisyst`
- FIN·04 Contas a Pagar por Centro de Custo — `Conta Azul`
- FIN·05 Honorários Profissionais Medicina — `Conta Azul`
- FIN·06 Raio-X Financeiro por Unidade — `Conta Azul`
- FIN·07 Laudos e Exames — Custo — `Conta Azul + SOC`
- FIN·08 Mão de Obra por Categoria (CLT/PJ/Estágio) — `Folha / RH`
- FIN·09 Inadimplência Aging Report — `Conta Azul`

### Medicina (6 relatórios)
- MED·01 Total Consultas por Unidade (2024 vs 2025) — `SOC`
- MED·02 Periódicos Agendados vs Realizados — `SOC`
- MED·03 ASOs Vencendo — Alertas por Cliente — `SOC`
- MED·04 Produtividade por Profissional — `SOC`
- MED·05 PCMSO Status por Cliente — `SOC`
- MED·06 Receita por Tipo de Exame — `SOC + Unisyst`

### Engenharia (5 relatórios)
- ENG·01 Panorama Entregas Laudos/PCMSO/PGR — `SOC`
- ENG·02 Laudos e PGRs em Atraso — `SOC`
- ENG·03 Coletas e Deslocamentos Custo — `Conta Azul + SOC`
- ENG·04 Conformidade de Clientes por NR — `SOC`
- ENG·05 Produtividade por Técnico (TST) — `SOC`

### Safe+ (4 relatórios)
- S+·01 Lucratividade por Contrato — `SOC + Conta Azul`
- S+·02 Performance Fornecedores Credenciados — `SOC`
- S+·03 Agendamentos e SLA — `SOC`
- S+·04 Cobertura Geográfica da Rede — `Cadastro interno`

### SafeT (4 relatórios)
- ST·01 Acumulado Anual Cidades/Clientes/Funcionários — `Manual → Unisyst`
- ST·02 Top 10 Clientes — `Manual → Unisyst`
- ST·03 Produção por NR Turmas e Presença — `Manual → Unisyst`
- ST·04 Lucratividade SafeT — `Conta Azul + Manual`

### RH & Pessoas (4 relatórios)
- RH·01 Headcount por Empresa e Regime (CLT/PJ/Estágio) — `Folha / RH`
- RH·02 Custo de Pessoal por Categoria — `Folha / RH`
- RH·03 Turnover e Retenção — `RH interno`
- RH·04 Absenteísmo por Unidade — `Ponto + RH`

### Comercial (6 relatórios)
- COM·01 Pipeline de Vendas Funil por Etapa — `RD Station`
- COM·02 Comissões por Vendedor — `Unisyst + RD Station`
- COM·03 Deslocamentos e Diárias Comercial — `Conta Azul`
- COM·04 Marketing ROI por Canal — `RD Station + Meta Ads`
- COM·05 Churn e Retenção de Clientes — `D4sign + Unisyst`
- COM·06 Prospecção SST WebScrap — `Receita Federal + WebScrap`

### Overview / Holding (3 relatórios)
- OV·01 Lucratividade por Empresa — `Unisyst + Conta Azul`
- OV·02 DRE Consolidado do Grupo — `Conta Azul → Unisyst`
- OV·03 Contratos Ativos D4sign — `D4sign API`
- OV·04 Ranking Clientes Top 20 Grupo — `Unisyst`

---

## 9. DADOS REAIS JÁ DISPONÍVEIS

### Vendas consolidadas Jan-Ago 2025
| Empresa | Total |
|---|---|
| SW Medianeira | R$ 771.234 |
| Safe+ | R$ 750.231 |
| SW Santa Helena | R$ 349.218 |
| SW Londrina | R$ 308.648 |
| SW Foz do Iguaçu | R$ 293.430 |
| SafeT | R$ 265.389 |
| SafeR&S | R$ 17.491 |

Evolução mensal: R$121k (jan) → R$700k (ago) — crescimento expressivo

### Medicina — Consultas
- 2024 total: **18.355** consultas
- 2025 jan-ago: **17.305** → queda de **6%**
- Agosto 2025: **2.252** vs 2.931 em 2024 → queda de **23%** ⚠️

### Mão de Obra
- Média salarial 2025: **R$ 2.631**
- Custo total jan-ago 2025: **R$ 2.214.695**
- Média mensal: **R$ 178.398**

---

## 10. ROADMAP DE PROJETOS — ESTRUTURA

### 🔴 Fase 1 — Fundação (base para todo o resto)
| # | Projeto | Responsável sugerido | Prazo |
|---|---|---|---|
| P01 | Supabase: Schema Central | Estagiário sênior | 3 dias |
| P02 | Integração Conta Azul → Supabase (10 logins) | 1 estagiário | 1 semana |
| P03 | Integração SOC → Supabase (Medicina + Eng.) | 1 estagiário | 1 semana |
| P04 | Integração D4sign → Supabase | 1 estagiário | 3 dias |

### 🟡 Fase 2 — Agentes e Painel (dependem da Fase 1)
| # | Projeto |
|---|---|
| P05 | Agente CEO LUI (WhatsApp + dashboard + briefing 7h) |
| P06 | Agente Secretária (atende clientes externos) |
| P07 | Painel Centro de Comando (war room Mac Mini) |
| P08 | Agente Financeiro |
| P09 | Agente Medicina |
| P10 | Agente Engenharia |

### 🟢 Fase 3 — Produtos SafeHelp (paralelo às fases 1 e 2)
| # | Projeto |
|---|---|
| P11 | SafeChat IA (migração Bubble + IA) |
| P12 | SafeDocs (migração Bubble) |
| P13 | SafeApp (build do zero, Next.js + Supabase) |

### 🔵 Fase 4 — Expansão / Versão 2
| # | Projeto |
|---|---|
| P14 | Pluggy — saldos bancários tempo real |
| P15 | Agente Comercial (RD Station + WebScrap) |
| P16 | Agente RH |
| P17 | SafeChat integrado à SafeApp |
| P18 | SST WebScrap (prospecção automática CNPJs) |
| P19 | Integração Unisyst (substitui Conta Azul) |
| P20 | ERP financeiro próprio (longo prazo) |

---

## 11. ARTEFATOS GERADOS NESTA CONVERSA

| Arquivo | Descrição |
|---|---|
| `LUI_system_prompt.md` | Prompt de sistema completo do Agente CEO LUI |
| Painel War Room (widget) | Protótipo interativo do Centro de Comando |
| Organograma completo (widget) | Time completo por departamento |
| Estrutura de relatórios BI (widget) | 38 relatórios em 7 módulos |
| Diagrama holding (widget) | Estrutura societária visual |
| Diagrama agentes IA (widget) | Ecossistema de agentes |
| Diagrama sistemas (widget) | Integrações e fontes de dados |

---

## 12. PENDÊNCIAS / PRÓXIMOS PASSOS

- [ ] Acessar ClickUp e listar os 20+ projetos existentes
- [ ] Identificar qual estagiário está em qual projeto
- [ ] Definir integração saldos bancários (Pluggy ou outro)
- [ ] Confirmar API do Conta Azul disponível para os estagiários
- [ ] Confirmar API do SOC disponível
- [ ] Decidir hardware definitivo para o painel (Mac Mini M4 recomendado)
- [ ] Preencher gap: Gerente Financeiro (cargo em aberto)
- [ ] Mapear o que a SafeT usa atualmente para controle de turmas/presença

---

*Documento gerado a partir da conversa de planejamento estratégico com Cleber — GP SafeWork · Mai/2026*
