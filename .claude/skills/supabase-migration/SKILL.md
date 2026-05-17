---
name: supabase-migration
description: Como criar e aplicar migrations no Supabase deste projeto — sem MCP (que está sem permissão), via SQL Editor manual. Boilerplate de tabelas, índices, views, grants e o NOTIFY pgrst reload. Use quando precisar criar/alterar tabela, view, função, índice ou política RLS.
---

# Skill: Supabase Migration

## Quando usar
- Criar nova tabela, view, índice, função ou trigger
- Alterar schema (ADD COLUMN, ALTER, etc)
- Configurar RLS (Row Level Security)
- Conceder/revogar permissões

## ⚠️ MCP Supabase indisponível
O `mcp__claude_ai_Supabase__apply_migration` retorna "You do not have permission to perform this action". A `supabase` CLI também não está instalada.

**Fluxo atual** (manual):
1. Eu (Claude) crio o arquivo SQL em `supabase/migrations/YYYYMMDDHHMMSS_descricao.sql`
2. Eu mostro o SQL ao usuário em bloco de código
3. Usuário cola no **SQL Editor** do Supabase Studio:
   https://supabase.com/dashboard/project/jdnwsmbxnjwoswcdktpx/sql/new
4. Usuário clica Run e me confirma o resultado
5. Eu valido via REST se a tabela está acessível

## Template de migration

```sql
-- ============================================================
-- <Título da migration>
-- ============================================================
-- Descrição: o que essa migration faz e por quê

CREATE TABLE IF NOT EXISTS nome_tabela (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid REFERENCES empresas(id) ON DELETE CASCADE,
  campo_texto   text NOT NULL,
  campo_num     numeric(15,2) NOT NULL DEFAULT 0,
  campo_enum    text NOT NULL CHECK (campo_enum IN ('valor1', 'valor2')),
  ativo         boolean NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

-- Índices (sempre IF NOT EXISTS pra ser idempotente)
CREATE INDEX IF NOT EXISTS idx_nome_tabela_empresa ON nome_tabela(empresa_id) WHERE ativo;
CREATE UNIQUE INDEX IF NOT EXISTS idx_nome_tabela_unique ON nome_tabela(empresa_id, campo_texto);

-- Permissões (SEMPRE conceder após criar — senão PostgREST não vê)
GRANT SELECT, INSERT, UPDATE, DELETE ON nome_tabela TO anon, authenticated, service_role;

-- Comentários (boa documentação no DB)
COMMENT ON TABLE nome_tabela IS 'Descrição resumida do que armazena';
COMMENT ON COLUMN nome_tabela.campo_enum IS 'Valores possíveis: valor1, valor2';

-- Recarregar schema PostgREST (CRÍTICO — senão API REST não vê a tabela)
NOTIFY pgrst, 'reload schema';
```

## Para Views

```sql
CREATE OR REPLACE VIEW v_minha_view AS
SELECT ...
FROM tabela_a a
LEFT JOIN tabela_b b ON ...
WHERE a.ativo = true;

-- Views EXIGEM GRANT explícito (não herdam da tabela base)
GRANT SELECT ON v_minha_view TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
```

## ⚠️ Armadilhas comuns

### 1. PostgREST schema cache
Após criar tabela/view, o PostgREST não vê até receber `NOTIFY pgrst, 'reload schema';`.
Se esquecer, a consulta REST retorna `PGRST205: Could not find the table`.

### 2. Multi-statement no SQL Editor
O Supabase Studio executa o script todo em transação. Se um statement falhar no meio, **tudo é
rolled back**. Mas o `SELECT` final pode retornar resultado mesmo se a transação falhou — sempre
verificar contagem ou usar `\d tabela`.

### 3. UNIQUE com NULL
NULL em `UNIQUE` não bate com NULL — múltiplas linhas com NULL passam. Para tratar NULL como
"caso distinto":
```sql
CREATE UNIQUE INDEX idx_unique ON tabela (COALESCE(coluna_nullable, '00000000-0000-0000-0000-000000000000'::uuid), outra_coluna);
```

### 4. RLS (Row Level Security)
Tabelas que precisam de RLS:
```sql
ALTER TABLE nome_tabela ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_authenticated" ON nome_tabela
  FOR SELECT TO authenticated
  USING (true);
```

Mas o projeto atual roda **muito com service_role** (que ignora RLS), então RLS não tem sido
prioridade. Pensar nisso depois quando for multi-tenant.

### 5. JSONB vs JSON
Preferir `jsonb` (binário, indexável). `json` (texto) só para retenção fiel.

### 6. Timestamps com TZ
Sempre `timestamptz`, nunca `timestamp` (sem TZ). PostgreSQL armazena UTC, converte na leitura.

## Convenções deste projeto

- **Nome de arquivo**: `YYYYMMDDHHMMSS_descricao_curta.sql`
  Exemplo: `20260516000001_metas_orcamentarias.sql`
- **Tabelas em snake_case plural**: `empresas`, `lancamentos_financeiros`, `metas_orcamentarias`
- **Colunas em snake_case**: `data_vencimento`, `valor_meta`
- **PKs sempre uuid**: `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- **FKs com ON DELETE CASCADE** quando filho não existe sem pai
- **Timestamps**: `criado_em` e `atualizado_em` (não `created_at`/`updated_at` — convenção do projeto)

## Validação pós-aplicação

Após o usuário rodar a migration, eu valido via REST:
```bash
SUPA_URL=$(grep NEXT_PUBLIC_SUPABASE_URL .env.local | cut -d= -f2)
SUPA_KEY=$(grep SUPABASE_SERVICE_ROLE_KEY .env.local | cut -d= -f2)
curl -s "${SUPA_URL}/rest/v1/nome_tabela?select=count" \
  -H "apikey: ${SUPA_KEY}" -H "Authorization: Bearer ${SUPA_KEY}" \
  -H "Prefer: count=exact" -I 2>&1 | grep -i content-range
```

Se retornar HTTP 200 + content-range = tabela visível e funcional.
Se retornar PGRST205 = falta `NOTIFY pgrst, 'reload schema'`.

## Tabelas-chave já existentes

| Tabela | Função |
|---|---|
| `empresas` | 10 empresas do grupo com `nome`, `nome_curto`, `id` |
| `lancamentos_financeiros` | 48k+ registros do Conta Azul + futuros |
| `saldos_bancarios` | Saldos brutos do Conta Azul (filtrar via view) |
| `contas_bancarias_ativas` | 17 contas reais (chave: empresa_id + numero_cc) |
| `v_saldos_ativos` (VIEW) | Junta as 2 acima — usar essa, não a `saldos_bancarios` |
| `categorias_excluidas` | 3 variantes de "Transferência interna" |
| `metas_orcamentarias` | Plano orçamentário (empresa × ano × mês × categoria) |
| `conta_azul_tokens` | OAuth refresh_token por empresa |
| `sync_log` | Histórico de syncs (Conta Azul, SOC) |
| `conversas_ia` | Mensagens do chat com cada agente IA |
| `memorias_agentes` | Aprendizados dos agentes (LUI, Plata, Lari, Dieguito) |
