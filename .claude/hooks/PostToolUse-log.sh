#!/usr/bin/env bash
# Layer 3 / Hook: PostToolUse — Log de auditoria
#
# Registra todas as ações sensíveis no arquivo .claude/.audit.log
# Útil para entender o que foi feito numa sessão.
#
# Stdin (JSON): { tool_name, tool_input, tool_response }

set -euo pipefail

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""')
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)

PROJETO_DIR="$(dirname "$(dirname "$(readlink -f "$0" 2>/dev/null || echo "$0")")")"
AUDIT="${PROJETO_DIR}/.audit.log"

case "$TOOL" in
  Bash)
    CMD=$(echo "$INPUT" | jq -r '.tool_input.command // ""' | tr '\n' ' ' | cut -c1-200)
    echo "$TS Bash: $CMD" >> "$AUDIT"
    ;;
  Edit|Write)
    FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')
    echo "$TS $TOOL: $FILE" >> "$AUDIT"
    ;;
esac

# Output silencioso (não interrompe fluxo)
echo '{}'
