# GP OS CORE — PLANO DE ADAPTAÇÃO DO COMMAND CENTER

> Plano técnico sem breaking changes · Versão 1.0 · 2026-06-03

---

## 1. Princípio fundamental

> **Adicionar, nunca substituir.** Cada step de adaptação é um campo nullable, uma tabela nova, uma API adicional. O Command Center continua funcionando em 100% antes, durante e depois.

---

## 2. O que o GP OS Core será

A fonte única da verdade para cadastros, eventos, permissões e auditoria de todo o ecossistema GP SafeWork OS.

### Entidades que o Core gerenciará

| Categoria | Entidades |
|---|---|
| **Estrutura** | empresas_do_grupo, unidades, cnpjs |
| **Pessoas** | usuarios, perfis_de_acesso, clientes, contatos, trabalhadores |
| **Serviços** | servicos, contratos, ordens_de_servico |
| **Operação** | eventos, tarefas, aprovacoes |
| **Auditoria** | logs_de_auditoria |
| **IA** | agentes, memorias_dos_agentes |

### Barramento de eventos

Todos os módulos do OS publicam e consomem eventos via `os_eventos`:

```
lead_criado            → GP Sales IA publica, Command Center exibe
lead_qualificado       → GP Sales IA publica
proposta_gerada        → GP Sales IA publica
venda_fechada          → GP Sales IA publica, Command Center alerta
pagamento_confirmado   → GP ERP Core publica
cliente_criado         → GP OS Core publica (origin: Sales IA)
contrato_gerado        → GP Sales IA / D4sign publica
contrato_assinado      → D4sign publica
ordem_servico_aberta   → GP SST Core publica
exame_agendado         → GP SST Core / Lari publica
visita_tecnica_agendada→ GP SST Core / Dieguito publica
documento_entregue     → GP SST Core / D4sign publica
fatura_gerada          → GP ERP Core publica
pagamento_recebido     → GP ERP Core / Conta Azul publica
alerta_critico         → Qualquer módulo publica, LUI processa
```

---

## 3. Migrations de compatibilidade (sem breaking changes)

### Step 1 — Adicionar `os_global_id` nas tabelas core

```sql
-- Migration: YYYYMMDDHHMMSS_os_global_id_compat.sql
ALTER TABLE empresas     ADD COLUMN IF NOT EXISTS os_global_id uuid;
ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS os_global_id uuid;
ALTER TABLE usuarios     ADD COLUMN IF NOT EXISTS os_global_id uuid;

CREATE INDEX IF NOT EXISTS idx_empresas_os_global     ON empresas(os_global_id)     WHERE os_global_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_funcionarios_os_global ON funcionarios(os_global_id) WHERE os_global_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_usuarios_os_global     ON usuarios(os_global_id)     WHERE os_global_id IS NOT NULL;
```

**Impacto:** zero. Os campos são nullable. Nenhuma query existente precisa mudar.

### Step 2 — Criar tabela `os_eventos`

```sql
-- Migration: YYYYMMDDHHMMSS_os_eventos.sql
CREATE TABLE IF NOT EXISTS os_eventos (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo         text        NOT NULL,
  origem       text        NOT NULL DEFAULT 'command_center',
  payload      jsonb       NOT NULL DEFAULT '{}',
  processado   boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_os_eventos_tipo        ON os_eventos(tipo);
CREATE INDEX IF NOT EXISTS idx_os_eventos_created     ON os_eventos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_os_eventos_processado  ON os_eventos(processado) WHERE NOT processado;

ALTER PUBLICATION supabase_realtime ADD TABLE os_eventos;

GRANT SELECT, INSERT ON os_eventos TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
```

### Step 3 — API de entrada de eventos externos

```
POST /api/os/eventos
  → valida CRON_SECRET ou OS_WEBHOOK_SECRET
  → insere em os_eventos com origem = 'externo'
  → dispara alerta se tipo = 'alerta_critico'
```

---

## 4. Governança dos agentes

Os agentes do Command Center **não operam soltos**. Cada ação segue este fluxo:

```
Usuário / Cron
    ↓
Agente recebe contexto do Supabase
(dados reais, memórias, permissões)
    ↓
Agente gera resposta / executa ação
    ↓
Ação registrada em os_eventos + logs_auditoria
    ↓
Aprovação humana quando necessário
(ações financeiras > R$X, exclusões, envios externos)
```

### Princípios de governança

| Princípio | Implementação |
|---|---|
| **Dados reais** | Contexto sempre carregado do Supabase — sem fictícios |
| **Memória operacional** | `memorias_agentes` persistida entre sessões |
| **Conhecimento técnico** | System prompts com regras de negócio SST embutidas |
| **Permissões** | RLS Supabase + service_role apenas para mutações autorizadas |
| **Tarefas registradas** | Toda ação do agente gera entrada em `os_eventos` |
| **Logs** | `sync_log` + futuro `logs_auditoria` |
| **Auditoria** | Quem pediu, qual agente, qual ação, quando |
| **Aprovação humana** | Ações críticas bloqueadas até confirmação do Cleber |

---

## 5. Catálogo de agentes gestores

| Agente | Papel | Dados que acessa | Ações que pode executar |
|---|---|---|---|
| **LUI** | CEO Virtual · Integrador | Todos os KPIs + alertas + briefings | Consolidar relatórios, encaminhar para agentes, publicar alertas |
| **Plata** | CFO Digital | Lançamentos, saldos, metas, DRE | Analisar DRE, identificar desvios, alertar sobre caixa |
| **Lari** | Gerente Digital Medicina | ASOs, atendimentos SOC, vencimentos | Identificar ASOs vencidos, gerar relatório SOC |
| **Dieguito** | Gerente Digital Engenharia SST | Programas SST, treinamentos NR, vencimentos | Alertar sobre NRs vencidas, cronograma de inspeções |
| **Carlitos** | Gerente Digital Processos | Relatórios estratégicos, processos internos | Gerar relatórios, mapear processos |
| **Luizito** | Gerente Digital Comercial | Contratos, renovações, alertas D4sign | Alertas de contratos parados, pipeline de renovações |
| **Le** | Gerente Digital RH | Headcount, folha, CTSE | Relatórios de pessoal, análise de custo por empresa |
| **Nina** | Secretária Digital | Agenda, tarefas pendentes | Triagem de WhatsApp, agendamentos |
| **SafeChat** | Atendimento Externo | Base de conhecimento SST | Responder clientes sobre NRs, agendar exames |

---

## 6. Riscos técnicos identificados

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| **Supabase Realtime** — limite de conexões simultâneas | Médio | Médio | Usar broadcast channels em vez de postgres_changes onde possível |
| **`os_global_id` órfão** — campo preenchido mas Core não existe | Baixo | Baixo | Campos nullable, queries sempre fazem fallback para ID local |
| **Conflito de schemas** — Sales IA e Command Center com tabelas homônimas | Alto | Alto | Cada módulo tem seu próprio projeto Supabase; comunicação apenas via API/eventos |
| **Overhead de eventos** — `os_eventos` crescendo sem controle | Médio | Médio | Cron de limpeza para eventos `processado = true` com > 90 dias |
| **Governança de agentes** — ação sem auditoria | Médio | Alto | Toda mutação passa por route handler com registro em `os_eventos` |
| **Token Conta Azul** — refresh rotation queima credencial | Alto | Alto | Nunca testar via curl; apenas via `/api/conta-azul/sync` |

---

## 7. Checklist de adaptação (por etapa)

### Etapa 0 — Documentação (esta semana)
- [x] `PLANO_PORTAL_EXECUTIVO_GP_OS.md`
- [x] `GP_OS_CORE_ADAPTATION_PLAN.md`
- [x] Página `/dashboard/os` com arquitetura visual

### Etapa 1 — Compatibilidade (sem breaking changes)
- [ ] Migration `os_global_id` nas tabelas core
- [ ] Migration `os_eventos` com Realtime
- [ ] API `POST /api/os/eventos` (entrada de eventos externos)
- [ ] Feed de eventos no Centro de Comando

### Etapa 2 — Comunicação com Sales IA
- [ ] Sales IA aponta alertas para `/api/lui/alertas`
- [ ] Sales IA publica métricas via `/api/os/eventos`
- [ ] Painel de KPIs do Sales IA no Portal Executivo

### Etapa 3 — GP OS Core em pé
- [ ] Sincronizar `os_global_id` com registros do Core
- [ ] RBAC unificado (roles do Core reconhecidas no Command Center)
- [ ] Feed de eventos cross-módulo em tempo real

---

## 8. O que NÃO fazer (restrições permanentes)

- ❌ Não remover funcionalidades existentes
- ❌ Não alterar integrações sem necessidade (Conta Azul OAuth, SOC SOAP)
- ❌ Não duplicar cadastros — mapear via `os_global_id` quando Core existir
- ❌ Não criar ERP completo agora
- ❌ Não tentar substituir o SOC agora
- ❌ Não copiar código do GP Sales IA para cá
- ❌ Não deixar agente executar ação financeira sem registro em auditoria
