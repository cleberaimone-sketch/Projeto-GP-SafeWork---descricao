#!/usr/bin/env bash
# Layer 3 / Hook: PreToolUse — Guardrails para Bash
#
# Bloqueia comandos perigosos ANTES de executar:
#  - rm -rf de paths críticos
#  - git push --force em main
#  - git reset --hard (sem confirmação)
#  - curl direto no endpoint OAuth do Conta Azul (queima token)
#  - drop/truncate via psql direto
#
# Stdin (JSON): { tool_name, tool_input: { command, ... } }
# Saída JSON: { "decision": "block" | "allow", "reason": "..." }

set -euo pipefail

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""')

# Só age sobre Bash
if [ "$TOOL" != "Bash" ]; then
  echo '{"decision":"allow"}'
  exit 0
fi

CMD=$(echo "$INPUT" | jq -r '.tool_input.command // ""')

block() {
  local reason="$1"
  jq -n --arg r "$reason" '{
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "deny",
      "permissionDecisionReason": $r
    }
  }'
  exit 0
}

# ── Regras de bloqueio ──────────────────────────────────────────────

# rm -rf em paths críticos
if echo "$CMD" | grep -qE 'rm[[:space:]]+(-[rRfF]+[[:space:]]+)?(/|~/|\$HOME|/Users/|/Library)'; then
  block "rm -rf em diretório crítico — confirmar manualmente."
fi

# git push --force em main/master
if echo "$CMD" | grep -qE 'git[[:space:]]+push[[:space:]].*(-f|--force).*(main|master)'; then
  block "git push --force em main bloqueado. Use --force-with-lease ou confirme com o usuário."
fi

# git reset --hard sem ref específica
if echo "$CMD" | grep -qE 'git[[:space:]]+reset[[:space:]]+--hard[[:space:]]*$'; then
  block "git reset --hard sem ref especificada — destrói trabalho não commitado."
fi

# curl direto no OAuth do Conta Azul (queima refresh_token)
if echo "$CMD" | grep -qE 'curl.*auth\.contaazul\.com/oauth2/token'; then
  block "NUNCA testar refresh_token via curl — Cognito rotaciona e queima o token. Use a UI /dashboard/financeiro/sync."
fi

# DROP TABLE / TRUNCATE direto (não via migration)
if echo "$CMD" | grep -qiE '(DROP[[:space:]]+TABLE|TRUNCATE[[:space:]]+TABLE)' | grep -v 'migrations'; then
  block "DROP/TRUNCATE direto bloqueado — use migration em supabase/migrations/."
fi

echo '{"decision":"allow"}'
