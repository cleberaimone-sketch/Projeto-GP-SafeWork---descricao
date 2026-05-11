# Supabase — GP SafeWork

**Projeto:** `jdnwsmbxnjwoswcdktpx`
**URL:** `https://jdnwsmbxnjwoswcdktpx.supabase.co`

## Como aplicar as migrations

### Via Dashboard (mais simples)
1. Acesse [supabase.com/dashboard](https://supabase.com/dashboard)
2. Abra o projeto `jdnwsmbxnjwoswcdktpx`
3. Vá em **SQL Editor**
4. Cole e execute cada arquivo na ordem:

| Ordem | Arquivo | O que cria |
|---|---|---|
| 1 | `migrations/20260511000001_core.sql` | empresas, clientes, centros_custo, funcionarios |
| 2 | `migrations/20260511000002_financeiro.sql` | lancamentos_financeiros, saldos_bancarios, honorarios |
| 3 | `migrations/20260511000003_medicina.sql` | profissionais_saude, consultas, asos, pcmso_clientes |
| 4 | `migrations/20260511000004_engenharia.sql` | tecnicos_seguranca, laudos_tecnicos, pgr_clientes, coletas, conformidade |
| 5 | `migrations/20260511000005_comercial.sql` | contratos, oportunidades_crm, comissoes |
| 6 | `migrations/20260511000006_rh_safeplus_safet.sql` | registros_ponto, turnover, credenciados, agendamentos_safeplus, turmas, presencas |
| 7 | `migrations/20260511000007_sistema_agentes.sql` | alertas, briefings_diarios, conversas_ia, sync_log |

### Via Supabase CLI (após instalar)
```bash
npm install -g supabase
supabase link --project-ref jdnwsmbxnjwoswcdktpx
supabase db push
```

## Tabelas por módulo

### Core
- `empresas` — 9 empresas do grupo (seed incluído)
- `clientes` — empresas clientes atendidas
- `centros_custo` — centros de custo por empresa
- `funcionarios` — todos os colaboradores

### Financeiro (FIN·01–FIN·09)
- `lancamentos_financeiros` — A/R e A/P unificados
- `saldos_bancarios` — saldos por banco/empresa
- `honorarios_medicina` — honorários por profissional

### Medicina (MED·01–MED·06)
- `profissionais_saude` — médicos, psicólogos, fonos, enfermeiros
- `consultas` — todos os atendimentos
- `asos` — ASOs com controle de validade e alertas
- `pcmso_clientes` — PCMSO por cliente/ano

### Engenharia (ENG·01–ENG·05)
- `tecnicos_seguranca` — TSTs por unidade
- `laudos_tecnicos` — PGR, LTCAT, LSPCIE, PPP
- `pgr_clientes` — PGR por cliente/ano
- `coletas_ambientais` — coletas + custo deslocamento
- `conformidade_nr` — compliance NRs por cliente

### Comercial (COM·01–COM·06)
- `contratos` — contratos D4sign
- `oportunidades_crm` — pipeline RD Station
- `comissoes` — comissões por vendedor

### RH (RH·01–RH·04)
- `registros_ponto` — ponto/absenteísmo
- `turnover_log` — admissões e demissões

### Safe+ (S+·01–S+·04)
- `credenciados_safeplus` — rede credenciada nacional
- `agendamentos_safeplus` — agendamentos + SLA

### SafeT (ST·01–ST·04)
- `turmas_safet` — turmas de treinamento
- `presencas_safet` — lista de presença

### Sistema / Agentes IA
- `alertas` — alertas gerados por todos os agentes
- `briefings_diarios` — briefings do LUI (7h)
- `conversas_ia` — log de conversas dos agentes
- `sync_log` — status das integrações externas
