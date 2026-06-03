# RESUMO TÉCNICO — CENTRO DE COMANDO GP SAFEWORK

> Documento gerado automaticamente em 2026-06-03.
> Descreve a arquitetura completa, agentes, integrações e visão do projeto.

---

## 1. NOME DO PROJETO

**GP SafeWork OS** — Centro de Comando Inteligente  
URL de produção: `https://projeto-gp-safe-work-descricao.vercel.app`  
Repositório: `https://github.com/cleberaimone-sketch/Projeto-GP-SafeWork---descricao`

---

## 2. OBJETIVO PRINCIPAL

Construir um ecossistema de agentes de IA e um Centro de Comando (war room) para a holding GP SafeWork — grupo de SST (Saúde e Segurança do Trabalho) com 8 empresas e ~50 pessoas.

**Problema central:** dados dispersos em múltiplos sistemas (Conta Azul, SOC, D4sign, WhatsApp, planilhas). Decisões tomadas sem visibilidade integrada.

**Solução:** um único painel operacional com agentes especializados por área (financeiro, medicina, engenharia, RH, comercial) que respondem em tempo real a perguntas de negócio, executam rotinas automáticas e alertam sobre exceções.

---

## 3. TECNOLOGIAS USADAS

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 16 (App Router, Turbopack) · React 19 · TailwindCSS 4 |
| Banco de dados | Supabase · PostgreSQL 15 |
| IA | Claude API — Anthropic (Opus 4.7 / Sonnet 4.6) |
| Deploy | Vercel (CI/CD automático no push para `main`) |
| WhatsApp | Z-API / Evolution API |
| Automações | N8N / Make (Mac Mini M4 local) |
| Open Finance | Pluggy (em aprovação de produção) |
| ERP Financeiro | Conta Azul Mais (OAuth2 via AWS Cognito) |
| Medicina/SST | SOC — ExportaDados (WS-Security SOAP) |
| Assinatura digital | D4sign (integrado via API REST) |
| Linguagem | TypeScript (estrito) |

---

## 4. ESTRUTURA DE PASTAS

```
.
├── CLAUDE.md                        ← Layer 1 — Memória do agente (regras do projeto)
├── .claude/
│   ├── CLAUDE.md                    ← Regras específicas (override)
│   ├── skills/                      ← Layer 2 — Skills de domínio
│   ├── hooks/                       ← Layer 3 — Guardrails determinísticos
│   ├── agents/                      ← Layer 4 — Subagentes especializados
│   └── settings.json                ← Config + registry de hooks
├── web/                             ← Next.js App
│   ├── app/
│   │   ├── api/
│   │   │   ├── agentes/             ← Chat de cada agente (8 endpoints)
│   │   │   ├── conta-azul/          ← OAuth + sync financeiro
│   │   │   ├── lui/                 ← Briefing, alertas, webhook, chat LUI
│   │   │   ├── pluggy/              ← Open Finance (connect token, items, sync)
│   │   │   ├── safechat/            ← Webhook SafeChat (WhatsApp externo)
│   │   │   ├── whatsapp/mirror/     ← Espelho WhatsApp corporativo
│   │   │   ├── financeiro/metas/    ← CRUD de metas orçamentárias
│   │   │   └── estrategia/relatorio/← Relatórios estratégicos via IA
│   │   └── dashboard/
│   │       ├── page.tsx             ← Centro de Comando (war room)
│   │       ├── financeiro/          ← Dashboard Plata (CFO)
│   │       ├── medicina/            ← Dashboard Lari (medicina ocupacional)
│   │       ├── engenharia/          ← Dashboard Dieguito (SST/NR)
│   │       ├── rh/                  ← Dashboard Le (recursos humanos)
│   │       ├── comercial/           ← Dashboard Luizito (comercial)
│   │       ├── lui/                 ← Dashboard LUI (CEO/war room)
│   │       ├── sistema/             ← Status dos sistemas integrados
│   │       └── processos/           ← Catálogo de produtos SafeWork
│   └── lib/
│       ├── agentes/                 ← System prompts + context loaders (8 agentes)
│       ├── conta-azul/              ← OAuth client + sync de lançamentos
│       ├── soc/                     ← Parser XML + queries SOAP
│       ├── financeiro/              ← filtrarParaDRE(), filtrarParaFluxoCaixa()
│       ├── medicina/                ← Dados históricos de atendimento
│       ├── rh/                      ← Dados CTSE e headcount
│       ├── pluggy/                  ← Client Open Finance
│       ├── processos/dados.ts       ← Catálogo de produtos/serviços
│       └── supabase/                ← Client server/browser
└── supabase/migrations/             ← 17 migrations SQL aplicadas
```

---

## 5. PRINCIPAIS MÓDULOS

### 5.1 Centro de Comando (`/dashboard`)
War room principal. Exibe em tempo real:
- KPIs financeiros do mês (receita, despesa, lucro, margem)
- Status dos 8 agentes IA com indicador de atividade
- Fila de tarefas e briefing do dia
- Espelho WhatsApp corporativo (mensagens da linha 45999099009)
- Alertas críticos de todas as áreas

### 5.2 Dashboard Financeiro (`/dashboard/financeiro`)
- Cockpit com KPIs aprovados: Receita, Despesa, Lucro, Margem, Atrasados, Empréstimos
- DRE gerencial com filtro por empresa e período
- Metas orçamentárias com comparação realizado vs. planejado
- Saldos Conta Azul via `v_saldos_ativos`
- Seção Open Finance (Pluggy) — aparece quando contas conectadas

### 5.3 Dashboard Medicina (`/dashboard/medicina`)
- ASOs realizados vs. vencidos vs. pendentes
- Histórico de atendimentos por clínica e período
- Prazos eSocial e alertas de vencimento
- Dados 2024 (33.204 atendimentos) e 2025 (31.483); 2026 parcial

### 5.4 Dashboard Engenharia (`/dashboard/engenharia`)
- Status dos programas SST (PCMSO, PGR, PCMAT)
- Vencimento de treinamentos NR (NR-10, NR-33, NR-35 etc.)
- Cronograma de inspeções e vistorias

### 5.5 Dashboard RH (`/dashboard/rh`)
- Headcount total e por empresa
- Quadro por vínculo (CLT / PJ / Estágio)
- CTSE histórico 2024 vs. 2025
- Custo da folha por unidade (9 empresas)

### 5.6 Dashboard Comercial (`/dashboard/comercial`)
- Pipeline de contratos ativos e renovações
- Alertas D4sign de contratos parados
- Status das integrações por área

### 5.7 Dashboard LUI — CEO (`/dashboard/lui`)
- Visão estratégica consolidada
- Encaminhamento para agentes especializados
- Relatórios estratégicos gerados via IA

---

## 6. BANCO DE DADOS E TABELAS

**Supabase:** `jdnwsmbxnjwoswcdktpx` · PostgreSQL 15

### Migrations aplicadas (17 arquivos)

| Migration | Tabelas/Objetos criados |
|---|---|
| `20260511000001_core` | `empresas`, `funcionarios`, `usuarios`, views base |
| `20260511000002_financeiro` | `lancamentos_financeiros`, `plano_de_contas`, `periodos_fechados` |
| `20260511000003_medicina` | `atendimentos_soc`, `asos`, `clinicas`, `medicos` |
| `20260511000004_engenharia` | `programas_sst`, `treinamentos_nr`, `vencimentos` |
| `20260511000005_comercial` | `contratos_clientes`, `renovacoes`, `alertas_d4sign` |
| `20260511000006_rh_safeplus_safet` | `folha_pagamento`, `headcount_mensal`, `ctse` |
| `20260511000007_sistema_agentes` | `memorias_agentes`, `interacoes_agentes`, `briefings_diarios` |
| `20260512000001_conta_azul_tokens` | `conta_azul_tokens` (OAuth refresh rotation) |
| `20260512000002_lancamentos_unique` | Constraint UNIQUE em lançamentos (dedup sync) |
| `20260512000003_fix_constraints` | Correções de CHECK e FK |
| `20260513000001_memorias_agentes` | `memorias_agentes` (contexto persistente por agente) |
| `20260513000002_webhook_dedup` | `webhook_dedup` (deduplicação de webhooks) |
| `20260515000001_contas_bancarias` | `contas_bancarias_ativas`, view `v_saldos_ativos` |
| `20260516000001_metas_orcamentarias` | `metas_orcamentarias` (planejado vs. realizado) |
| `20260517000001_pluggy_open_finance` | `pluggy_items`, `pluggy_accounts`, view `v_saldos_pluggy` |
| `20260529234951_relatorios_estrategicos` | `relatorios_estrategicos` (relatórios gerados por IA) |
| `20260602000001_mensagens_wpp_mirror` | `mensagens_wpp_mirror` + Realtime publication |

### Views relevantes
- `v_saldos_ativos` — saldos Conta Azul filtrados por contas ativas
- `v_saldos_pluggy` — saldos Open Finance por conta Pluggy
- `v_kpis_financeiros_mes` — KPIs do mês atual consolidados

### Supabase Realtime ativo
- `mensagens_wpp_mirror` — feed ao vivo do WhatsApp corporativo

---

## 7. INTEGRAÇÕES

| Sistema | Status | Autenticação | Uso |
|---|---|---|---|
| **Conta Azul Mais** | ✅ Ativo | OAuth2 (AWS Cognito) | Lançamentos financeiros, DRE, fluxo de caixa |
| **SOC ExportaDados** | ✅ Ativo | WS-Security SOAP | ASOs, atendimentos, funcionários |
| **D4sign** | ✅ Integrado | Token API REST | Alertas de contratos parados via LUI |
| **Z-API / Evolution API** | ✅ Ativo | Webhook + Secret | WhatsApp corporativo e SafeChat |
| **Pluggy Open Finance** | 🟡 Sandbox | Client ID + Secret | Saldos bancários em tempo real |
| **N8N / Make** | 🟡 Parcial | Webhook URL | Automações de rotina |
| **Vercel Cron** | ✅ Ativo | Cron Secret | Briefing diário + sync Conta Azul |

### Variáveis de ambiente necessárias (`.env.local`)
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
CONTA_AZUL_CLIENT_ID
CONTA_AZUL_CLIENT_SECRET
CONTA_AZUL_REDIRECT_URI
SOC_USUARIO
SOC_SENHA
SOC_CODIGO_EMPRESA
PLUGGY_CLIENT_ID
PLUGGY_CLIENT_SECRET
D4SIGN_TOKEN_API
D4SIGN_CRYPT_KEY
MIRROR_WEBHOOK_SECRET
LUI_WEBHOOK_SECRET
CRON_SECRET
```

---

## 8. DASHBOARDS EXISTENTES

| Rota | Nome | Agente IA | Status |
|---|---|---|---|
| `/dashboard` | Centro de Comando | LUI (integrador) | ✅ Ativo |
| `/dashboard/financeiro` | Cockpit Financeiro | Plata (CFO) | ✅ Ativo |
| `/dashboard/medicina` | Medicina Ocupacional | Lari | ✅ Ativo |
| `/dashboard/engenharia` | Engenharia SST | Dieguito | ✅ Ativo |
| `/dashboard/rh` | Recursos Humanos | Le | ✅ Ativo |
| `/dashboard/comercial` | Comercial | Luizito | ✅ Ativo |
| `/dashboard/lui` | War Room CEO | LUI | ✅ Ativo |
| `/dashboard/sistema` | Status dos Sistemas | — | ✅ Ativo |
| `/dashboard/processos` | Catálogo de Produtos | — | ✅ Ativo |
| `/dashboard/aimone` | Aimone (pessoal) | Aimone | 🟡 Em desenvolvimento |

---

## 9. AGENTES DE IA

Todos os agentes usam **Claude API (Anthropic)** com system prompt personalizado, contexto carregado do Supabase em cada conversa e memória persistente por agente.

### Arquitetura de um agente
```
web/lib/agentes/<nome>/
  system-prompt.ts   ← Identidade, regras de negócio, formato de resposta
  context.ts         ← Carrega dados do Supabase relevantes para o agente
  claude.ts          ← Wrapper de chamada à Claude API com streaming
web/app/api/agentes/<nome>/route.ts  ← POST handler (streaming SSE)
```

### Catálogo de agentes

| Agente | Papel | Dashboard | Modelo |
|---|---|---|---|
| **LUI** | CEO Virtual / War Room / Integrador | `/dashboard/lui` | Opus 4.7 |
| **Plata** | CFO — Financeiro, DRE, fluxo de caixa | `/dashboard/financeiro` | Sonnet 4.6 |
| **Lari** | Medicina Ocupacional — ASOs, eSocial, SOC | `/dashboard/medicina` | Sonnet 4.6 |
| **Dieguito** | Engenharia SST — NRs, PGR, treinamentos | `/dashboard/engenharia` | Sonnet 4.6 |
| **Le** | RH — headcount, folha, CTSE | `/dashboard/rh` | Sonnet 4.6 |
| **Luizito** | Comercial — contratos, renovações, pipeline | `/dashboard/comercial` | Sonnet 4.6 |
| **Aimone** | Assistente pessoal do Cleber | `/dashboard/aimone` | Sonnet 4.6 |
| **Nina** | Secretária (agendamentos e triagem) | WhatsApp/web | Sonnet 4.6 |
| **SafeChat** | Atendimento externo a clientes SST | WhatsApp | Sonnet 4.6 |
| **Carlitos** | Assessor estratégico interno | Interno | Opus 4.7 |

### Memória persistente dos agentes
Tabela `memorias_agentes` — armazena conversas e decisões relevantes de cada agente, carregadas no contexto para dar continuidade nas próximas sessões.

---

## 10. COMO OS AGENTES CONVERSAM ENTRE SI

O ecossistema atual usa **delegação via LUI** (não comunicação direta entre agentes):

```
Usuário → LUI (war room)
            ├── Pergunta financeira → encaminha para Plata
            ├── Questão de medicina → encaminha para Lari  
            ├── Problema de SST → encaminha para Dieguito
            ├── Questão de RH → encaminha para Le
            └── Alerta crítico → publica em /api/lui/alertas
```

### Mecanismos de comunicação
1. **Briefing diário** (`/api/lui/briefing`) — LUI consolida dados de todos os agentes e produz resumo executivo. Disparado via Vercel Cron (GET diário).
2. **Alertas** (`/api/lui/alertas`) — endpoint que recebe alertas de qualquer agente e os exibe no Centro de Comando.
3. **Webhook LUI** (`/api/lui/webhook`) — recebe mensagens WhatsApp destinadas ao número corporativo e as processa com o LUI.
4. **Memórias compartilhadas** — tabela `memorias_agentes` permite que um agente "veja" decisões de outro ao carregar contexto.

### Próxima fase (multi-agente real)
Quando houver múltiplos usuários simultâneos ou automações, os agentes passarão a se chamar diretamente via API interna com orquestração N8N/Make.

---

## 11. DADOS QUE CADA AGENTE ACESSA

| Agente | Fontes de dados |
|---|---|
| **LUI** | Todos os KPIs consolidados, alertas, memorias_agentes, briefings anteriores |
| **Plata** | `lancamentos_financeiros`, `metas_orcamentarias`, `v_saldos_ativos`, `v_saldos_pluggy`, `contas_bancarias_ativas` |
| **Lari** | `atendimentos_soc` (via SOC ExportaDados XML), `asos`, `clinicas`, histórico planilha (fallback) |
| **Dieguito** | `programas_sst`, `treinamentos_nr`, `vencimentos`, funcionários por empresa |
| **Le** | `folha_pagamento`, `headcount_mensal`, `ctse`, dados planilha RH 2024/2025 |
| **Luizito** | `contratos_clientes`, `renovacoes`, alertas D4sign, histórico de vidas por empresa |
| **Aimone** | Agente pessoal — acessa conversas anteriores e tarefas do Cleber |
| **SafeChat** | Perguntas de clientes SST — base de conhecimento sobre NRs e serviços |
| **Nina** | Calendário, agenda, triagem de WhatsApp |
| **Carlitos** | Dados estratégicos consolidados, planejamento de crescimento |

---

## 12. FUNCIONALIDADES PRONTAS

### Infraestrutura
- [x] Schema completo do banco de dados (17 migrations)
- [x] Next.js 16 com App Router, TypeScript estrito, TailwindCSS 4
- [x] Deploy contínuo Vercel (push → produção automático)
- [x] Sistema de memória persistente por agente (Supabase)
- [x] Deduplicação de webhooks (`webhook_dedup`)

### Financeiro
- [x] OAuth Conta Azul Mais (Authorization Code + refresh rotation via Cognito)
- [x] Sync de lançamentos financeiros (manual + cron automático)
- [x] Filtros `filtrarParaDRE()` e `filtrarParaFluxoCaixa()` (excluindo transferências internas)
- [x] Cockpit com 6 KPIs aprovados (Receita, Despesa, Lucro, Margem, Atrasados, Empréstimos)
- [x] DRE gerencial com filtro por empresa e período
- [x] Metas orçamentárias (planejado vs. realizado)
- [x] Saldos bancários via `v_saldos_ativos`
- [x] Seção Pluggy (aparece quando contas conectadas — aguardando produção)

### Medicina
- [x] Integração SOC ExportaDados (WS-Security, parser XML `parseSocXmlRows()`)
- [x] Dashboard com ASOs realizados, vencidos, pendentes
- [x] Histórico de atendimentos por clínica e período
- [x] Dados fallback via planilha (enquanto SOC não normaliza)
- [x] Lógica `isConsultaOcupacional()` para tipagem correta de ASOs

### Agentes IA
- [x] 10 agentes com system prompt, contexto e memória
- [x] Chat streaming (SSE) para todos os agentes
- [x] Briefing diário automatizado do LUI (Vercel Cron)
- [x] Alertas do LUI no Centro de Comando

### WhatsApp
- [x] Webhook LUI — processa mensagens da linha corporativa com IA
- [x] Espelho WhatsApp no Centro de Comando (`mensagens_wpp_mirror`)
  - Filtra apenas contatos com "safe" no nome (case-insensitive, sem acentos)
  - Realtime via Supabase (atualização sem reload)
  - Suporta Z-API e Evolution API
- [x] SafeChat — webhook para atendimento externo a clientes

### D4sign
- [x] Integração ativa (alertas de contratos parados via LUI)
- [x] Status no comercial atualizado para "integrado"
- [x] SafeDocs marcado como "mvp" no catálogo de produtos

### Dashboards
- [x] Centro de Comando (war room com todos os KPIs + feed ao vivo)
- [x] Financeiro, Medicina, Engenharia, RH, Comercial, LUI, Sistema, Processos

---

## 13. FUNCIONALIDADES INCOMPLETAS

| Feature | Status | Bloqueio |
|---|---|---|
| **Pluggy Open Finance** | 🟡 Sandbox | Aguardando aprovação Pluggy para produção |
| **SafeChat** | 🟡 Backend pronto | Precisa configurar instância Z-API/Evolution dedicada |
| **SOC — máscaras** | 🟡 Conexão OK | Pendente: códigos das máscaras de exportação |
| **Dashboard Aimone** | 🟡 Em dev | Não deployado ainda |
| **Nina (secretária)** | 🟡 Prompt pronto | Sem instância WhatsApp dedicada |
| **Pluggy → DRE** | ⏳ Planejado | Reconciliação saldo bancário ↔ lançamentos |
| **Análise de contratos** | ⏳ Planejado | Base de dados de contratos a ser populada |
| **D4sign TOKEN** | 🔴 Bloqueado | `D4SIGN_TOKEN_API` não configurado no Vercel |
| **Multi-agente real** | ⏳ Fase 3 | SafeHelp — SafeChat, SafeDocs, SafeApp |
| **Unisyst (novo ERP)** | ⏳ Fase 4 | Migrar de Conta Azul quando Unisyst entrar |

---

## 14. PENDÊNCIAS TÉCNICAS

### Urgente (necessário para ativar features prontas)
1. **Aplicar migration** `20260602000001_mensagens_wpp_mirror.sql` no SQL Editor do Supabase Studio
   - Cria tabela `mensagens_wpp_mirror` + habilita Realtime
2. **Configurar webhook WhatsApp Mirror** na Z-API/Evolution (linha 45999099009):
   - URL: `https://projeto-gp-safe-work-descricao.vercel.app/api/whatsapp/mirror`
   - Header: `x-mirror-secret: <MIRROR_WEBHOOK_SECRET>`
3. **Configurar D4sign no Vercel:**
   - `D4SIGN_TOKEN_API` + `D4SIGN_CRYPT_KEY` (ativa alertas de contratos via LUI)

### Médio prazo
4. **Pluggy produção** — quando chegar o e-mail de aprovação:
   - Atualizar `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET` no Vercel com credenciais de produção
   - Reconectar contas bancárias via `/api/pluggy/connect-token`
5. **SOC — máscaras de exportação** — solicitar ao suporte SOC os códigos das máscaras para os relatórios de ASO e atendimentos
6. **SafeChat** — configurar instância Z-API/Evolution dedicada e apontar webhook para `/api/safechat/webhook`

### Técnico/código
7. **Outubro/2025 no histórico medicina** — valor zero a investigar (provavelmente dado ausente no SOC)
8. **Dashboard Aimone** — finalizar e deployar `/dashboard/aimone`
9. **Nina** — ativar agente de secretária com instância WhatsApp própria
10. **Conta Azul → Unisyst** — migrar integração quando Unisyst entrar em vigor (manter Conta Azul até lá)

---

## 15. COMO O PROJETO VIRA O NÚCLEO DO GP SAFEWORK OS

### Visão: GP SafeWork OS

O Centro de Comando evoluirá para um **sistema operacional da holding** — onde toda decisão de negócio passa por dados em tempo real e agentes de IA especializados.

### Fase 1 — Fundação ✅ (concluída)
- Schema do banco de dados completo
- Integrações core: Conta Azul, SOC, D4sign, WhatsApp
- Agentes IA com identidade, contexto e memória

### Fase 2 — Agentes + Painel 🟡 (em andamento)
- Todos os dashboards departamentais ativos
- Briefing diário automatizado
- Alertas em tempo real
- Open Finance via Pluggy (pré-aprovação)
- Espelho WhatsApp corporativo

### Fase 3 — SafeHelp ⏳ (planejada)
**SafeChat** — WhatsApp inteligente para atendimento de clientes externos
- Responde dúvidas sobre NRs, agendamentos, documentos
- Triagem automática antes de chegar ao humano
  
**SafeDocs** — Gestão documental inteligente
- D4sign integrado: alertas de contratos parados, renovações
- Geração automática de PGR, PCMSO, LTCAT
  
**SafeApp** — App mobile para funcionários das empresas clientes
- ASO digital, treinamentos NR gamificados, alertas de prazo

### Fase 4 — Expansão ⏳ (planejada)
- **Pluggy** — reconciliação bancária automática, visão consolidada de caixa da holding
- **Unisyst** — migração do ERP financeiro (Conta Azul → Unisyst)
- **ERP próprio** — construir sobre o banco Supabase atual, com regras de negócio SST nativas
- **Rede credenciada** — Safe+ ganha módulo próprio de gestão de parceiros externos

### O núcleo que já existe

```
Supabase (banco único)
    ↓
Next.js (interface + API)
    ↓
Claude API (10 agentes especializados)
    ↓
Centro de Comando (war room em tempo real)
```

Este núcleo é a infraestrutura de dados e IA sobre a qual todos os produtos futuros serão construídos. Cada nova feature — SafeChat, SafeDocs, SafeApp, Open Finance — se conecta a esse núcleo via webhook, tabela Supabase ou API route, sem duplicar dados ou lógica.

**O diferencial competitivo** é que o grupo tem um único banco de dados com dados de todos os departamentos (financeiro, medicina, engenharia, RH, comercial), e agentes que entendem o contexto de negócio de SST. Nenhum ERP do mercado combina os dois.

---

*Documento gerado em 2026-06-03 · GP SafeWork OS v2.0*  
*Próxima atualização: quando Pluggy entrar em produção (Fase 2 completa)*
