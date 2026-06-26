# Arquitetura — GP Command Center

> **Documento de diagnóstico e arquitetura.** Não contém implementação de código.
> Define o papel, os limites, os indicadores e a evolução do GP Command Center dentro do ecossistema **GP SafeWork OS**.
>
> Status: rascunho de arquitetura · Versão 0.1 · Sem dados reais · Sem secrets

---

## Posicionamento

O **GP Command Center** é o **centro executivo** do Grupo SafeWork — a camada de visão, leitura e decisão da diretoria.

Princípio fundamental:

> **O Command Center NÃO é sistema de origem. Ele não é dono de dado crítico.**
> Ele **lê** eventos, *read-models*, indicadores e sinais dos módulos para entregar visão executiva, alertas e apoio à decisão.

Cada módulo operacional continua sendo a **fonte da verdade** do seu domínio. O Command Center observa, consolida e interpreta — nunca substitui o sistema de origem.

```
        ┌──────────────────────────────────────────────┐
        │            GP COMMAND CENTER                   │
        │   (visão executiva · leitura · decisão)        │
        │   LUI · Plata · Lari · Dieguito                │
        └──────────────────────────────────────────────┘
                          ▲ (lê)
                          │ eventos / read-models / indicadores / sinais
        ┌─────────────────┴──────────────────────────────┐
        │            GP OS Core / Hub                      │
        │       (barramento de eventos + read-models)      │
        └─────────────────▲──────────────────────────────┘
                          │ publicam
   ┌──────────┬───────────┼───────────┬──────────────┬─────────────┐
   ERP Core  SST Core   Sales IA/CRM  Client Portal  Produtos Dig.  Legados*
                                                          (Conta Azul, SigeCloud,
                                                           SOC, D4Sign, RD Station)
   ┌──────────────────────────────────────────────────────────────┐
   │  GP Intelligence / Maestro — interpreta, cruza, gera sinais    │
   └──────────────────────────────────────────────────────────────┘
```

\* Legados são integrados de forma read-only e progressivamente substituídos pelos Cores próprios.

---

## 1. Objetivo do Command Center

Entregar à diretoria, em um único lugar, a **visão executiva** do grupo:

- **Visão executiva** — estado consolidado das 8 empresas e dos módulos, em tempo quase real.
- **Alertas** — o que exige atenção agora (financeiro, operacional, comercial, compliance).
- **Indicadores** — KPIs por módulo e consolidados, com tendência e comparação.
- **Riscos** — exposições financeiras, prazos de compliance (eSocial/NRs), inadimplência, churn.
- **Status dos módulos** — cada Core está saudável? Sincronizando? Com atraso?
- **Saúde da operação** — fluxo de ASOs, faturamento, caixa, conversão comercial, onboarding.
- **Decisões de diretoria** — registro de pendências, encaminhamentos e acompanhamento.

O Command Center responde a três perguntas executivas:
1. **Como estamos?** (indicadores e saúde)
2. **O que precisa de atenção?** (alertas, riscos, sinais)
3. **O que decidir / encaminhar?** (pendências e ações sugeridas)

---

## 2. O que ele PODE fazer

| Capacidade | Descrição |
|---|---|
| **Visualizar** | Exibir indicadores, eventos e read-models dos módulos. |
| **Consolidar** | Agregar dados das 8 empresas e dos módulos numa visão única. |
| **Alertar** | Disparar avisos quando um limite/condição é atingido. |
| **Priorizar** | Ordenar o que é mais crítico (urgência financeira, prazo de compliance). |
| **Abrir pendência** | Registrar uma pendência/encaminhamento (item de acompanhamento próprio do Command Center, não no módulo de origem). |
| **Acompanhar jornada** | Seguir um cliente/processo ao longo dos módulos (comercial → onboarding → SST → financeiro). |
| **Gerar relatório** | Produzir relatórios executivos consolidados. |
| **Sugerir ação** | Recomendar próximos passos (via GP Intelligence/Maestro), sem executá-los no módulo. |

A "pendência" aberta pelo Command Center vive **no domínio do Command Center** (acompanhamento executivo). A ação efetiva é executada pelo módulo dono do dado.

---

## 3. O que ele NÃO PODE fazer

Limites rígidos — o Command Center **nunca** escreve dado operacional crítico:

- ❌ Editar dado operacional crítico (lançamento, cadastro, ASO, contrato).
- ❌ Emitir cobrança / boleto / nota.
- ❌ Liberar cliente inadimplente.
- ❌ Assinar contrato.
- ❌ Alterar ASO ou qualquer documento de SST.
- ❌ Excluir dado.
- ❌ Fazer merge / deploy.
- ❌ Alterar módulos diretamente (sem passar pelo dono do dado).

Regra de ouro: **toda mutação crítica acontece no módulo de origem**, com suas regras, auditoria e responsável. O Command Center, no máximo, *sugere* e *encaminha*.

---

## 4. Indicadores por módulo

### 4.1 GP ERP Core (financeiro)
- Receita (realizada e prevista)
- Contas a receber
- Contas a pagar
- Inadimplência
- Margem
- Lucratividade por cliente
- Serviços prestados sem faturamento
- Contratos vencidos

### 4.2 GP SST Core (medicina + engenharia)
- ASOs agendados
- ASOs realizados ("Consultas Realizadas")
- ASOs pendentes de assinatura
- Documentos publicados
- Riscos pendentes
- PGR / PCMSO vencendo
- Clientes sem atualização
- Produção médica / fonoaudiológica

### 4.3 GP Sales IA / CRM Core
- Leads
- Oportunidades
- Propostas
- Contratos pendentes
- Aceite comercial
- Follow-up atrasado
- Conversão
- Transição RD Station → CRM Core

### 4.4 GP Client Portal
- Clientes ativos
- Documentos visualizados
- Chamados
- Pendências
- Cobranças visualizadas
- Uploads
- Uso da IA

### 4.5 Produtos Digitais
- Usuários
- Clientes
- Receita
- Erros
- Suporte
- Conversões
- Produto ativo / pausado

> Nota de governança financeira (herdada do dashboard atual): aplicar sempre as regras do grupo antes de exibir números — excluir transferências internas, considerar apenas contas ativas para saldo, usar Open Finance (Pluggy) como fonte de saldo de bancos externos. Indicadores financeiros do Command Center devem consumir os mesmos read-models já saneados, não dados brutos.

---

## 5. Sinais operacionais

Sinais = combinações de eventos que indicam algo que exige atenção. São **gerados pela camada de Intelligence** e **exibidos** pelo Command Center.

| Sinal | Cruzamento | Por que importa |
|---|---|---|
| Cliente inadimplente tentando agendar | ERP (inadimplência) × SST (agendamento) | Evitar prestar serviço a quem está em débito. |
| Contrato assinado mas não ativado | CRM (aceite) × ERP/Portal (ativação) | Receita travada / onboarding parado. |
| ASO realizado sem faturamento | SST (ASO realizado) × ERP (faturamento) | Serviço entregue sem cobrança = receita perdida. |
| Documento pronto não publicado | SST (documento) × Portal (publicação) | Entrega concluída não chega ao cliente. |
| Cliente parado em onboarding | CRM/Portal (etapa onboarding × tempo) | Risco de churn precoce. |
| Baixa margem | ERP (receita × custo por cliente) | Cliente/contrato deficitário. |
| Serviço fora do escopo | SST/ERP (serviço × contrato) | Trabalho não contratado / risco jurídico. |
| Produto digital com receita fora do ERP | Produtos Digitais (receita) × ERP | Receita não reconciliada no financeiro oficial. |

Cada sinal deve carregar: **origem, severidade, entidade afetada (cliente/empresa), data de detecção e ação sugerida.**

---

## 6. Relação com GP Intelligence / Maestro

Separação de responsabilidades:

| Camada | Papel |
|---|---|
| **GP Intelligence / Maestro** | **Interpreta** os dados: cruza módulos, calcula sinais, detecta anomalias, prioriza, gera recomendações. É o "cérebro analítico". |
| **GP Command Center** | **Apresenta** o resultado: painel executivo, alertas, indicadores, pendências. É a "cabine de comando". |

O Command Center **não calcula a inteligência** — ele consome os sinais já produzidos pelo Maestro. Isso mantém a lógica de negócio centralizada e o painel leve. Os agentes (LUI/Plata/Lari/Dieguito) são a interface conversacional sobre essa inteligência.

---

## 7. Arquitetura de dados

### Alvo (estado desejado)
- Command Center consome **exclusivamente** *read-models* e **eventos** publicados pelo **GP OS Core / Hub**.
- Sem acesso direto às tabelas operacionais dos módulos.
- Sem escrita operacional crítica em nenhum módulo.

### Fase transitória (realidade atual, documentada e temporária)
- Enquanto os Cores não publicam todos os read-models, **leitura direta read-only** das fontes pode existir (ex.: Supabase do SafeWork, ExportaDados SOC, REST Conta Azul/Pluggy).
- Toda leitura direta deve ser: **documentada, read-only, marcada como temporária** e com plano de migração para o Hub.
- O GP OS Core já publica eventos (ex.: `lead_criado` por `gp_sales_ia`) — esse é o padrão a expandir.

### Invariantes
- Nenhuma escrita operacional crítica a partir do Command Center.
- Read-models saneados (regras de negócio aplicadas na origem, não no painel).
- Idempotência e deduplicação na ingestão (lição aprendida: sync de legado pode duplicar — ver auditoria Conta Azul).

```
[Módulos/Cores] --eventos--> [GP OS Core/Hub] --read-models--> [Command Center]
                                     ▲
                  [GP Intelligence/Maestro] cruza e devolve SINAIS
[Legados] --(transitório, read-only, documentado)--> [Command Center]
```

---

## 8. Telas sugeridas

1. **Visão Geral** — KPIs consolidados do grupo, saúde geral, alertas do dia.
2. **Financeiro** — receita, caixa, a receber/pagar, inadimplência, margem (ERP).
3. **Operação SST** — ASOs (agendados/realizados/pendentes), documentos, PGR/PCMSO vencendo.
4. **Comercial** — funil, propostas, conversão, follow-ups atrasados (CRM).
5. **Clientes Críticos** — clientes em risco (inadimplência, churn, baixa margem, pendências).
6. **Produtos Digitais** — usuários, receita, erros, status dos produtos.
7. **Alertas** — central de alertas e sinais priorizados.
8. **Integrações** — status de cada integração/sync (legados e Cores).
9. **Auditoria** — trilha de leitura, pendências abertas, decisões registradas.
10. **Saúde dos Módulos** — cada Core está online, sincronizando, com atraso? Última atualização.

---

## 9. Backlog (P0 / P1 / P2 / P3)

### P0 — Fundamento (sem isso o Command Center não é confiável)
- Definir contrato de **read-models** mínimos por módulo (financeiro, SST, comercial).
- Tela **Visão Geral** + **Financeiro** consumindo read-models saneados.
- **Saúde dos Módulos** (status/última sincronização de cada fonte).
- Garantir **somente leitura** e documentar toda leitura direta transitória.

### P1 — Operação e sinais
- Tela **Operação SST** e **Comercial**.
- Primeiros **sinais** do Maestro (inadimplente agendando; ASO sem faturamento; contrato não ativado).
- Central de **Alertas**.
- **Clientes Críticos**.

### P2 — Inteligência e jornada
- Acompanhamento de **jornada do cliente** entre módulos.
- **Pendências/decisões** de diretoria com acompanhamento.
- **Relatórios executivos** exportáveis.
- **Produtos Digitais**.

### P3 — Maturidade
- Migração completa para **eventos/read-models via Hub** (encerrar leituras diretas).
- **Auditoria** completa (trilha de leitura e decisão).
- Recomendações proativas do Maestro no painel.

---

## 10. Riscos e pendências

| # | Risco / Pendência | Mitigação |
|---|---|---|
| 1 | **Leitura direta de legados** vira permanente | Marcar como transitória, com plano e prazo de migração ao Hub. |
| 2 | **Dados inconsistentes na origem** (ex.: sync Conta Azul duplicou despesas de Londrina) | Read-models saneados + dedup na ingestão + indicadores de qualidade de dado. |
| 2b | **Leitura/paginação instável** sobre fontes grandes (paginação sem ordenação estável pula/duplica linhas e gera falso "dado faltando") | Sempre paginar com `ORDER BY` estável; preferir agregação no banco (read-models/RPC) a varredura paginada no cliente. |
| 3 | **Command Center virar sistema de origem** por conveniência | Regra rígida: zero escrita crítica; pendências ficam no domínio do Command Center. |
| 4 | **Read-models ainda não existem** nos Cores | Fase transitória documentada; P0 define o contrato mínimo. |
| 5 | **Sinais com falso-positivo** | Severidade + revisão humana; Maestro calibra com feedback. |
| 6 | **Exposição de dados sensíveis** (saúde/financeiro) | Controle de acesso por papel; sem secrets no painel; auditoria de leitura. |
| 7 | **Dependência de integrações frágeis** (SOC lento, OAuth Conta Azul que rotaciona) | Cache/timeout adequados; status na tela de Integrações. |
| 8 | **Múltiplas fontes de receita** (produtos digitais fora do ERP) | Sinal de reconciliação; meta de consolidar tudo no ERP Core. |

---

## Apêndice — Alinhamento com o estado atual

- O dashboard financeiro atual (`/dashboard/financeiro`, agentes Plata/LUI) já é um **embrião** do Command Center na fatia financeira: hoje lê direto do Supabase/Conta Azul/Pluggy (fase transitória).
- O **GP OS Core / Hub** já existe e publica eventos — base para a arquitetura-alvo.
- Próximo marco arquitetural: transformar as leituras diretas em **consumo de read-models** e plugar os **sinais do Maestro**.
