---
name: soc-api
description: Como consultar a API SOC (ExportaDados) — máscaras conhecidas, parsing de datas brasileiras DD/MM/YYYY, helpers existentes em web/lib/soc/client.ts. Use quando trabalhar com integração SOC, ASOs, agendamentos, licenças, funcionários, exames ocupacionais ou qualquer dado de medicina/segurança vindo do sistema SOC.
---

# Skill: SOC API (ExportaDados)

## Quando usar
- Implementar nova consulta ao SOC
- Parsear datas no formato brasileiro DD/MM/YYYY
- Entender quais máscaras de exportação estão disponíveis
- Debug de dados vazios vindos do SOC

## Configuração
Variáveis em `.env.local`:
- `SOC_EMPRESA_PRINCIPAL` — código da empresa principal no SOC
- `SOC_USUARIO` — usuário ExportaDados
- `SOC_SENHA` — senha ExportaDados
- `SOC_MASK_*` — códigos das máscaras (ver tabela abaixo)

## Máscaras conhecidas

| Máscara ENV var | Conteúdo | Notas |
|---|---|---|
| `SOC_MASK_ASO` (191865) | Exames realizados — 1 linha por EXAME (audiometria, espirometria, etc) | **Não é 1 linha por ASO** — inflado para contagem de consultas |
| `SOC_MASK_EXAMES_DET` (193540) | Exames detalhados — tem `NOMEEXAME`, `UNIDADE`, `SAIASO`, `TIPOFICHA` | Use para contar Consultas Clínicas (ASOs verdadeiros) e detectar ASO pendente (`SAIASO` vazio) |
| `SOC_MASK_AGENDAMENTOS` (215357) | Agendamentos futuros | Geralmente só retorna FUTURO. Para passado usar `getAgendamentosRange()` |
| `SOC_MASK_LICENCAS` (163382) | Atestados/licenças com CID, horas perdidas, acidente de trajeto | |
| `SOC_MASK_FUNCIONARIOS` (192399) | Funcionários ativos por empresa | Campo `SITUACAO` = 'Ativo' / 'Demitido' / etc |
| `SOC_MASK_EMPRESAS` | Empresas-clientes com NUMERO_VIDAS (qtd de funcionários) | |

## Funções disponíveis em `web/lib/soc/client.ts`

```typescript
// Genérica (low-level)
exportaDados(mask, { empresaTrabalho?, dataInicio?, dataFim? }): Promise<unknown[]>

// High-level
getHistoricoFuncionarios()     // Mask ASO últimos 30d
getExamesPeriodo(ini, fim)     // Mask ASO período custom (formato DD/MM/YYYY)
getExamesDetalhados(dias=30)   // Mask exames detalhados — NÃO passar empresaTrabalho!
getAgendamentos()              // Mask agendamentos (futuros apenas)
getAgendamentosRange(diasAtras, diasFrente)  // Mescla histórico + futuro
getLicencasMedicas()           // Mask licenças últimos 30d
getLicencasPeriodo(ini, fim)   // Mask licenças período custom
getEmpresasClientes()          // Mask empresas
getTodosFuncionarios()         // Mask funcionários
socConfigurado()               // true se env vars presentes
```

## ⚠️ Armadilhas comuns

### 1. `empresaTrabalho` em `getExamesDetalhados`
**NÃO passar `empresaTrabalho` em `getExamesDetalhados()`**. Se passar, o SOC retorna apenas os exames feitos PELA SafeWork (funcionários internos), não os exames feitos PARA OUTRAS empresas-clientes — resultado: dados vazios no dashboard de medicina.

### 2. Timezone UTC
SOC retorna datas como `DD/MM/YYYY` ou `YYYY-MM-DDTHH:MM:SS`. `new Date("YYYY-MM-DD")` em UTC-3 cai no dia anterior! Sempre usar `parseDateLocal()`:

```typescript
function parseDateLocal(str?: string): Date | null {
  if (!str) return null
  if (str.includes('/')) {
    const p = str.split('/')
    return new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]))
  }
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]))
  return null
}
```

### 3. Pacote ASO duplicado
A categoria "Pacote ASO" no SOC duplica "Consulta Ocupacional" (mesmo conceito). Sempre filtrar:
```typescript
if (nomeRaw.toUpperCase().includes('PACOTE')) continue
```

### 4. Normalização de tipos de exame
SOC retorna códigos como `mon`, `per`, `adm`. Use `normalizarTipoExame()` para mostrar nome amigável.

### 5. Detecção de Consulta Ocupacional (ASO)
A "consulta" que gera o ASO. Use sempre normalize NFD para casar "CLÍNICO" com "CLINICO":
```typescript
function isConsultaOcupacional(nome?: string): boolean {
  if (!nome) return true
  const n = nome.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  return n.includes('CONSULTA') || n.includes('CLINICO') || n.includes('ASO')
}
```

## Referência: WS-Security
SOC ExportaDados usa SOAP com WS-Security. O client já trata isso. Não chamar diretamente — use as funções high-level.

## Códigos de empresas-clientes
Lista das ~8 empresas com tokens ativos: ver `~/.claude/projects/.../memory/project_soc_integration.md`.
