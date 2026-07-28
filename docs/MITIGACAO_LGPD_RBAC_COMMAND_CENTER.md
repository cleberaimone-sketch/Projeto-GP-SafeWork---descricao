# Mitigação LGPD/RBAC — GP Command Center (legado pré-OS em transição)

| Campo | Valor |
|---|---|
| **Documento** | Mapa de dados sensíveis + mitigação interina (≤30 dias) |
| **Módulo** | GP Command Center (Camada 3) — legado pré-OS em transição |
| **Owner** | Cleber |
| **Branch** | `fix/mitigacao-lgpd-rbac-command-center` (sem merge, sem deploy) |
| **Status** | `PROPOSTA` — aguarda go/no-go da Camada 0 |
| **Data** | 2026-07-28 |
| **Regras respeitadas** | Sem banco · sem migration · sem API externa · sem produção · sem deploy · sem merge · sem tocar Conta Azul/SOC/Pluggy/D4Sign/tokens |

> **Natureza do risco (enquadramento da Camada 0).** O acesso ao Command Center hoje é **restrito** (Cleber). O risco LGPD/RBAC tratado aqui é **estrutural e preparatório**: o modelo atual é "tudo-ou-nada" (autenticou → vê tudo), o que **impede ampliar o acesso para a equipe com segurança**. Este documento NÃO descreve um incidente nem exposição ampla atual — ele prepara o módulo para liberação por perfis. O prazo de 30 dias é o prazo do **plano/mitigação mínima antes de liberar acesso à equipe**, não um prazo emergencial de contenção.

---

## 1. Mapa de rotas sensíveis

Legenda de risco: 🔴 alto (dado sensível LGPD art. 11 ou financeiro crítico) · 🟠 médio · 🟡 baixo.

### 1.1 Saúde ocupacional (dado SENSÍVEL — LGPD art. 11)

| Rota | Dados exibidos | Risco | Prioridade |
|---|---|---|---|
| `/dashboard/medicina` | **Nome de trabalhador** (listas de licenças e agendamentos), resultado ASO (`SAIASO` apto/inapto), exames por tipo, **CID agregado** (contagem por código/grupo — sem nome vinculado na tela), unidade/empresa, ASOs pendentes/vencidos | 🔴 | P0 |
| `/dashboard/engenharia` + `/treinamentos` | Treinamentos NR por **trabalhador** (nome), vencimentos, GHE/insalubridade | 🔴 | P0 |
| `/dashboard/lui` (war room) | Só **agregados** de saúde (contagens de ASO vencido, consultas/mês) — nomes usados apenas em memória p/ cálculo, **não renderizados** | 🟡 | P2 |
| APIs `/api/agentes/lari`, `/api/lui/*` | Contexto dos agentes pode conter agregados de saúde; auth exigida | 🟠 | P1 |

**Observações:**
- **CPF não é renderizado em nenhuma tela.** O payload do SOC (máscara 193540) TRAZ o campo `CPF` para a memória do servidor, mas nenhuma página o exibe. Mitigação futura: descartar o campo no parser (toca `lib/soc/` → **vetado nesta fase**, fica documentado).
- CID aparece **apenas agregado** (contagem por grupo) — sem vínculo nominal na tela. O dado nominal (licença × CID) existe no payload em memória.

### 1.2 Financeiro

| Rota | Dados exibidos | Risco | Prioridade |
|---|---|---|---|
| `/dashboard/financeiro` (cockpit) | Receita/despesa/lucro por empresa, saldos bancários, atrasados, empréstimos | 🔴 | P0 |
| `/financeiro/caixa` (Caixa do Dia) | **Decisões de pagamento**, fila de contas com fornecedor/valor/vencimento, saldos por empresa, aporte da matriz | 🔴 | P0 |
| `/financeiro/contas`, `/atrasados`, `/inadimplentes`, `/emprestimos` | Lançamentos com descrição/fornecedor/cliente, inadimplência por cliente | 🔴 | P0 |
| `/financeiro/dre`, `/dre-comparativo`, `/fluxo-caixa`, `/orcamento` | DRE, orçamento×realizado, fluxo | 🟠 | P0 |
| `/financeiro/conciliacao` | Extrato bancário importado (OFX/XLS), cobrado×recebido | 🔴 | P0 |
| `/financeiro/sync` (+ `pluggy-callback`) | Status de conexões bancárias, contas por empresa | 🟠 | P0 |
| APIs `/api/financeiro/*`, `/api/conta-azul/*`, `/api/pluggy/*` | Mutações (decisões, metas, extrato) — auth exigida; crons por secret | 🟠 | P1 |

### 1.3 RH / Pessoas

| Rota | Dados exibidos | Risco | Prioridade |
|---|---|---|---|
| `/dashboard/rh` | Folha (custo total/por unidade/por vínculo — CLT/PJ/estágio), headcount, turnover, CTSE | 🟠 | P0 |

Sem dado nominal de colaborador interno hoje (agregados por unidade/vínculo) — risco é de **confidencialidade salarial**, não de dado pessoal identificável.

### 1.4 Administração / sistema

| Rota | Dados exibidos | Risco | Prioridade |
|---|---|---|---|
| `/dashboard/sistema` | Status de integrações (Conta Azul, SOC, Pluggy, D4Sign), últimas syncs, saúde de tokens (mascarados) | 🟠 | P0 |
| `/dashboard/os` | Eventos do GP OS Core (leads etc. — pode conter contato de cliente) | 🟠 | P0 |
| `/api/lui/debug` | **Era público** e logava payload completo no console do servidor | 🔴 | **P0 — corrigido nesta branch** |
| Webhooks `/api/lui/webhook`, `/api/safechat/webhook`, `/api/pluggy/webhook` | Recebem payload externo **sem validação de assinatura** | 🟠 | P1 (não mexido — risco de quebrar WhatsApp/Pluggy; exige teste controlado) |
| `/dashboard/comercial` | Leads/contatos de clientes (dados pessoais de terceiros) | 🟠 | P1 |

---

## 2. Diagnóstico de acesso atual

| Pergunta | Resposta |
|---|---|
| **Como o login funciona?** | Supabase Auth (e-mail+senha) via `/login`. `proxy.ts` (Next 16) intercepta `/dashboard/:path*` e redireciona não autenticados. Cada página server ainda revalida com `auth.getUser()` (2ª camada). |
| **Quem consegue acessar?** | Tecnicamente, qualquer usuário criado no Supabase Auth do projeto. **Hoje o acesso é restrito ao Cleber** (registro da Camada 0). Obs.: houve criação de um usuário para o financeiro em jul/2026 — **confirmar se está ativo** e, se estiver, revisá-lo na ativação dos perfis. |
| **Existe role?** | **Não.** Nenhum conceito de papel/role em código ou banco. |
| **Existe RBAC?** | **Não.** Autenticou → vê **tudo** (financeiro, saúde, RH, sistema). |
| **Existe company_id/tenant?** | Não no sentido OS. `empresa_id` existe nos dados (empresas do grupo), mas **não** como escopo de acesso por usuário. Single-tenant de fato. |
| **Existe escopo por usuário?** | **Não.** Todo usuário é equivalente. |
| **Dev usa banco de produção?** | **Sim.** `.env.local` aponta para o MESMO projeto Supabase da produção (`jdnwsmbxnjwoswcdktpx`). Não há ambiente de staging/dados sintéticos. Agrava: queries de página usam `SERVICE_ROLE` (bypassa RLS) — a proteção efetiva é só o guard de página/proxy. |
| **Maior risco LGPD?** | **Estrutural**: qualquer usuário que venha a ser criado herda acesso total — inclusive dado de saúde ocupacional (art. 11: nomes de trabalhadores de empresas-clientes, resultado de ASO, licenças com CID agregado). Enquanto o acesso for só do Cleber, a exposição efetiva é mínima; **liberar equipe sem RBAC/menor privilégio** é que materializaria o risco. Segundo ponto: endpoint de debug público com log de payload (corrigido nesta branch). |

---

## 3. Mitigação interina implementada NESTA BRANCH (sem banco)

Princípio: **fail-open** — sem configuração, o comportamento atual não muda em nada. A restrição só ativa quando a env for definida. Nada de banco, migration, API externa ou serviço novo.

| # | Medida | Arquivo | Como funciona |
|---|---|---|---|
| 1 | **Perfis de acesso por env** (allowlist segura) | `web/lib/auth/perfis.ts` (novo) | Env `ACESSO_PERFIS_JSON` mapeia e-mail → perfis (`executivo`, `financeiro`, `saude`, `rh`, `admin`). `executivo`/`admin` veem tudo. Sem env → sem restrição. |
| 2 | **Gate central por rota no proxy** | `web/proxy.ts` (editado) | Ponto único: `/dashboard/medicina|engenharia`→`saude` · `/rh`→`rh` · `/financeiro/*`→`financeiro` · `/sistema|/os`→`admin`. Sem perfil → redirect para tela de aviso. Nenhuma das 27 páginas precisou mudar. |
| 3 | **Tela de acesso restrito** (aviso LGPD) | `web/app/dashboard/acesso-restrito/page.tsx` (novo) | Aviso claro, sem nenhum dado de negócio, com retorno ao dashboard. |
| 4 | **Fechamento do `/api/lui/debug`** | `web/app/api/lui/debug/route.ts` (editado) | Era público e logava payload completo. Agora: exige autenticação (401) e loga **apenas as chaves** do payload. |

**Ativação (ação humana, fora desta branch):** definir `ACESSO_PERFIS_JSON` na Vercel (Settings → Environment Variables) e no `.env.local`. Exemplo:
```json
{"cleber@exemplo.com":["executivo"],"financeiro@exemplo.com":["financeiro"],"lari@exemplo.com":["saude"]}
```

### O que foi deliberadamente NÃO feito (e por quê)
- **Webhooks sem assinatura** (`lui`, `safechat`, `pluggy`): validar exige testar contra os provedores (Z-API/Pluggy) → risco de quebrar WhatsApp em produção. Fica para fase com teste controlado.
- **Strip do CPF no parser SOC**: toca `lib/soc/` (vetado pelas regras desta missão).
- **Grafia D4Sign**: aguarda autorização separada (regra explícita).
- **APIs sensíveis com checagem de perfil** (`/api/financeiro/*` etc.): já exigem auth; adicionar perfil nas APIs acompanha a fase 2 (após validar o gate de páginas).

---

## 4. Classificação das ações

### 4.1 Pode ser feito SEM banco (30 dias)
- ✅ Perfis por env + gate no proxy + tela de aviso (**feito nesta branch**)
- ✅ Fechar `/api/lui/debug` (**feito**)
- Ativar `ACESSO_PERFIS_JSON` em produção (go/no-go + env na Vercel)
- Estender checagem de perfil às APIs mutadoras (`/api/financeiro/caixa`, `/metas`, `/extrato`)
- Validação de assinatura dos webhooks (com janela de teste)
- Revisão de logs: garantir que nenhum `console.log` novo carregue payload com dado pessoal

### 4.2 Exige migration/banco (NÃO fazer agora — pedir autorização)
- **RBAC persistente**: tabela `perfis_usuario` (user_id → perfis) + RLS por perfil — substitui a env quando o modelo estabilizar
- **RLS efetiva**: hoje as páginas usam SERVICE_ROLE; migrar leituras para o client anon + policies por perfil
- **Auditoria de acesso**: log de quem viu tela sensível (tabela `acessos_log`)
- **Padrão `company_id`/tenant** transversal (pendência já registrada na Camada 0 pelo SST Core)

### 4.3 Em 30 dias (proposta de sequência)
1. **Semana 1**: revisar esta branch → go/no-go Camada 0 → merge manual → configurar `ACESSO_PERFIS_JSON` (começa em modo observação: só Cleber `executivo`, demais restritos) → validar em produção.
2. **Semana 2**: perfil nas APIs mutadoras; revisar usuário do financeiro (perfil `financeiro` apenas).
3. **Semanas 3–4**: assinatura dos webhooks (janela de teste); proposta de RBAC persistente (migration) para autorização da Camada 0.

### 4.4 Fase posterior (fora dos 30 dias)
- RBAC em banco + RLS por perfil (substitui a env)
- Ambiente de staging com dados sintéticos (resolver "dev = produção")
- Strip de CPF/dados não usados nos parsers de legado (SOC)
- DPO, política de retenção e mapeamento ROPA formal (pendência Camada 0 herdada do SST Core)
- Migração do financeiro operacional ao GP ERP Core (tira dado crítico da Camada 3)

---

## 5. Riscos residuais (aceitos nesta fase interina)

1. Perfis por env dependem de disciplina operacional (fail-open se a env sumir/ficar inválida — mitigado com log de erro no servidor).
2. SERVICE_ROLE continua bypassando RLS — o gate é de rota, não de dado; um bug de página nova pode vazar dado até o RBAC persistente chegar.
3. Webhooks continuam sem assinatura até a janela de teste.
4. Dev continua apontando para produção até existir staging.

---

**Nada operacional foi executado nesta missão**: sem deploy, sem merge, sem banco, sem API externa, sem produção. Código apenas na branch `fix/mitigacao-lgpd-rbac-command-center`.
