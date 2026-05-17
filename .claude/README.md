# .claude/ — Agent Development Kit do GP SafeWork

> Implementação das **5 camadas** do Agent Development Kit (CLAUDE.md + Skills +
> Hooks + Subagents + Plugins) adaptadas ao projeto GP SafeWork.
>
> Inspiração: `docs/images_docs/the-agent-dev-kit.jpeg`

---

## Visão Geral — As 5 Camadas

```
┌──────────────────────────────────────────────────────────────────────┐
│  L1 · CLAUDE.md           CONSTITUIÇÃO         (sempre carregado)     │
│  L2 · skills/             CONHECIMENTO         (sob demanda)          │
│  L3 · hooks/              GUARDRAILS           (determinístico)        │
│  L4 · agents/             DELEGAÇÃO            (contexto isolado)      │
│  L5 · plugins/            DISTRIBUIÇÃO         (bundle compartilhado)  │
└──────────────────────────────────────────────────────────────────────┘
```

Cada camada resolve um problema diferente, mas elas se combinam para formar
**um agente capaz, seguro e especializado** no domínio deste projeto.

---

## Layer 1 — CLAUDE.md (Memory Layer)

**O que é:** A constituição do agente. Sempre carregada, sempre ativa.

**Como adaptamos:**
- **`/CLAUDE.md`** (raiz do repo) — Stack, arquitetura, naming conventions, repo map, regras
  de arquitetura (Next 16, proxy.ts, etc).
- **`.claude/CLAUDE.md`** (escopo projeto) — Identidades dos 4 agentes (LUI, Plata, Lari,
  Dieguito), regras de domínio (financeiro, medicina, engenharia), padrões de código
  específicos deste repo, lista do que **NUNCA** e do que **SEMPRE** fazer.

**Por que importa:** O Claude não precisa ser lembrado a cada conversa de que
saldos bancários do Conta Azul estão errados, ou que `refresh_token` não deve
ser testado via curl. Está no CLAUDE.md — ele já sabe.

---

## Layer 2 — Skills (Knowledge Layer)

**O que é:** Conhecimento de domínio **carregado sob demanda**. Cada skill tem uma
descrição que o Claude matcha contra a tarefa em mãos e auto-invoca.

**5 skills do projeto** (em `skills/`):

| Skill | Quando dispara | O que ensina |
|---|---|---|
| `soc-api` | trabalhar com SOC, ASOs, agendamentos | máscaras, parsing DD/MM, helpers do client.ts, armadilhas (`empresaTrabalho`, timezone UTC, Pacote ASO duplicado) |
| `conta-azul-oauth` | sincronizar Conta Azul ou depurar invalid_grant | fluxo OAuth Cognito, refresh rotation (CRÍTICO), API v2 endpoints, mapeamento de status |
| `financeiro-regras` | calcular receita/despesa/EBITDA/saldo | filtros obrigatórios, KPIs aprovados/rejeitados, interpretação de saldos negativos, regex de empréstimos |
| `dashboard-pattern` | criar nova tela /dashboard/* | template server+client, paleta slate, filtros via URL, tabular-nums, cores semânticas |
| `supabase-migration` | criar/alterar schema do banco | boilerplate SQL, workflow manual via SQL Editor, NOTIFY pgrst, validação REST |

**Por que importa:** Skills evitam que cada sessão "redescubra" o domínio.
Quando você pede "atualizar dashboard", a skill `dashboard-pattern` é
auto-invocada — Claude já sabe a paleta exata e o padrão server/client.

---

## Layer 3 — Hooks (Guardrail Layer)

**O que é:** Shell scripts que disparam em eventos do agente. **Determinístico**,
não é IA. Bloqueia ou observa ações.

**3 hooks ativos** (em `hooks/`):

| Hook | Evento | O que faz |
|---|---|---|
| `PreToolUse-guardrails.sh` | antes de Bash | Bloqueia: `rm -rf` em paths críticos · `git push --force main` · `git reset --hard` solto · `curl auth.contaazul.com/oauth2/token` (queima refresh token) · `DROP/TRUNCATE` direto |
| `PostToolUse-log.sh` | depois de Bash/Edit/Write | Loga em `.audit.log` — auditoria leve |
| `SessionStart-context.sh` | nova sessão | Injeta git status + último commit + lista de skills/agents disponíveis |

**Registry em `settings.json`:**
```json
"hooks": {
  "PreToolUse":   [{ "matcher": "Bash",            "hooks": [{"type":"command","command":".claude/hooks/PreToolUse-guardrails.sh"}] }],
  "PostToolUse":  [{ "matcher": "Bash|Edit|Write", "hooks": [{"type":"command","command":".claude/hooks/PostToolUse-log.sh"}] }],
  "SessionStart": [{ "matcher": "",                "hooks": [{"type":"command","command":".claude/hooks/SessionStart-context.sh"}] }]
}
```

**Por que importa:** Hooks transformam "boas práticas" em **regras determinísticas**.
O Claude pode esquecer de não testar OAuth via curl; o hook **bloqueia** mesmo assim.

---

## Layer 4 — Subagents (Delegation Layer)

**O que é:** Agentes com **janela de contexto própria**. Você delega trabalho
("revise meu diff") e ele retorna **uma única mensagem** com o resultado — sem
poluir a sessão principal.

**4 subagents** (em `agents/`):

| Subagent | Quando invocar | Função |
|---|---|---|
| `code-reviewer` | terminou feature, antes de commit | Revisa diff contra convenções (Next 16, paleta, regras financeiras) e retorna problemas categorizados |
| `migration-applier` | precisar criar tabela/view | Cria arquivo SQL, mostra para colar no Studio, valida via REST após aplicação |
| `financial-auditor` | "número errado" no dashboard | Cruza dados via Supabase, identifica filtro faltando ou regime errado, sugere fix |
| `safe-deploy` | "vamos deployar" | Pré-checagem, type-check leve, commit semântico, push pra Vercel |

**Como invocar:** Use a Agent Tool com `subagent_type: "code-reviewer"`. O subagent
roda em isolamento e retorna ao final.

**Por que importa:** Tarefas longas (revisar 5 arquivos, validar 10 cálculos) não
consomem a janela de contexto principal. O subagent traz só a resposta final.

---

## Layer 5 — Plugins (Distribution Layer)

**O que é:** Bundle versionado com skills + agents + hooks + commands. Distribuível
para outros repos ou para o time.

**1 plugin** (em `plugins/gp-safework-toolkit/`):
- `plugin.json` — manifest declarando o que o pacote inclui
- `README.md` — instruções de instalação e atualização

**O que o plugin empacota:**
- 5 skills (Layer 2)
- 4 subagents (Layer 4)
- 3 hooks (Layer 3)
- Referência a CLAUDE.md (Layer 1)

**Por que importa:** Quando outro membro do time (ou outro repo do grupo)
precisar dos mesmos padrões, basta copiar `.claude/` inteiro — todo o
conhecimento e guardrails vêm junto. **Um install, time inteiro nivelado.**

---

## Fluxo prático: como as camadas trabalham juntas

Cenário: você pede *"crie um dashboard de inspeções para o Dieguito"*.

```
1. SessionStart hook (L3) injeta contexto (git status, skills disponíveis)
2. CLAUDE.md (L1) lembra o agente das convenções (Next 16, paleta slate, naming)
3. Skill dashboard-pattern (L2) auto-carrega — template server/client, paleta, helpers
4. Skill supabase-migration (L2) carrega quando criar tabela `inspecoes`
5. Skill soc-api (L2) carrega se precisar puxar dados do SOC
6. Subagent code-reviewer (L4) é invocado antes do commit pra revisar
7. PreToolUse hook (L3) bloqueia qualquer `rm -rf` acidental
8. Subagent safe-deploy (L4) faz type-check + commit + push pra Vercel
9. PostToolUse hook (L3) registra tudo em .audit.log
```

Cada camada faz **uma coisa bem**. Combinadas, viram um agente especialista
no projeto GP SafeWork.

---

## Manutenção

### Adicionar nova skill
```bash
mkdir -p .claude/skills/<nome-skill>
# criar .claude/skills/<nome-skill>/SKILL.md com frontmatter (name + description)
```

### Adicionar novo subagent
```bash
# criar .claude/agents/<nome>.md com frontmatter (name + description + tools)
```

### Adicionar novo hook
```bash
# criar .claude/hooks/<Evento>-<nome>.sh
chmod +x .claude/hooks/<Evento>-<nome>.sh
# registrar em .claude/settings.json
```

### Atualizar o plugin
- Toda vez que adicionar/remover componente, atualizar `plugins/gp-safework-toolkit/plugin.json`
- Bump da `version` (semver)

---

## Documentação visual

Diagramas originais do Agent Development Kit estão em:
- `docs/images_docs/the-agent-dev-kit.jpeg` — visão geral
- `docs/images_docs/layer1.jpeg` — CLAUDE.md
- `docs/images_docs/layer2.jpeg` — Skills
- `docs/images_docs/layer3.jpeg` — Hooks
- `docs/images_docs/layer4.jpeg` — Subagents
- `docs/images_docs/layer5.jpeg` — Plugins
