# CONTEXT.md — GP SafeWork · Projeto de IA e Automação
> Atualizado em: 11/05/2026 · Sessão de desenvolvimento com Cleber (CEO)

---

## 1. QUEM É O GP SAFEWORK

**GP SafeWork** é uma holding de Saúde e Segurança do Trabalho (SST) sediada em **Medianeira, PR**.
- Site: gpsafework.com.br · Instagram: @gpsafework
- Responsável legal da holding: **Jane**
- CEO / fundador: **Cleber** — WhatsApp: `5545999099009`

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

## 4. SISTEMAS E STACK

### Sistemas operacionais
| Sistema | Função | Status |
|---|---|---|
| **SOC** | Medicina + Engenharia (ASOs, laudos, PGR, PCMSO) | Ativo · fonte principal |
| **Maestro** | Automações de processos SOC | Em implantação |
| **Conta Azul** | ERP financeiro atual (10 logins, 1 por empresa) | Ativo · será substituído |
| **Unisyst** | Novo ERP (integração nativa com SOC) | Em implantação |
| **Agilize** | Plataforma contábil externa | Ativo |
| **D4sign** | Contratos digitais | Ativo |
| **RD Station** | CRM e marketing | Ativo |
| **ClickUp** | Gestão de projetos (20+ projetos) | Ativo |
| **Z-API** | WhatsApp Business | Ativo · CONFIGURADO ✅ |
| **Meta API Oficial** | WhatsApp clientes (comprado) | Ativo · uso futuro Agente Secretária |

### Stack do projeto
- **Frontend/Backend:** Next.js (App Router) + TypeScript + Tailwind
- **Banco:** Supabase
- **Automações:** N8N / Make (Mac Mini M4 local)
- **IA:** Claude API (Anthropic) — modelo `claude-sonnet-4-6`
- **WhatsApp interno:** Z-API (LUI ↔ Cleber)
- **WhatsApp clientes:** Meta API Oficial (Agente Secretária — futuro)
- **Deploy:** Vercel (em configuração)

---

## 5. INFRAESTRUTURA E CREDENCIAIS (REFERÊNCIAS)

> ⚠️ Credenciais reais estão em `web/.env.local` — nunca commitar

| Serviço | Referência | Status |
|---|---|---|
| Supabase | projeto: `jdnwsmbxnjwoswcdktpx` · URL: `https://jdnwsmbxnjwoswcdktpx.supabase.co` | Ativo |
| GitHub | repo: `cleberaimone-sketch/Projeto-GP-SafeWork---descricao` | Ativo ✅ |
| Z-API | Instance: `3F2FA0A0303CC13DF8D1EE9FFAB8272B` | Conectado ✅ |
| Anthropic | Claude Sonnet 4.6 | Chave configurada ✅ |
| Vercel | — | A configurar ⏳ |
| N8N | Mac Mini M4 local | A configurar |

### Variáveis de ambiente (web/.env.local)
```
NEXT_PUBLIC_SUPABASE_URL=https://jdnwsmbxnjwoswcdktpx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ver web/.env.local>
SUPABASE_SERVICE_ROLE_KEY=<ver web/.env.local>
ANTHROPIC_API_KEY=<ver web/.env.local>
WHATSAPP_PROVIDER=zapi
ZAPI_BASE_URL=https://api.z-api.io/instances/3F2FA0A0303CC13DF8D1EE9FFAB8272B/token/<token>
ZAPI_CLIENT_TOKEN=<ver web/.env.local>
CLEBER_WHATSAPP_NUMBER=5545999099009
CRON_SECRET=<ver web/.env.local>
```

---

## 6. ESTRUTURA DO REPOSITÓRIO

```
Projeto GP SafeWork/
├── docs/
│   ├── CONTEXT_GP_SAFEWORK.md     ← este arquivo
│   └── SETUP_WHATSAPP_LUI.md
├── supabase/
│   ├── migrations/
│   │   ├── 20260511000001_core.sql
│   │   ├── 20260511000002_financeiro.sql
│   │   ├── 20260511000003_medicina.sql
│   │   ├── 20260511000004_engenharia.sql
│   │   ├── 20260511000005_comercial.sql
│   │   ├── 20260511000006_rh_safeplus_safet.sql
│   │   └── 20260511000007_sistema_agentes.sql
│   └── README.md
├── integrations/
│   ├── conta-azul/                 ← P02: sync financeiro
│   │   ├── client.ts
│   │   ├── types.ts
│   │   ├── config.example.ts
│   │   └── sync/financeiro.ts
│   ├── soc/                        ← P03: a fazer
│   └── d4sign/                     ← P04: a fazer
├── web/                            ← Next.js App
│   ├── app/
│   │   ├── dashboard/page.tsx      ← Centro de Comando
│   │   └── api/lui/
│   │       ├── briefing/route.ts   ← POST: gera briefing 7h
│   │       └── webhook/route.ts    ← POST: recebe WhatsApp
│   ├── lib/
│   │   ├── supabase/               ← client.ts, server.ts
│   │   └── lui/                    ← system-prompt, context, claude, whatsapp
│   └── middleware.ts               ← auth Supabase
└── scripts/
    └── start-lui-dev.sh
```

---

## 7. O QUE JÁ FOI FEITO (11/05/2026)

### ✅ Concluído
- [x] **P01** — Schema Supabase: 7 migrations, 24 tabelas (core, fin, medicina, eng, comercial, rh, sistema)
  - ⚠️ **PENDENTE APLICAR** no dashboard Supabase (SQL Editor → executar migrations em ordem)
- [x] **P02** — Integração Conta Azul: client OAuth2, sync A/R + A/P + saldos → Supabase
  - ⚠️ **PENDENTE** preencher `integrations/conta-azul/config.ts` com os 10 logins
- [x] **Next.js** base: App Router, Supabase SSR, middleware auth, Centro de Comando
- [x] **Agente LUI** completo:
  - System prompt estratégico + briefing diário
  - Contexto de negócio (busca dados reais no Supabase)
  - Integração Claude API (claude-sonnet-4-6)
  - WhatsApp Z-API com Client-Token
  - API `/api/lui/briefing` — **TESTADO E FUNCIONANDO** ✅
  - API `/api/lui/webhook` — aguarda URL pública (Vercel)
- [x] Z-API conectado ao WhatsApp do Cleber — **mensagem de teste enviada** ✅
- [x] Briefing gerado e enviado com sucesso às 17h41 de 11/05/2026 ✅

### ⏳ Próximos passos imediatos
1. **Deploy Vercel** — dar URL pública ao webhook do LUI
2. **Configurar webhook Z-API** → URL Vercel + `/api/lui/webhook`
3. **Aplicar migrations** no Supabase Dashboard
4. **Testar LUI interativo** — mandar mensagem e ele responde com dados reais
5. **Cron N8N** — agendar briefing para todo dia às 7h

---

## 8. ROADMAP COMPLETO

### 🔴 Fase 1 — Fundação
| # | Projeto | Status |
|---|---|---|
| P01 | Schema Supabase | ✅ Criado · ⚠️ Aplicar no dashboard |
| P02 | Conta Azul → Supabase | ✅ Código pronto · ⚠️ Preencher credenciais |
| P03 | SOC → Supabase | ⏳ A fazer |
| P04 | D4sign → Supabase | ⏳ A fazer |

### 🟡 Fase 2 — Agentes e Painel
| # | Projeto | Status |
|---|---|---|
| P05 | Agente LUI | ✅ Pronto · ⚠️ Deploy Vercel pendente |
| P06 | Agente Secretária | ⏳ A fazer |
| P07 | Painel Centro de Comando | 🔨 Base criada · expandir |
| P08 | Agente Financeiro | ⏳ A fazer |
| P09 | Agente Medicina | ⏳ A fazer |
| P10 | Agente Engenharia | ⏳ A fazer |

### 🟢 Fase 3 — Produtos SafeHelp
| # | Projeto | Status |
|---|---|---|
| P11 | SafeChat IA | ⏳ A fazer |
| P12 | SafeDocs | ⏳ A fazer |
| P13 | SafeApp | ⏳ A fazer |

### 🔵 Fase 4 — Expansão
| # | Projeto | Status |
|---|---|---|
| P14 | Pluggy — saldos bancários | ⏳ |
| P15 | Agente Comercial | ⏳ |
| P16 | Agente RH | ⏳ |
| P17 | SafeChat integrado à SafeApp | ⏳ |
| P18 | SST WebScrap prospecção | ⏳ |
| P19 | Integração Unisyst | ⏳ |
| P20 | ERP financeiro próprio | ⏳ longo prazo |

---

## 9. BI — 38 RELATÓRIOS (7 módulos)

### Financeiro (9): FIN·01–09
- Contas a Receber · Saldos Bancários · Fluxo de Caixa · Contas a Pagar
- Honorários Medicina · Raio-X por Unidade · Laudos/Exames Custo
- Mão de Obra · Inadimplência Aging Report

### Medicina (6): MED·01–06
- Consultas por Unidade · Periódicos · ASOs Vencendo · Produtividade
- PCMSO Status · Receita por Tipo de Exame

### Engenharia (5): ENG·01–05
- Panorama Laudos/PCMSO/PGR · Laudos Atrasados · Coletas Custo
- Conformidade NR · Produtividade TST

### Safe+ (4): S+·01–04
- Lucratividade Contratos · Performance Fornecedores · Agendamentos SLA · Cobertura

### SafeT (4): ST·01–04
- Acumulado Anual · Top Clientes · Turmas/Presença · Lucratividade

### RH (4): RH·01–04
- Headcount · Custo Pessoal · Turnover · Absenteísmo

### Comercial (6): COM·01–06
- Pipeline · Comissões · Deslocamentos · Marketing ROI · Churn · Prospecção WebScrap

### Overview / Holding (4): OV·01–04
- Lucratividade por Empresa · DRE Consolidado · Contratos D4sign · Ranking Top 20

---

## 10. DECISÕES TÉCNICAS REGISTRADAS

| Decisão | Escolha | Motivo |
|---|---|---|
| WhatsApp interno (LUI↔Cleber) | Z-API | Rápido, sem aprovação Meta, uso pessoal |
| WhatsApp clientes | Meta API Oficial | Escala, sem risco ban, já comprado |
| Deploy | Vercel | Grátis, integração GitHub, serverless |
| Banco de dados | Supabase | PostgreSQL gerenciado + RLS + realtime |
| LLM | Claude Sonnet 4.6 | Melhor custo/benefício para agentes |
| Orquestração automações | N8N no Mac Mini M4 | Já existente na infra |
| Migrations | SQL puro em supabase/migrations/ | Rastreável no git, portável |

---

*Última atualização: 11/05/2026 — Sessão de desenvolvimento*
