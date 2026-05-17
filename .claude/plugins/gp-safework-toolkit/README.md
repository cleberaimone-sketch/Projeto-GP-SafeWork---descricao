# gp-safework-toolkit

> Plugin do Agent Development Kit que empacota tudo que o agente precisa saber
> para trabalhar no projeto GP SafeWork.

## O que inclui

### 🧠 Skills (5)
- `soc-api` — integração SOC ExportaDados (máscaras, parsing, armadilhas)
- `conta-azul-oauth` — OAuth Cognito + sync seguro (refresh rotation)
- `financeiro-regras` — DRE/Fluxo de Caixa filtrando ruído do Conta Azul
- `dashboard-pattern` — padrão Next 16 server+client com paleta slate
- `supabase-migration` — boilerplate SQL e workflow manual via Studio

### 🤖 Subagents (4)
- `code-reviewer` — revisa diff contra convenções
- `migration-applier` — guia aplicar migration via SQL Editor
- `financial-auditor` — valida números no dashboard financeiro
- `safe-deploy` — type-check leve + commit semântico + push

### 🛡️ Hooks (3)
- `PreToolUse-guardrails` — bloqueia rm -rf, force push, curl OAuth queimando token
- `PostToolUse-log` — auditoria em .audit.log
- `SessionStart-context` — injeta git status + layers ao abrir sessão

## Instalação

### Em outro repo:
```bash
# 1. Copiar .claude/ inteiro
cp -r .claude /caminho/repo-destino/

# 2. Tornar hooks executáveis
chmod +x /caminho/repo-destino/.claude/hooks/*.sh

# 3. Configurar registry de hooks
# (settings.json deste plugin contém os matchers)
```

### Dependências
- Claude Code >= 1.0
- Node 20+
- `jq` (parse JSON dos hooks)
- `curl` (validação via REST)
- `git`

## Como funciona o "marketplace"

Hoje **não há marketplace público** para esse plugin. É só estrutural,
seguindo o padrão Layer 5 do Agent Development Kit. Quando o Anthropic
liberar uma marketplace oficial, publicaremos aqui.

Por enquanto: clone, copie, ajuste paths.

## Atualização

Quando ajustes nas skills/agents/hooks forem feitos no projeto principal,
basta sincronizar:
```bash
rsync -av --delete .claude/ outro-repo/.claude/
```

## Manutenção

Owners: Cleber (CEO) + Claude (assistente).

Issues, sugestões e novas skills: abrir issue no repo principal:
`https://github.com/cleberaimone-sketch/Projeto-GP-SafeWork---descricao`
