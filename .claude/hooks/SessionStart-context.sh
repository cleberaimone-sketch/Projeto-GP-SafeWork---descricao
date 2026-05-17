#!/usr/bin/env bash
# Layer 3 / Hook: SessionStart — Injeta contexto inicial
#
# Roda quando uma nova sessão Claude Code começa no projeto.
# Injeta no contexto:
#  - último commit
#  - status do git (arquivos modificados)
#  - quantidade de lançamentos no banco (se acessível)
#
# Saída JSON: { "hookSpecificOutput": { "additionalContext": "..." } }

set -euo pipefail

PROJETO_DIR="$(dirname "$(dirname "$(readlink -f "$0" 2>/dev/null || echo "$0")")")"
cd "$PROJETO_DIR" || exit 0

ULTIMO_COMMIT=$(git log -1 --format="%h %s (%ar)" 2>/dev/null || echo "—")
BRANCH=$(git branch --show-current 2>/dev/null || echo "—")
MODIFICADOS=$(git status --short 2>/dev/null | grep -v '^??' | wc -l | tr -d ' ')
UNTRACKED=$(git status --short 2>/dev/null | grep -c '^??' || echo "0")

CONTEXT="🚀 GP SafeWork — Agent Development Kit ativo
─────────────────────────────────────────────
Branch: $BRANCH
Último commit: $ULTIMO_COMMIT
Arquivos modificados: $MODIFICADOS  ·  Untracked: $UNTRACKED

Layers carregadas:
  ✓ L1 CLAUDE.md (raiz + .claude/CLAUDE.md)
  ✓ L2 Skills    (.claude/skills/ — 5 skills disponíveis)
  ✓ L3 Hooks     (.claude/hooks/ — guardrails ativos)
  ✓ L4 Agents    (.claude/agents/ — subagents especializados)
  ✓ L5 Plugins   (.claude/plugins/ — manifest exemplo)

Skills do projeto:
  • soc-api              — integração SOC ExportaDados
  • conta-azul-oauth     — OAuth + sync Conta Azul (refresh rotation)
  • financeiro-regras    — regras de DRE, fluxo de caixa, KPIs aprovados
  • dashboard-pattern    — padrão de criação de dashboards
  • supabase-migration   — boilerplate SQL + workflow manual
"

jq -n --arg ctx "$CONTEXT" '{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": $ctx
  }
}'
