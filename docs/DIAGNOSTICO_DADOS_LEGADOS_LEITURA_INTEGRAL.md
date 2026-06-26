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
