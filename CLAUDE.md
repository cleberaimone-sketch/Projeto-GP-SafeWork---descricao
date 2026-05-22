# GP SafeWork — Projeto de IA e Automação

> **Layer 1 / Memory Layer** do Agent Development Kit.
> Sempre carregado · Sempre ativo · A constituição deste projeto.

## Visão geral
Holding de SST (Saúde e Segurança do Trabalho) com 8 empresas, ~50 pessoas.
Objetivo: ecossistema de agentes IA + Centro de Comando (war room).

## Stack
- **Frontend:** Next.js 16 (App Router · Turbopack) · React 19 · TailwindCSS 4
- **Banco:** Supabase (project `jdnwsmbxnjwoswcdktpx`) · PostgreSQL 15
- **Automações:** N8N / Make (Mac Mini M4 local)
- **IA:** Claude API (Anthropic, Opus 4.7 / Sonnet 4.6)
- **WhatsApp:** Z-API / Evolution API
- **Deploy:** Vercel (projeto-gp-safe-work-descricao.vercel.app) — URL oficial de produção
- **Integrações ativas:** SOC (ExportaDados), Conta Azul (OAuth Cognito), D4sign

## Arquitetura

### Estrutura do repo (repo.map)
```
.
├── CLAUDE.md                  ← este arquivo (Layer 1 — Memória)
├── .claude/                   ← Agent Development Kit deste repo
│   ├── CLAUDE.md              ← regras específicas (override do global)
│   ├── skills/                ← Layer 2 — Skills
│   ├── hooks/                 ← Layer 3 — Hooks
│   ├── agents/                ← Layer 4 — Subagents
│   ├── plugins/               ← Layer 5 — Plugins (futuro)
│   └── settings.json          ← config + registry de hooks
├── web/                       ← Next.js app
│   ├── app/                   ← App Router
│   │   ├── api/               ← API routes (server actions, webhooks)
│   │   └── dashboard/         ← dashboards por departamento
│   │       ├── financeiro/    ← Plata (CFO)
│   │       ├── medicina/      ← Lari (medicina ocupacional)
│   │       ├── engenharia/    ← Dieguito (engenharia/SST)
│   │       └── lui/           ← LUI (CEO, war room)
│   ├── lib/                   ← clients e helpers reusáveis
│   │   ├── conta-azul/        ← OAuth + REST do Conta Azul
│   │   ├── soc/               ← ExportaDados SOC
│   │   ├── financeiro/        ← regras de negócio financeiras
│   │   └── supabase/          ← client server/browser
│   ├── proxy.ts               ← Next 16 substituto de middleware
│   └── package.json
├── supabase/migrations/       ← SQL migrations (aplicar via SQL Editor)
└── docs/                      ← documentação visual e técnica
```

### Naming conventions (naming.conventions)
- **Páginas server (server components)**: `page.tsx` (lowercase, App Router convention)
- **Componentes client**: `PascalCase.tsx` (ex: `CockpitCFO.tsx`, `OrcamentoClient.tsx`)
- **Libs/helpers**: `kebab-case.ts` (ex: `regras.ts`, `client.ts`)
- **Variáveis**: `camelCase` em TS, `snake_case` em SQL/JSON do banco
- **Tabelas Supabase**: `snake_case` plural (`empresas`, `lancamentos_financeiros`)
- **Migrations**: `YYYYMMDDHHMMSS_descricao_curta.sql`

### Test expectations (test.expectations)
- **UI/visual**: validado manualmente em produção (Vercel) — não há test runner setado
- **TypeScript**: build do Next.js (`next build`) é o type-checker — falha = bloqueio
- **Hot path crítico**: testar OAuth do Conta Azul **só via sync** (refresh rotation queima token)
- **Migrations**: revisar SQL antes de pedir aplicação; rodar primeiro em SQL Editor

### Architecture rules (architecture.rules)
- **Next.js 16**: usar `proxy.ts` em vez de `middleware.ts` (deprecated)
- **Server vs Client**: `'use client'` só quando precisa state/effect/event; default = server
- **Supabase**: queries pesadas no server component, mutations via route handler `/api/`
- **MCP indisponível**: aplicar migrations manualmente via SQL Editor do Supabase Studio
- **OAuth Conta Azul**: jamais testar refresh_token via curl (Cognito rotaciona = queima)
- **Filtragem financeira**: aplicar `filtrarParaDRE()` ou `filtrarParaFluxoCaixa()` antes de qualquer cálculo

## Variáveis de ambiente
Ver `.env.local` (não commitado). Copiar de `.env.example` ao clonar.

## Repositório
`https://github.com/cleberaimone-sketch/Projeto-GP-SafeWork---descricao`

## Roadmap
- **Fase 1 — Fundação:** Schema Supabase + Integrações (Conta Azul, SOC, D4sign) — ✅ feito
- **Fase 2 — Agentes + Painel:** LUI, Secretária, War Room, Agentes departamentais — 🟡 em andamento
- **Fase 3 — SafeHelp:** SafeChat, SafeDocs, SafeApp — ⏳ planejado
- **Fase 4 — Expansão:** Pluggy, Unisyst, ERP próprio — ⏳ planejado

## Agent Development Kit (este repo)
- **Layer 1** Memória: este arquivo
- **Layer 2** Skills: `.claude/skills/` — conhecimento de domínio carregado sob demanda
- **Layer 3** Hooks: `.claude/hooks/` — guardrails determinísticos
- **Layer 4** Subagents: `.claude/agents/` — delegação especializada
- **Layer 5** Plugins: `.claude/plugins/` — distribuição (estrutural)

Veja `.claude/README.md` para detalhes de cada camada.

## Documentação completa
Ver `docs/CONTEXT_GP_SAFEWORK.md` (contexto geral) e `docs/images_docs/` (diagramas do AKD).
