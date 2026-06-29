# Autorização controlada — futura implementação do P0 estático (GP Command Center)

> ⚠️ **Este documento NÃO autoriza a implementação.** Ele apenas define o **escopo, branch, arquivos, checks e limites** para quando a implementação for autorizada.
> A implementação do P0 só começa após **GO explícito do Cleber**: “pode implementar o P0 estático”.
> Base: `PROPOSTA_IMPLEMENTACAO_P0_COMMAND_CENTER.md`, `BACKLOG_V0_COMMAND_CENTER.md`, `DESENHO_TELA_V0_COMMAND_CENTER.md`, `ARQUITETURA_GP_COMMAND_CENTER.md`.

---

## 1. Objetivo da autorização
Quando concedida, a autorização cobrirá **apenas** a implementação do **P0 estático / read-only** da tela `/dashboard/command-center` — protótipo visual com **dados agregados documentados (snapshot)**, **sem nenhum dado ao vivo**, sem APIs, sem banco, sem automação.

## 2. Branch obrigatória
- Branch: **`feat/command-center-p0-static`**
- **Proibido** implementar direto na `main`.
- Todo trabalho do P0 fica isolado nessa branch até aprovação.

## 3. Arquivos permitidos
Somente estes (seguindo o padrão do projeto: componentes PascalCase junto da página; libs em `lib/<area>/`):

```
app/dashboard/command-center/page.tsx
app/dashboard/command-center/CommandCenterPage.tsx     (ou CommandCenterClient.tsx, se precisar 'use client')
app/dashboard/command-center/ExecutiveHeader.tsx
app/dashboard/command-center/DataReconciliationBanner.tsx
app/dashboard/command-center/ReliabilityBadge.tsx
app/dashboard/command-center/SignalBadge.tsx
app/dashboard/command-center/IndicatorCard.tsx
app/dashboard/command-center/CriticalSignalsPanel.tsx
app/dashboard/command-center/IntegrationsStatusGrid.tsx
app/dashboard/command-center/IncidentCard.tsx
app/dashboard/command-center/DataHealthTable.tsx
app/dashboard/command-center/SourceTimestamp.tsx
app/dashboard/command-center/RecommendedAction.tsx
app/dashboard/command-center/BlockedState.tsx
lib/command-center/types.ts
lib/command-center/snapshot.ts
```
- Caminhos relativos à pasta `web/`.
- Se o padrão real exigir ajuste, manter o **escopo equivalente** (mesma pasta `command-center`, mesma separação page/componentes/lib) — nada fora disso.

## 4. Arquivos proibidos
**Nenhuma** alteração em:
- `.env*`
- `supabase/migrations/**` / qualquer migration
- `supabase/**`, schema, banco
- APIs/route handlers de integração (`app/api/**`)
- `lib/conta-azul/**` (client Conta Azul)
- `lib/soc/**` (client SOC)
- `lib/pluggy/**` (client Pluggy)
- client/integração do Hub
- autenticação / `lib/supabase/**`
- `proxy.ts` / middleware de permissões
- workers / crons / scripts de sync
- configurações de deploy (Vercel, etc.)
- arquivos de produção
- secrets
- dados reais / exportações / dumps

## 5. Dados permitidos no snapshot
Somente **agregados já documentados**:
| Chave | Valor | Selo |
|---|---|---|
| Empresas SOC | 2.423 | REAL |
| Empresas SOC com CNPJ | 2.179 | REAL |
| Empresas com exames (30d) | 446 | REAL |
| Exames últimos 30 dias | 11.184 | REAL |
| Funcionários ativos | amostra | ESTIMADO |
| Receita do mês | — | BLOQUEADO |
| Saldo Pluggy | parcial | REAL parcial |
| Golden Record | — | INDISPONÍVEL |
| Conta Azul OAuth | 11/11 invalid_grant | incidente |
| Último sync Conta Azul | ~14/06 | — |
| Pluggy | 1 conta parcial | REAL parcial |

**Proibido no snapshot:** CPF · CNPJ individual · e-mail · telefone · nome de funcionário · payload bruto · token · secret · dados bancários individualizados · qualquer dado pessoal.

## 6. Funcionalidades permitidas
Página visual · cards · badges · tabelas · estados visuais · textos explicativos · indicadores agregados · incidentes agregados · saúde dos dados agregada · links internos **não críticos** (apenas se já existirem e forem seguros, ex.: navegação entre telas read-only).

## 7. Funcionalidades proibidas
Botão de sincronizar · botão de corrigir · botão de reautorizar · chamada à API · query em banco · server action · mutation · POST/PATCH/DELETE · download/export · envio de alerta · automação · alteração de dados · **qualquer ação crítica**.

## 8. Critérios de aceite
A implementação futura só é aceita se:
- Passa **lint**.
- Passa **typecheck** (`tsc --noEmit` / build).
- **Sem** dado pessoal.
- **Todo** indicador com **selo**.
- **Todo** indicador com **fonte**.
- **Todo** indicador com **data/estado**.
- Conta Azul aparece como **BLOQUEADO/CRÍTICO**.
- Financeiro **não** parece atualizado.
- `NUMERO_VIDAS` **não** usado como headcount.
- Tela indica claramente **“dados em reconciliação”**.
- **Nenhuma** ação crítica.
- Snapshot **centralizado** em `lib/command-center/snapshot.ts`.
- **Nenhuma** integração externa chamada.

## 9. Checks antes do commit futuro
- `git diff` revisado.
- Arquivos alterados **dentro da lista permitida** (seção 3).
- Sem `.env` · sem token · sem dump · sem migration · sem mudança em integração · sem dado sensível.
- **Working tree limpo** após o commit.

## 10. Resultado esperado da implementação futura
Ao implementar, retornar:
- branch · hash · arquivos alterados · rota criada;
- descrição visual (ou prints, se possível);
- resultado de **lint/typecheck**;
- confirmação de **nenhuma chamada externa**;
- confirmação de **nenhum dado pessoal**;
- confirmação de **nenhum deploy/merge**.

## 11. Gate de PR / merge / deploy
- **Pode** abrir PR técnico (se autorizado depois).
- **Não pode** mergear sem aprovação do Cleber.
- **Não pode** deployar sem aprovação.
- **Não pode** ligar dados dinâmicos sem nova fase.
- **P0 estático NÃO autoriza P1 dinâmico** (cada fase tem GO próprio).

## 12. Decisão final
Este documento **prepara** a autorização, mas **NÃO inicia** a implementação.
A implementação do P0 só começa quando o Cleber disser explicitamente:

> **“pode implementar o P0 estático”**

---

### Confirmação
Somente documentação. **Nada operacional foi executado** — sem código, sem branch de feature criada, sem arquivos de app/lib, sem alteração de rota, sem build, sem produção, sem merge.
