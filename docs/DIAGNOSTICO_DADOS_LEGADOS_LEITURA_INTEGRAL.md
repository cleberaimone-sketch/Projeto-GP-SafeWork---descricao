# Diagnóstico de Dados Legados — Leitura Integral

> **Documento de diagnóstico e plano de reconciliação.** Somente leitura.
> **Nenhum dado foi sincronizado, importado, alterado, sobrescrito ou apagado.**
> Nenhuma alteração em Conta Azul, SOC, SigeCloud ou D4Sign. Nenhuma integração automática criada. Sem secrets expostos.
>
> Status: diagnóstico inicial · Versão 0.1 · Base para reconciliação futura (GP ERP Core / GP SST Core / GP Command Center)

---

## 1. Objetivo da leitura integral

Entender a empresa **de ponta a ponta antes de sincronizar qualquer coisa**.

O Grupo SafeWork opera hoje com dados espalhados em vários sistemas (Conta Azul, SOC, SigeCloud, D4Sign, RD Station) e em um banco próprio (Supabase) ainda parcial. Antes de unificar isso nos Cores próprios (ERP/SST) e exibir no Command Center, é preciso:

1. **Inventariar** o que existe em cada sistema.
2. **Mapear as chaves** que ligam o mesmo cliente/trabalhador/contrato entre sistemas.
3. **Identificar duplicidades e lacunas**.
4. **Definir o Golden Record** (cadastro mestre) de cada entidade.
5. **Planejar a reconciliação** com validação humana — sem automação prematura.

Princípio: **diagnosticar antes de migrar.** Migrar dado errado é pior que não migrar.

---

## 2. Sistemas de origem

| Sistema | Domínio | Papel | Situação atual |
|---|---|---|---|
| **Conta Azul** | Financeiro | Receitas, despesas, clientes, fornecedores | Integrado (OAuth) e populado no Supabase |
| **SOC (ExportaDados)** | Medicina/SST | Funcionários, ASOs, exames, PCMSO/PGR | Integração confirmada; **dados ainda não importados** |
| **SigeCloud** | Operacional/legado | Histórico de clientes, serviços, contratos antigos | **Não integrado / não inventariado** |
| **D4Sign** | Assinatura | Contratos, signatários, status, evidências | **Não integrado** |
| **RD Station / CRM** | Comercial | Leads, contatos, oportunidades | **Não integrado** (transição para CRM Core) |
| **GP ERP Core** | Financeiro próprio | Destino futuro do financeiro | Em construção |
| **GP SST Core** | SST próprio | Destino futuro de medicina/segurança | Em construção |
| **GP Client Portal** | Portal do cliente | Visão do cliente | Em construção |
| **GP CRM Core** | Comercial próprio | Destino futuro do comercial | Em construção |

---

## 3. Dados existentes por sistema

### 3.1 Conta Azul
- Clientes
- Fornecedores
- Contas a receber
- Contas a pagar
- Categorias
- Centros de custo
- Notas/faturamento (se houver)
- Extratos/conciliação (se houver)

**Estado real no Supabase (leitura read-only desta data):**
- `lancamentos_financeiros`: **49.143** registros (receitas + despesas)
- `saldos_bancarios`: 799 registros
- `categorias_excluidas`: 3 (transferências internas)
- `contas_bancarias_ativas`: 17
- Pluggy (Open Finance, saldo de bancos externos): 1 item / 1 conta conectada
- ⚠️ **`cliente_id` preenchido em 0 lançamentos** → o financeiro **não está vinculado a clientes** hoje.
- ⚠️ Lições já registradas: sync pode duplicar (Londrina, corrigido) e o saldo de banco externo no Conta Azul é não-confiável (usar Pluggy).

### 3.2 SOC
- Empresas
- Unidades
- Funcionários
- Funções
- Setores
- ASOs
- Exames
- PCMSO
- PGR
- Laudos
- Riscos
- Documentos
- Vencimentos

**Estado real:** `funcionarios`, `asos` existem no schema mas estão **vazios** (0 registros). Demais entidades SOC ainda **não modeladas**. Pendência conhecida: códigos das máscaras do ExportaDados.

### 3.3 SigeCloud
- Histórico operacional
- Clientes
- Serviços
- Contratos / registros antigos
- Financeiro/operacional (se houver)
- Documentos/históricos disponíveis

**Estado real:** **não inventariado**. É preciso descobrir o que ainda existe e em que formato (export? API? planilha?).

### 3.4 D4Sign
- Contratos
- Signatários
- Status de assinatura
- Datas
- Documentos assinados
- Evidências

**Estado real:** **não integrado**. Nenhuma tabela `contratos`/documentos populada (`contratos` = 0).

### 3.5 CRM / RD Station
- Leads
- Empresas
- Contatos
- Campanhas
- Oportunidades (se houver)

**Estado real:** **não integrado** no Supabase. O GP OS Core já publica eventos comerciais (ex.: `lead_criado` por `gp_sales_ia`) — ponto de partida.

---

## 4. Chaves de ligação entre sistemas

Campos candidatos a unir o mesmo registro entre sistemas:

| Chave | Liga | Força | Observação |
|---|---|---|---|
| **CNPJ** | Empresa/cliente | Alta | ⚠️ Hoje **0/11 empresas do grupo têm CNPJ** preenchido — primeira correção necessária. |
| **CPF** | Trabalhador | Alta | Chave principal do trabalhador (SOC). |
| Razão social | Empresa | Média | Variações de grafia. |
| Nome fantasia | Empresa | Baixa | Muito variável. |
| E-mail | Contato/cliente | Média | Pode ser compartilhado. |
| Telefone | Contato | Baixa | Pouco confiável. |
| Unidade | Cliente×local | Média | Cliente pode ter várias unidades. |
| Código SOC | Empresa/trabalhador no SOC | Alta (dentro do SOC) | Precisa de tabela de-para. |
| Código Conta Azul | Cliente no financeiro | Alta (dentro do CA) | Precisa de-para. |
| Código SigeCloud | Registro legado | Alta (dentro do Sige) | Precisa de-para. |
| Contrato | Cliente×serviço | Média | Liga comercial↔financeiro↔SST. |
| Documento assinado (D4Sign) | Contrato | Alta | Evidência de aceite. |
| Competência (mês/ano) | Faturamento×serviço | Média | Liga produção↔financeiro. |
| Trabalhador | ASO×funcionário | Alta | Via CPF. |
| Função / data admissão / data exame | Trabalhador×ASO | Média | Apoio à conciliação. |

**Conclusão:** a espinha dorsal da reconciliação é **CNPJ (empresa)** e **CPF (trabalhador)**, complementada por tabelas **de-para** de códigos por sistema.

---

## 5. Golden Record / Cadastro Mestre

Para cada entidade, definir qual sistema é a **fonte da verdade** e como consolidar:

| Entidade | Fonte da verdade (proposta) | Chave mestre | Como consolidar |
|---|---|---|---|
| **Cliente/Empresa** | ERP Core (futuro); hoje Conta Azul + SOC | CNPJ | Unificar por CNPJ; resolver grafias por revisão humana. |
| **Unidade** | SOC | CNPJ + código de unidade | Uma empresa → N unidades. |
| **Trabalhador** | SOC | CPF | Deduplicar por CPF; tratar CPF divergente. |
| **Contrato** | D4Sign (assinatura) + CRM (origem) | nº contrato / doc D4Sign | Liga cliente↔serviço↔financeiro. |
| **Serviço** | ERP/SST Core | contrato + competência | Define escopo e faturamento. |
| **Documento** | SOC (SST) / D4Sign (contratual) | id documento + cliente | PGR/PCMSO/ASO vs contrato. |
| **Cobrança** | ERP Core; hoje Conta Azul | id lançamento + cliente | Vincular a contrato/cliente (hoje sem vínculo). |
| **ASO** | SOC | CPF + data exame + tipo | Já normalizado por `isConsultaOcupacional()`. |

Regra: **o Golden Record nasce da reconciliação validada**, não de sobrescrita automática. Mantém-se rastreabilidade (de-para) para cada sistema de origem.

---

## 6. Mapa de duplicidades (problemas esperados)

- Mesma empresa com **nomes diferentes** entre Conta Azul, SOC e SigeCloud.
- **CNPJ ausente** (confirmado: 0/11 no grupo; provável também em clientes).
- **Unidade duplicada** (mesma unidade cadastrada mais de uma vez no SOC).
- **Trabalhador com CPF divergente** (erro de digitação / CPF trocado).
- **Contrato sem cliente correspondente** (D4Sign sem match no cadastro).
- **Cobrança sem contrato** (lançamento financeiro sem vínculo — confirmado: 0 lançamentos com `cliente_id`).
- **ASO sem trabalhador consolidado** (ASO no SOC sem cadastro mestre).
- **Cliente no financeiro mas não no SOC** (fatura mas não tem operação SST registrada).
- **Cliente no SOC mas sem financeiro ativo** (atende mas não fatura / inadimplente).
- **Contrato assinado sem faturamento** (receita travada).
- **Cliente ativo sem contrato** (operação sem base contratual).

---

## 7. Matriz de reconciliação

| Dado | Sistema origem | Possível chave | Destino futuro | Confiança | Validação humana |
|---|---|---|---|---|---|
| Cliente/empresa | Conta Azul | CNPJ / razão social / cód. CA | ERP Core | Média | Sim |
| Cliente/empresa | SOC | CNPJ / cód. SOC | SST Core | Média | Sim |
| Cliente/empresa | SigeCloud | razão social / cód. Sige | ERP Core | Baixa | Sim |
| Trabalhador | SOC | CPF | SST Core | Alta | Parcial |
| ASO | SOC | CPF + data + tipo | SST Core | Alta | Não (se CPF ok) |
| Contas a receber/pagar | Conta Azul | id lançamento | ERP Core | Alta | Não |
| Vínculo cobrança→cliente | Conta Azul | cód. CA cliente | ERP Core | Baixa | Sim |
| Contrato | D4Sign | nº doc / signatário | CRM/ERP Core | Média | Sim |
| Lead/oportunidade | RD Station | e-mail / CNPJ | CRM Core | Média | Parcial |
| Histórico operacional | SigeCloud | cód. Sige | Arquivo/ERP | Baixa | Sim |
| Saldo bancário | Pluggy (Open Finance) | conta + banco | ERP Core | Alta | Não |
| Unidade | SOC | CNPJ + cód. unidade | SST Core | Média | Sim |

Regra: tudo com confiança **Baixa/Média** entra em fila de **validação humana** antes de virar Golden Record.

---

## 8. Indicadores para o Command Center

Indicadores iniciais que o diagnóstico já permite planejar:

- Total de clientes por sistema (Conta Azul / SOC / SigeCloud / CRM)
- Clientes encontrados em **todos** os sistemas (interseção)
- Clientes **só no SOC** (atende mas não fatura?)
- Clientes **só no Conta Azul** (fatura mas sem operação SST?)
- Contratos assinados (D4Sign) **sem financeiro** correspondente
- Financeiro ativo **sem contrato**
- ASOs realizados por cliente
- Faturamento por cliente
- Inadimplência por cliente
- Serviços realizados **sem faturamento**
- Documentos pendentes (publicação/assinatura)
- Clientes com **cadastro incompleto** (sem CNPJ, sem contato, etc.)

> Nota: vários desses indicadores **dependem da reconciliação** (vínculo cliente↔financeiro↔SOC), que hoje **não existe** — daí a prioridade do Golden Record.

---

## 9. Plano de fases

| Fase | Nome | Conteúdo | Escreve dado? |
|---|---|---|---|
| **0** | Diagnóstico e inventário | Este documento + contagem read-only por sistema | Não |
| **1** | Exportações controladas (read-only) | Exportar/ler cada sistema sem alterar origem (CSV/API read-only) | Não (só leitura) |
| **2** | Staging em ambiente separado | Carregar exports em **schema/banco isolado** (não produção) | Sim, em staging isolado |
| **3** | Reconciliação com validação humana | Match por CNPJ/CPF; revisar duplicidades; de-para | Em staging |
| **4** | Criação do Golden Record | Consolidar cadastro mestre validado | Em staging → curado |
| **5** | Integração gradual com ERP/SST/Command Center | Publicar read-models; ligar ao Hub; exibir indicadores | Produção (controlado) |

Cada fase só começa após a anterior validada. **Nenhuma automação antes da Fase 5.**

---

## 10. Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Sobrescrever dado correto | Perda de dado real | Staging isolado; nunca escrever na origem; backup antes de qualquer curadoria. |
| Misturar clientes | Faturamento/ASO no cliente errado | Match por CNPJ/CPF + validação humana para baixa confiança. |
| Duplicar trabalhador | ASO/produção contados em dobro | Dedup por CPF; tratar CPF divergente manualmente. |
| Expor dado sensível (saúde/financeiro) | Violação de privacidade | Controle de acesso por papel; sem secrets; logs de acesso. |
| Importar dado antigo errado (SigeCloud) | Decisão sobre base ruim | Marcar legado como "histórico", não como verdade operacional. |
| Usar dado financeiro sem validação | KPI executivo incorreto | Read-models saneados; dedup (lição Conta Azul). |
| Violar LGPD | Risco jurídico | Minimização de dados; base legal; retenção definida. |
| Criar automação antes da reconciliação | Propagar erro em escala | Automação só na Fase 5, após Golden Record. |
| Paginação/leitura instável | Falso "dado faltando"/dobrado | Paginar com ordenação estável; preferir agregação no banco. |

---

## 11. Próximo passo recomendado

**Primeiro inventário prático, sem automação — Fase 1 (read-only):**

1. **Conta Azul** — extrair a lista de **clientes** (com código CA, CNPJ, razão social) — hoje o financeiro existe mas sem vínculo a cliente; este é o elo que falta.
2. **SOC** — puxar (read-only, via ExportaDados) a lista de **empresas/unidades e funcionários (CPF)** para uma planilha de inventário.
3. **D4Sign** — exportar a lista de **contratos e signatários** (sem baixar PDFs sensíveis nesta etapa).
4. **SigeCloud** — levantar **o que ainda é acessível** e em que formato.
5. Consolidar tudo numa **planilha de inventário** (1 aba por sistema) com as colunas-chave (CNPJ, CPF, razão social, código por sistema).
6. Preencher **CNPJ das 8 empresas do grupo** (correção imediata de base, hoje 0/11).

Esse inventário alimenta a **matriz de reconciliação** (seção 7) e habilita as Fases 2+.

---

## Fase 1.1 — Leitura read-only SOC

> Execução autorizada: leitura read-only via ExportaDados, somente contagens/amostras anonimizadas. **Nada foi importado, sincronizado, alterado ou enviado ao SOC.**

### Método
- Chamadas GET ao endpoint `ExportaDados` (`ws1.soc.com.br/WebSoc/exportadados`), formato do cliente oficial (`web/lib/soc/client.ts`).
- Máscaras lidas: Empresas (215358), Funcionários (192399), Exames/ASO (191865). Empresa principal `289501`.
- Nota operacional: o `.env.local` deste ambiente estava com a **chave da máscara de empresas desatualizada/corrompida** (rejeitada com `"Problemas com a chave ou empresa"`). A leitura foi feita com as **chaves válidas registradas na memória do projeto**. → Pendência: atualizar `.env.local` local (produção/Vercel pode estar correta).

### Resultado (contagens reais)

| # | Item | Resultado |
|---|---|---|
| 1 | **Empresas/clientes no SOC** | **2.423** empresas · **2.179 com CNPJ (~90%)** · 1.493 com vidas > 0 |
| 2 | **Unidades** | Existem e são populadas (campos `CODIGOUNIDADE`/`NOMEUNIDADE` por funcionário); cada empresa tem 1+ unidades. Contagem total exige varrer empresas (não feito nesta leitura leve). |
| 3 | **Funcionários/trabalhadores** | `NUMERO_VIDAS` soma **433.035**, mas **inflado** por 2 empresas anômalas (200.926 + 16.891 vidas). Funcionários reais acessíveis por empresa via 192399, com **CPF 100% preenchido** nas amostras (P/M). ⚠️ as 2 empresas gigantes retornam **0 funcionários** (limite de volume da máscara). |
| 4 | **ASOs/exames** | **11.184 exames** nos últimos 30 dias (1 linha por exame), em **446 empresas** distintas. |
| 5 | **Chaves disponíveis** | Empresa: `CNPJ` (~90%), `CODIGO` (código SOC). Trabalhador: `CPFFUNCIONARIO` (100% nas amostras), `MATRICULAFUNCIONARIO`, `DATA_ADMISSAO`. Estrutura: `CODIGOUNIDADE`, `CODIGOSETOR`, `CODIGOCARGO`/`CBOCARGO`. |
| 6 | **Qualidade dos dados** | **ALTA** para empresas pequenas/médias (CNPJ e CPF praticamente completos). **MÉDIA** no agregado por causa das 2 empresas gigantes com `NUMERO_VIDAS` irreal e sem funcionários retornáveis. |

*Nenhum CPF/CNPJ individual é exibido — apenas contagens e percentuais.*

### Avaliação para reconciliação
- **Trabalhador → Golden Record por CPF: viável** (CPF presente e completo nas amostras). Chave forte.
- **Empresa/cliente → match por CNPJ: viável para ~90%**; ~10% (≈244 empresas) sem CNPJ exigirão match por código SOC + razão social + validação humana.
- **Unidades**: modeláveis a partir de `CODIGOUNIDADE` (uma empresa → N unidades).
- **Volume**: a base SOC é grande (2.423 empresas, centenas de milhares de vidas, ~11k exames/mês) → a importação futura precisa de paginação e estratégia para empresas gigantes.

### Riscos
- `NUMERO_VIDAS` **não confiável** para empresas gigantes (cadastros guarda-chuva/atípicos) — não usar como headcount sem validar.
- Máscara 192399 **não retorna** funcionários de empresas muito grandes → estratégia de paginação/filtro necessária na Fase 2.
- ~10% das empresas **sem CNPJ** → risco de match errado; exigem validação humana.
- Credencial do `.env.local` local desatualizada → risco de "parece quebrado" sem estar; padronizar fonte de credenciais.

### Próximo passo
1. Atualizar a chave da máscara de empresas no `.env.local` local (alinhar com a da memória/produção).
2. Fase 1.2 (read-only): varrer empresas para **contar unidades** e **funcionários ativos por empresa** (com paginação; tratar empresas gigantes à parte).
3. Cruzar a base de empresas SOC (CNPJ) com a futura lista de clientes do Conta Azul para a primeira **interseção** (indicador "cliente em ambos os sistemas").

### Confirmação
Somente leitura. **Nada foi importado, sincronizado, alterado ou enviado** ao SOC. Nenhum documento/PDF/ficha clínica baixado. Nenhum CPF/CNPJ individual exposto neste relatório.

---

## Fase 1.2 — Contagem read-only SOC com paginação

> Leitura read-only ampliada, com batches paralelos controlados (respeitando o limite de requisições do SOC). **Nada importado/sincronizado/alterado.** CPF/CNPJ não expostos.

### Método
- Base completa de empresas (215358): 2.423 registros.
- Amostra estratificada de **257 empresas** para leitura de funcionários (192399): **top 80 por `NUMERO_VIDAS`** (onde as anomalias se concentram) + amostragem sistemática (1 a cada 8) das demais com vidas.
- Funcionários lidos em batches de 6 chamadas paralelas. Exames via 191865 (30 dias).

### Resultados

| Métrica | Valor |
|---|---|
| Empresas no SOC | **2.423** |
| Empresas **sem CNPJ** | **244 (~10%)** |
| Empresas com `NUMERO_VIDAS > 0` | 1.493 |
| Empresas com **exames nos últimos 30 dias** | **446** |
| Empresas amostradas (funcionários) | 257 |
| — com retorno de funcionários | 208 |
| — **vazias (0 funcionários)** | 49 |
| **Funcionários ativos (na amostra)** | **46.338** (de 48.206 registros) |
| **Unidades distintas (na amostra de 208 empresas)** | **2.279** (~11 por empresa) |

### Comparação `NUMERO_VIDAS` × funcionários reais
- A soma de `NUMERO_VIDAS` (433.035) é **dominada por ~13 empresas guarda-chuva** que retornam **0 funcionários** via 192399.
- Essas 13 anomalias somam **≈ 407.963 vidas — ~94% do total** — porém **0 funcionários detalhados**.
- Conclusão: **`NUMERO_VIDAS` é inutilizável como headcount.** O número operacional real vem da contagem detalhada (192399), não desse campo.

### Empresas anômalas (agregado, código SOC mascarado — sem CNPJ/razão social)

| Código (mascarado) | NUMERO_VIDAS | Funcionários reais |
|---|---|---|
| 21***34 | 200.926 | 0 |
| 48***35 | 59.771 | 0 |
| 17***33 | 48.932 | 0 |
| 10***18 | 34.010 | 0 |
| 13***83 | 22.086 | 0 |
| 19***63 | 16.891 | 0 |
| 11***37 | 11.642 | 0 |
| 17***96 | 4.911 | 0 |
| (mais 5 entre 680 e 2.991 vidas) | … | 0 |

Padrão único: **vidas alto + 0 funcionários retornados** (cadastros consolidados/matriz que não detalham trabalhadores nessa máscara). Não há caso de "vidas alto com poucos reais" — é tudo-ou-nada.

### Qualidade dos dados
- **CNPJ (empresa):** ALTA (~90%).
- **CPF (trabalhador):** ALTA (100% nas empresas que retornam).
- **Unidades:** ALTA (estruturadas por `CODIGOUNIDADE`).
- **`NUMERO_VIDAS`:** BAIXA (94% concentrado em guarda-chuvas vazios).
- **Cobertura de funcionários via 192399:** MÉDIA — completa para P/M, **nula para guarda-chuvas grandes**.

### Riscos
- Não usar `NUMERO_VIDAS` para dimensionar nada.
- ~19% das empresas amostradas retornaram 0 funcionários — separar **guarda-chuva** (vidas alto) de **cliente inativo/sem detalhe** exige análise caso a caso.
- **Total exato** de unidades/funcionários do grupo exige **varredura completa das 1.493 empresas** (job dedicado, não interativo) — os números acima são de amostra representativa, não totais fechados.

### Recomendação — cruzamento SOC × Conta Azul
1. Usar **CNPJ** como chave primária do match (cobre ~90% / 2.179 empresas SOC).
2. As **244 sem CNPJ** + as **~13 guarda-chuva** entram em fila de **validação humana**.
3. Preservar **código SOC** como chave legada em todo registro reconciliado.
4. Próximo elo: inventariar **clientes do Conta Azul** (via fluxo de sync, não API manual) e gerar a **interseção por CNPJ** → indicadores "cliente em ambos", "só no SOC", "só no Conta Azul".

### Confirmação
Somente leitura, em batches controlados. **Nada foi importado, sincronizado, alterado ou enviado.** Nenhum PDF/ficha clínica. Nenhum CPF/CNPJ individual exposto (códigos SOC mascarados).

---

## Fase 1.3 — Plano de leitura controlada Conta Azul

> **PLANO. Nada executado.** Define como obter a lista real de clientes do Conta Azul **sem API manual/curl** e **sem rotacionar/queimar o token OAuth**.

### Constatações da arquitetura atual (lidas do código, não executadas)
- Cliente: `web/lib/conta-azul/client.ts` (`ContaAzulClient`, base `api-v2.contaazul.com`).
- OAuth: refresh_token flow (Cognito). **Crítico:** ao rotacionar, o callback `onTokenRefreshed` **persiste o novo refresh_token** em `conta_azul_tokens`. → O fluxo de sync **não queima** o token; o que queima é **curl manual** (rotaciona e não persiste).
- Sync atual (`/api/conta-azul/sync`): lê `conta_azul_tokens` por empresa → busca eventos financeiros → grava `lancamentos_financeiros` e `saldos_bancarios`.
- Os eventos financeiros (`ContaAzulItemFinanceiro`) trazem **`cliente: { id, nome }`** embutido — mas **não trazem CNPJ, e-mail, telefone, cidade/UF**.

### 1. Fluxo de sync utilizado
Reutilizar o `ContaAzulClient` (mesmo mecanismo de token com persistência). Criar uma **rotina de leitura dedicada** (read-only de clientes) que percorre `getContasReceber()` e **extrai clientes distintos** dos eventos — **sem** gravar financeiro. Nunca curl/API manual.

### 2. Tabelas lidas / populadas
- **Lê:** `conta_azul_tokens` (credenciais) e os eventos via API.
- **Popula:** uma tabela de **staging** nova (ex.: `stg_clientes_conta_azul`). **Não** tocar `clientes`, `lancamentos_financeiros` nem qualquer tabela de produção.

### 3. Staging ou produção?
**Staging isolado** (`stg_*`). Nenhuma escrita em produção nesta fase.

### 4. Campos coletados
| Campo | Disponível via eventos? | Origem |
|---|---|---|
| Código Conta Azul | ✅ | `cliente.id` |
| Razão social | ✅ (como `nome`) | `cliente.nome` |
| CNPJ | ❌ | exige endpoint de detalhe de pessoa (`/v1/pessoa/{id}`) — **subfase 1.3-B** |
| Nome fantasia | ❌ | idem |
| E-mail | ❌ | idem |
| Telefone | ❌ | idem |
| Cidade/UF | ❌ | idem |
| Status ativo/inativo | ❌ (parcial) | idem |

**Implicação:** a leitura mínima (1.3-A) entrega **código CA + razão social**. Para **CNPJ e contato** é preciso a **subfase 1.3-B** (adicionar um método read-only de detalhe de pessoa no client, reusando o mesmo token seguro). CNPJ é a chave forte do cruzamento — então 1.3-B é pré-requisito do match de alta confiança.

### 5. Como evitar refresh manual do OAuth
- Usar **exclusivamente** o `ContaAzulClient`/rotina server-side, que faz refresh via Cognito **e persiste** o token rotacionado.
- **Proibido:** `curl`/Postman/script manual no endpoint OAuth. O hook de guardrail (`PreToolUse-guardrails.sh`) já **bloqueia** curl em `auth.contaazul.com/oauth2/token`.
- Uma única execução por janela; sem chamadas paralelas ao refresh.

### 6. Como evitar sobrescrever dados existentes
- Gravar só em `stg_clientes_conta_azul`, com upsert por `codigo_ca`.
- Nunca `UPDATE`/`DELETE` em tabelas de produção. Contagem antes/depois para conferência.

### 7. Como evitar importar financeiro sem cliente
- A rotina de inventário **não grava lançamentos** — apenas lê eventos para extrair clientes.
- O vínculo cliente↔financeiro só acontece na **fase de reconciliação** (Golden Record), com validação humana — não agora.

### 8. Como registrar logs
- Registrar em `sync_log` com `fonte = 'conta_azul_inventario'`: início/fim, empresa, qtd de clientes lidos, erros. **Sem dados pessoais** no log (só contagens).

### 9. Como mascarar dados em relatório
- Relatórios só com **contagens e amostras anonimizadas**; CNPJ/CPF/e-mail mascarados; nunca identificadores individuais completos.

### 10. Primeira interseção SOC × Conta Azul por CNPJ
- **Pré-requisito:** subfase 1.3-B (coletar CNPJ do cliente CA). Sem CNPJ, o cruzamento inicial só seria por **razão social normalizada** (baixa confiança, alto risco de erro) — **não recomendado** como base.
- Com CNPJ: normalizar (só dígitos) dos dois lados e cruzar `stg_clientes_conta_azul.cnpj` × base SOC (2.179 CNPJs). Gerar indicadores: **em ambos**, **só no SOC**, **só no Conta Azul**.
- Preservar **código SOC** e **código CA** como chaves legadas em cada match.

### 11. Critérios go/no-go (antes de executar)
- ✅ Token CA válido para as empresas a ler (checar `conta_azul_tokens`).
- ✅ Tabela de staging criada e **isolada** de produção.
- ✅ Confirmação de que a rotina **não grava** em produção nem em `lancamentos_financeiros`.
- ✅ Volume estimado e janela definida.
- ✅ Autorização explícita do Cleber para executar.
- ❌ No-go se: token inválido, sem staging, ou qualquer escrita em produção no caminho.

### 12. Riscos
- **Queima de token:** mitigado pelo fluxo com persistência + bloqueio de curl no guardrail.
- **Cruzamento por nome** (sem CNPJ): falsos positivos → por isso 1.3-B antes do match.
- **Volume**: muitos eventos para varrer só para extrair clientes — preferir 1.3-B (endpoint de pessoa) que é mais direto.
- **LGPD**: dados de contato são pessoais → staging com acesso restrito, sem expor em relatório.

### 13. Rollback
- Como tudo fica em **staging isolado**, rollback = `TRUNCATE`/`DROP` da tabela `stg_clientes_conta_azul`. **Nenhum** impacto em produção, no Conta Azul ou no financeiro existente.

### 14. Confirmação
**Nada foi executado.** Esta seção é apenas planejamento. Nenhuma chamada à API do Conta Azul, nenhum sync, nenhuma importação, nenhuma alteração em banco/produção, nenhum token rotacionado, nenhum secret exposto.

---

## Apêndice — Diagnóstico inicial (leitura read-only desta data)

| Item | Situação |
|---|---|
| Empresas do grupo | 11 cadastradas (8 operacionais + extras); **CNPJ 0/11** |
| Financeiro (Conta Azul) | 49.143 lançamentos · 799 saldos · **sem vínculo a cliente** (`cliente_id` 0) |
| Clientes (tabela) | Existe, **vazia** (0) |
| SOC (funcionários/ASOs) | Tabelas existem, **vazias** (0) |
| D4Sign / contratos | Não importado (`contratos` 0) |
| CRM / RD Station | Não integrado no banco |
| SigeCloud | Não inventariado |
| Open Finance (Pluggy) | 1 conta conectada (piloto) |
| Coluna de integração | `empresas.os_global_id` existe (ligação com GP OS Core/Hub) |

**Leitura:** hoje só o **financeiro do Conta Azul** está consolidado, e mesmo assim **sem ligação a clientes**. SOC, D4Sign, CRM e SigeCloud ainda não foram trazidos. A maior lacuna estrutural é a **ausência do cadastro mestre de clientes e do vínculo cliente↔financeiro↔SST** — por isso o Golden Record (seção 5) é o eixo de tudo.
