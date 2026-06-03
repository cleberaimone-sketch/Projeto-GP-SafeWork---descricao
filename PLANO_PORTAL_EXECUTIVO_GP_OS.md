# PLANO DO PORTAL EXECUTIVO — GP SafeWork OS

> Documento estratégico · Versão 1.0 · 2026-06-03

---

## 1. Posicionamento oficial

O projeto **Centro de Comando GP SafeWork** passa a ser o módulo **GP Command Center / Portal Executivo** dentro do ecossistema **GP SafeWork OS**.

**Não é uma reescrita. Não é uma fusão. É uma elevação de escopo.**

O código existente, integrações, agentes e banco de dados permanecem intactos. O que muda é o enquadramento: este projeto é agora a **interface executiva central** do GP SafeWork OS.

---

## 2. O que é o GP SafeWork OS

Uma arquitetura modular que substituirá gradualmente os sistemas atuais (SOC, Conta Azul, Unisyst, Pipefy, RD Station, D4sign, planilhas) com módulos próprios conectados a uma fonte única de verdade: o **GP OS Core**.

### Missão
Automatizar a operação da holding, suportar crescimento nacional, novos CNPJs, rede de parceiros e produtos digitais em SST — com IA nativa em todas as camadas.

### Módulos do ecossistema

| Módulo | Papel | Status |
|---|---|---|
| **GP OS Core** | Fonte única da verdade: cadastros, eventos, permissões, auditoria | Em design |
| **GP Command Center** | Portal executivo: dashboards, agentes gestores, war room | ✅ Ativo |
| **GP Sales IA** | Máquina comercial: leads, propostas, contratos, follow-up | Em desenvolvimento |
| **GP ERP Core** | Financeiro próprio: DRE, fluxo de caixa, notas, fiscal | Planejado |
| **GP SST Core** | Operações SST: ASOs, treinamentos, PCMSO, PGR | Planejado |
| **GP Client Portal** | Portal do cliente: acesso a documentos, histórico, agendamentos | Planejado |
| **GP Field App** | App mobile para técnicos e trabalhadores | Planejado |
| **GP Network** | Gestão da rede credenciada Safe+ | Planejado |
| **GP AI Agents** | Camada de agentes IA: LUI, Plata, Lari, Dieguito e outros | ✅ Ativo |

---

## 3. Papel do GP Command Center dentro do OS

### O que o Portal Executivo entrega

O GP Command Center é a **tela de controle** do ecossistema. Não processa dados — consolida e exibe. Não vende — mostra a esteira comercial. Não faz RH — apresenta indicadores.

```
GP OS Core (dados brutos)
    ↓  eventos
GP Command Center (decisão executiva)
    ↓  ações
Módulos especializados (execução)
```

### Responsabilidades permanentes
- Dashboard executivo consolidado (visão CEO)
- Chat com agentes gestores (LUI, Plata, Lari, Dieguito, Le, Luizito)
- Briefing diário automatizado
- Monitoramento de alertas críticos em tempo real
- Visualização do roadmap e status dos módulos do OS

### O que NÃO é responsabilidade deste módulo
- Processar vendas (GP Sales IA)
- Emitir notas fiscais (GP ERP Core)
- Executar laudos SST (GP SST Core)
- Gerir agendamentos de campo (GP Field App)

---

## 4. Relação com o GP Sales IA

O GP Sales IA é o **motor comercial autônomo** do ecossistema. Tem sua própria base de código, banco Supabase e agentes.

A comunicação entre os dois módulos se dará via:
1. **Eventos do GP OS Core** — o Sales IA publica eventos (`lead_criado`, `venda_fechada`, `contrato_gerado`) que o Command Center exibe no feed
2. **API de métricas** — o Command Center consulta KPIs consolidados do Sales IA (MRR, taxa de conversão, pipeline)
3. **Alertas** — o Sales IA chama `/api/lui/alertas` com alertas que merecem atenção executiva

**Nunca:** copiar código do Sales IA para dentro do Command Center, ou vice-versa.

---

## 5. Integração com o GP OS Core (futuro)

Quando o GP OS Core for criado, o Command Center receberá:

### Cadastros via `global_id`
Os registros locais (empresas, funcionarios) ganharão um campo `os_global_id` (nullable) que aponta para o registro canônico no Core. Sem migração forçada — adição incremental.

```sql
-- Futura migration de compatibilidade
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS os_global_id uuid;
ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS os_global_id uuid;
```

### Feed de eventos em tempo real
O Command Center assinará via Supabase Realtime (ou webhook) a tabela `os_eventos` do Core, exibindo o feed de atividades do ecossistema no Centro de Comando.

### Permissões unificadas
O RBAC atual (RLS Supabase) será estendido para reconhecer roles do OS Core (`os_admin`, `os_executive`, `os_manager`) sem quebrar as permissões existentes.

---

## 6. Próximos passos (ordenados por impacto)

### Imediato (sem quebrar nada)
1. Criar página `/dashboard/os` com visualização da arquitetura do GP SafeWork OS
2. Documentar os eventos do ecossistema na tabela `os_eventos` (migration)
3. Adicionar campo `os_global_id` nas tabelas core (nullable, sem obrigatoriedade)

### Curto prazo (Fase 2 completa)
4. Pluggy em produção → reconciliação automática de saldos
5. D4sign token → alertas de contratos via LUI
6. SafeChat com instância WhatsApp dedicada

### Médio prazo (preparação para GP OS Core)
7. Criar schema `os_eventos` no Supabase atual (Command Center publica e consome)
8. Webhook de entrada para receber eventos do GP Sales IA
9. Página de métricas do Sales IA no Portal Executivo

### Longo prazo (GP OS Core em pé)
10. Migrar cadastros para `global_id`
11. RBAC unificado
12. Feed de eventos em tempo real cross-módulo
