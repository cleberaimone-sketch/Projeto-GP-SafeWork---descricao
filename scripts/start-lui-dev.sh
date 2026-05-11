#!/bin/bash
# ============================================================
# start-lui-dev.sh
# Sobe o Next.js + ngrok e mostra a URL do webhook para o Z-API
# ============================================================

set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WEB_DIR="$PROJECT_DIR/web"

echo ""
echo "🚀 GP SafeWork — LUI Dev Setup"
echo "================================"

# 1. Verifica .env.local
if [ -z "$ANTHROPIC_API_KEY" ] && ! grep -q "ANTHROPIC_API_KEY=sk-" "$WEB_DIR/.env.local" 2>/dev/null; then
  echo ""
  echo "⚠️  ANTHROPIC_API_KEY não configurada em web/.env.local"
  echo "   Acesse: https://console.anthropic.com → API Keys"
  echo ""
fi

# 2. Sobe o Next.js em background
echo "▶  Iniciando Next.js na porta 3000..."
cd "$WEB_DIR"
npm run dev &
NEXT_PID=$!

# Aguarda Next.js subir
sleep 4

# 3. Sobe o ngrok
echo "▶  Abrindo túnel ngrok..."
ngrok http 3000 --log=stdout &
NGROK_PID=$!

# Aguarda ngrok iniciar
sleep 3

# 4. Pega a URL pública do ngrok
NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | python3 -c "
import sys, json
data = json.load(sys.stdin)
tunnels = data.get('tunnels', [])
for t in tunnels:
    if t.get('proto') == 'https':
        print(t['public_url'])
        break
" 2>/dev/null)

echo ""
echo "================================"
echo "✅ Tudo rodando!"
echo ""
echo "🔗 URL do Webhook para o Z-API:"
echo "   ${NGROK_URL}/api/lui/webhook"
echo ""
echo "📋 Cole essa URL em:"
echo "   Z-API → sua instância → Webhooks → Ao Receber"
echo ""
echo "🧪 Para testar o briefing manualmente:"
echo "   curl -X POST ${NGROK_URL}/api/lui/briefing \\"
echo "     -H 'Authorization: Bearer \$CRON_SECRET'"
echo ""
echo "Pressione Ctrl+C para encerrar tudo."
echo "================================"
echo ""

# Aguarda até Ctrl+C
trap "kill $NEXT_PID $NGROK_PID 2>/dev/null; echo 'Encerrado.'" EXIT
wait
