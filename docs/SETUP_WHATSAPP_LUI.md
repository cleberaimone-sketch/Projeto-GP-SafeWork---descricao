# Configuração WhatsApp — Agente LUI

## Passo 1 — Criar conta e instância no Z-API

1. Acesse **z-api.io** e crie sua conta
2. No painel, clique em **"+ Nova Instância"**
3. Escolha o plano (tem opção gratuita para testar)
4. Anote o **Instance ID** e o **Token** da instância criada
   - Ficam em: Painel → sua instância → **Credenciais**

## Passo 2 — Conectar o WhatsApp

1. Na instância Z-API, clique em **"Conectar"**
2. Escaneie o QR Code com o celular do Cleber
   - WhatsApp → 3 pontos → Aparelhos conectados → Conectar aparelho
3. Aguardar status ficar **"Conectado"** ✅

## Passo 3 — Preencher o `.env.local`

Abra `web/.env.local` e preencha:

```env
# Claude / Anthropic
ANTHROPIC_API_KEY=sk-ant-...        # console.anthropic.com → API Keys

# Supabase (service role — dashboard do Supabase → Settings → API)
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# WhatsApp Z-API
WHATSAPP_PROVIDER=zapi
ZAPI_BASE_URL=https://api.z-api.io/instances/SEU_INSTANCE_ID/token/SEU_TOKEN

# Número do Cleber (só dígitos, com DDI+DDD)
CLEBER_WHATSAPP_NUMBER=5545999990000

# Segredo do cron (invente qualquer string)
CRON_SECRET=gpsafework-lui-2026
```

## Passo 4 — Subir o ambiente local

No terminal, dentro da pasta do projeto:

```bash
bash scripts/start-lui-dev.sh
```

O script vai:
- Iniciar o Next.js na porta 3000
- Abrir um túnel ngrok (URL pública temporária)
- Mostrar a URL do webhook para você colar no Z-API

## Passo 5 — Configurar o Webhook no Z-API

1. No painel Z-API → sua instância → **Webhooks**
2. Em **"Ao Receber"**, cole a URL mostrada pelo script:
   ```
   https://xxxx.ngrok-free.app/api/lui/webhook
   ```
3. Salvar

## Passo 6 — Testar

**Teste o briefing manual** (rode no terminal):
```bash
curl -X POST https://xxxx.ngrok-free.app/api/lui/briefing \
  -H "Authorization: Bearer gpsafework-lui-2026" \
  -H "Content-Type: application/json"
```

**Teste o chat**: mande qualquer mensagem WhatsApp do número do Cleber — o LUI responde automaticamente.

---

## Para produção (depois)

Quando deployar no Vercel/Railway:
1. Configure as mesmas env vars no painel do deploy
2. Atualize o webhook do Z-API para a URL de produção
3. Configure o cron no N8N:
   - HTTP POST para `https://seu-dominio.com/api/lui/briefing`
   - Header: `Authorization: Bearer <CRON_SECRET>`
   - Horário: `0 7 * * *` (todo dia às 7h)
