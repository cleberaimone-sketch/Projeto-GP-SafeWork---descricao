# .claude/CLAUDE.md — Regras específicas deste repo

> **Layer 1 (escopo projeto)**. Sobrepõe ao global `~/.claude/CLAUDE.md`.
> Tudo aqui é a verdade para o projeto GP SafeWork.

## Identidades dos agentes (Centro de Comando)

| Agente | Papel | Dashboard | Personalidade |
|---|---|---|---|
| **LUI** | CEO virtual / War Room | `/dashboard/lui` | Estratégica, integradora, encaminha pra agentes especializados |
| **Plata** | CFO / Financeiro | `/dashboard/financeiro` | Direta, número-first, foco em caixa e rentabilidade |
| **Lari** | Medicina Ocupacional | `/dashboard/medicina` | Cuidadosa, técnica em saúde, prazos eSocial |
| **Dieguito** | Engenharia de Segurança | `/dashboard/engenharia` | Operacional, foco em normas (NR), inspeções |

Cada agente fala em primeira pessoa quando responde no seu dashboard.

## Regras de domínio (negócio)

### Financeiro
- Sempre filtrar transferências internas antes de qualquer cálculo de receita/despesa
- Saldos bancários: somente contas em `contas_bancarias_ativas` (view `v_saldos_ativos`)
- Conta Modelo: ignorar saldo (fictícia); manter lançamentos para DRE
- KPIs do Cockpit (ordem importa): Receita, Despesa, Lucro, Margem, Atrasados, Empréstimos
- KPIs proibidos: Caixa Líquido c/ cheque especial, Cobertura de Folha, Custo Cheque Especial

### Medicina (SOC)
- **Consulta Ocupacional / Clínica = ASO** — usar `isConsultaOcupacional()` normalizando acentos
- ASO Vencido: > 365 dias sem consulta clínica
- ASO Pendente: registrado mas `SAIASO` vazio (aguardando assinatura médica)
- Tipos de ASO: Admissional, Demissional, Periódico, Retorno, Mudança de Função
- Clínicas: Medianeira, Foz, Santa Helena, Londrina, New Life, Credenciada

### Engenharia
- Programas: PCMSO (médico), PGR (gerencial), PCMAT (construção)
- NRs: monitorar vencimento de treinamentos (NR-10, NR-35, NR-33, etc)

## Padrões de código deste projeto

### Criar novo dashboard
1. `app/dashboard/<area>/page.tsx` — server component (queries paralelas)
2. `app/dashboard/<area>/<Area>Client.tsx` — client component (`'use client'`)
3. Tipos exportados do client são importados no server
4. Filtros via `useSearchParams` + `router.push()`
5. Estilo: bg-slate-950, cards bg-slate-900, borders slate-800

### Criar nova migration
1. Arquivo em `supabase/migrations/YYYYMMDDHHMMSS_nome.sql`
2. Sempre `CREATE TABLE IF NOT EXISTS` e índices com `IF NOT EXISTS`
3. `GRANT` explícito para `anon, authenticated, service_role`
4. Terminar com `NOTIFY pgrst, 'reload schema';`
5. Pedir ao usuário para colar no SQL Editor (MCP indisponível)

### Adicionar nova API route
1. `app/api/<area>/<endpoint>/route.ts`
2. Sempre validar autenticação primeiro: `createClient()` + `auth.getUser()`
3. Service role só para mutações que precisam burlar RLS

## Convenções de commit
- Prefixos: `feat(area):`, `fix(area):`, `refactor(area):`, `docs:`
- Mensagem curta no título, detalhes no corpo
- Co-Authored-By: Claude no rodapé
- Push direto pra `main` (sem PR — projeto solo)

## O que NUNCA fazer
- ❌ Testar `refresh_token` do Conta Azul via curl (Cognito rotaciona = queima)
- ❌ Mostrar saldos de contas fora de `v_saldos_ativos` nos dashboards
- ❌ Contar transferências internas como receita/despesa
- ❌ Re-introduzir KPIs rejeitados pelo Cleber (Caixa Líquido c/ CE, Cobertura Folha)
- ❌ Usar `middleware.ts` (Next 16 → `proxy.ts`)
- ❌ Mockar dados em testes — usar dados reais do Supabase

## O que SEMPRE fazer
- ✅ Aplicar `filtrarParaDRE()` ou `filtrarParaFluxoCaixa()` antes de calcular
- ✅ Commitar e fazer push após cada feature (deploy automático Vercel)
- ✅ Salvar regras de negócio aprendidas em `~/.claude/projects/.../memory/`
- ✅ Tipar exports compartilhados entre server↔client component
- ✅ Padronizar nomenclatura: "Consultas Realizadas" (não "ASOs Realizados" nem "Atendimentos")
