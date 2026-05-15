// Cliente SOC — ExportaDados
// GET:  https://ws1.soc.com.br/WebSoc/exportadados?parametro={...}
// SOAP: https://ws1.soc.com.br/WSSoc/services/ExportaDadosWs  (sem WS-Security)
// Cada máscara tem formato "CODIGO:CHAVE" — ex: "191865:4cd18e43cd3b6ae93412"
//
// IMPORTANTE — formatos de data por máscara:
//   191865 (exames): dataInicio/dataFim em DD/MM/YYYY, janela máx. 30 dias
//   demais GET:       dataInicial/dataFinal em YYYY-MM-DD

const EMPRESA = process.env.SOC_EMPRESA ?? '289501'
const BASE_GET  = 'https://ws1.soc.com.br/WebSoc/exportadados'
const BASE_SOAP = 'https://ws1.soc.com.br/WSSoc/services/ExportaDadosWs'

const MASK_FUNCIONARIOS  = process.env.SOC_MASK_FUNCIONARIOS  ?? ''
const MASK_EMPRESAS      = process.env.SOC_MASK_EMPRESAS      ?? ''
const MASK_ASO           = process.env.SOC_MASK_ASO           ?? ''
const MASK_EPI           = process.env.SOC_MASK_EPI           ?? ''
const MASK_RISCOS        = process.env.SOC_MASK_RISCOS        ?? ''
const MASK_AGENDAMENTOS  = process.env.SOC_MASK_AGENDAMENTOS  ?? ''
const MASK_LICENCAS      = process.env.SOC_MASK_LICENCAS      ?? ''
const MASK_DOCUMENTOS      = process.env.SOC_MASK_DOCUMENTOS      ?? ''
const MASK_FATURAMENTO     = process.env.SOC_MASK_FATURAMENTO     ?? ''
const MASK_EXAMES_EMPRESA  = process.env.SOC_MASK_EXAMES_EMPRESA  ?? ''
const MASK_EXAMES_CODEXAME = process.env.SOC_MASK_EXAMES_CODEXAME ?? ''

export function socConfigurado(): boolean {
  return Boolean(MASK_FUNCIONARIOS || MASK_ASO || MASK_EPI)
}

export function socExportaConfigurado(): boolean {
  return socConfigurado()
}

// DD/MM/YYYY — formato exigido pelas máscaras de exames (191865, etc.)
function ddmmyyyy(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(date.getDate())}/${p(date.getMonth() + 1)}/${date.getFullYear()}`
}

// Chama ExportaDados via GET (máscaras com tipoSaida=json)
export async function exportaDados(mask: string, extras: Record<string, string> = {}): Promise<unknown[]> {
  const [codigo, chave] = mask.split(':')
  if (!codigo || !chave) throw new Error(`Máscara inválida: "${mask}"`)

  const params = JSON.stringify({ empresa: EMPRESA, codigo, chave, tipoSaida: 'json', ...extras })
  const url = `${BASE_GET}?parametro=${encodeURIComponent(params)}`

  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`SOC GET HTTP ${res.status}`)

  const text = await res.text()
  if (!text.trim().startsWith('[') && !text.trim().startsWith('{')) {
    throw new Error(`SOC GET resposta inesperada: ${text.slice(0, 200)}`)
  }

  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : Object.values(parsed)[0] as unknown[] ?? []
  } catch {
    return []
  }
}

// Chama ExportaDados via SOAP sem WS-Security
// Necessário para máscaras com "Método de acesso não permitido" no GET
export async function exportaSOAP(mask: string, extras: Record<string, string> = {}): Promise<unknown[]> {
  const [codigo, chave] = mask.split(':')
  if (!codigo || !chave) throw new Error(`Máscara inválida: "${mask}"`)

  const parametros = JSON.stringify({ empresa: EMPRESA, codigo, chave, tipoSaida: 'json', ...extras })
  const soap = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://services.soc.age.com/">
  <soapenv:Header/>
  <soapenv:Body>
    <ser:exportaDadosWs>
      <arg0><parametros><![CDATA[${parametros}]]></parametros></arg0>
    </ser:exportaDadosWs>
  </soapenv:Body>
</soapenv:Envelope>`

  const res = await fetch(BASE_SOAP, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml;charset=UTF-8', SOAPAction: '' },
    body: soap,
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`SOC SOAP HTTP ${res.status}`)

  const text = await res.text()
  const retorno = text.match(/<retorno>([\s\S]*?)<\/retorno>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '') ?? ''
  if (!retorno) {
    const erro = text.match(/<mensagemErro>(.*?)<\/mensagemErro>/)?.[1]
    throw new Error(`SOC SOAP erro: ${erro ?? 'resposta vazia'}`)
  }

  try {
    const parsed = JSON.parse(retorno)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// ─── Helpers para os agentes ──────────────────────────────────────────────────

// Máscara 215358 — retorna empresas com CODIGO, NOME, CNPJ, NUMERO_VIDAS (sem tipoSaida=json → XML)
export async function getEmpresasClientes(): Promise<Array<{ CODIGO: string; NOME: string; CNPJ?: string; NUMERO_VIDAS?: string }>> {
  if (!MASK_EMPRESAS) return []
  const [codigo, chave] = MASK_EMPRESAS.split(':')
  if (!codigo || !chave) return []
  const params = JSON.stringify({ empresa: EMPRESA, codigo, chave })
  const url = `${BASE_GET}?parametro=${encodeURIComponent(params)}`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) return []
    const text = await res.text()
    const rows = [...text.matchAll(/<linha>([\s\S]*?)<\/linha>/g)]
    return rows.map(([, inner]) => {
      const get = (tag: string) => inner.match(new RegExp(`<${tag}>(.*?)</${tag}>`))?.[1] ?? ''
      return { CODIGO: get('CODIGO'), NOME: get('NOME'), CNPJ: get('CNPJ'), NUMERO_VIDAS: get('NUMERO_VIDAS') }
    })
  } catch { return [] }
}

// Máscara 192399 — funcionários por empresa (CODIGO, NOME, SITUACAO, DATA_ADMISSAO, etc.)
// Requer empresaTrabalho = código específico da empresa (não retorna todos com vazio)
export async function getFuncionarios(empresaTrabalho = EMPRESA): Promise<unknown[]> {
  if (!MASK_FUNCIONARIOS) return []
  return exportaDados(MASK_FUNCIONARIOS, { empresaTrabalho }).catch(() => [])
}

// Retorna funcionários de TODAS as empresas ativas (loop por getEmpresasClientes)
// Usa NUMERO_VIDAS para filtrar só empresas com funcionários
export async function getTodosFuncionarios(): Promise<unknown[]> {
  if (!MASK_FUNCIONARIOS) return []
  const empresas = await getEmpresasClientes()
  const comVidas = empresas.filter(e => Number(e.NUMERO_VIDAS ?? 0) > 0)
  if (comVidas.length === 0) {
    // fallback: tenta empresa principal
    return getFuncionarios(EMPRESA)
  }
  const resultados: unknown[] = []
  for (const emp of comVidas) {
    const funcionarios = await exportaDados(MASK_FUNCIONARIOS, { empresaTrabalho: emp.CODIGO }).catch(() => [] as unknown[])
    resultados.push(...funcionarios)
    // respeita limite de 5 requisições simultâneas do SOC
    await new Promise(r => setTimeout(r, 300))
  }
  return resultados
}

// Máscara 215357 — agendamentos com intervalo customizado (para gráficos históricos)
// diasAtras > 0 = passado; diasAFrente > 0 = futuro
export async function getAgendamentosRange(diasAtras = 0, diasAFrente = 30): Promise<unknown[]> {
  if (!MASK_AGENDAMENTOS) return []
  const [codigo, chave] = MASK_AGENDAMENTOS.split(':')
  if (!codigo || !chave) return []
  const ini = new Date(Date.now() - diasAtras * 86_400_000).toISOString().split('T')[0]
  const fim = new Date(Date.now() + diasAFrente * 86_400_000).toISOString().split('T')[0]
  const params = JSON.stringify({
    empresa: EMPRESA, codigo, chave,
    tipoSaida: 'xml',
    codigoUsuarioAgenda: '',
    dataInicial: ini,
    dataFinal: fim,
  })
  try {
    const res = await fetch(`${BASE_GET}?parametro=${encodeURIComponent(params)}`, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) return []
    const text = await res.text()
    const rows = [...text.matchAll(/<linha>([\s\S]*?)<\/linha>/g)]
    if (rows.length === 0) return []
    return rows.map(([, inner]) => {
      const tags = [...inner.matchAll(/<(\w+)>(.*?)<\/\1>/g)]
      return Object.fromEntries(tags.map(([, tag, val]) => [tag, val]))
    })
  } catch { return [] }
}

// Máscara 215357 — agendamentos (tipoSaida suportado: xml, não json)
// Campos: CODIGOUSUARIOAGENDA, NOMEAGENDA, CODIGOEMPRESA, NOMEEMPRESA, CODIGOFUNCIONARIO,
//   NOMEFUNCIONARIO, CPFFUNCIONARIO, DATANASCIMENTOFUNCIONARIO, SEXOFUNCIONARIO,
//   DATACOMPROMISSO, RGFUNCIONARIO, UFRGFUNCIONARIO, CELULARFUNCIONARIO, EMAILFUNCIONARIO,
//   LOGRADOUROFUNCIONARIO, NUMEROLOGRADOUROFUNCIONARIO, BAIRROFUNCIONARIO, CIDADEFUNCIONARIO,
//   UFFUNCIONARIO, CEPFUNCIONARIO
// TIPOCOMPROMISSO: 1=Periódico, 2=Admissional, 3=Retorno, 4=Mudança Função, 5=Demissional, 6=Monitoramento, 10=Consulta
export async function getAgendamentos(_empresaTrabalho = EMPRESA): Promise<unknown[]> {
  if (!MASK_AGENDAMENTOS) return []
  const [codigo, chave] = MASK_AGENDAMENTOS.split(':')
  if (!codigo || !chave) return []
  const hoje = new Date().toISOString().split('T')[0]
  const fim  = new Date(Date.now() + 30 * 86_400_000).toISOString().split('T')[0]
  const params = JSON.stringify({
    empresa: EMPRESA, codigo, chave,
    tipoSaida: 'xml',
    codigoUsuarioAgenda: '',
    dataInicial: hoje,
    dataFinal: fim,
  })
  try {
    const res = await fetch(`${BASE_GET}?parametro=${encodeURIComponent(params)}`, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) return []
    const text = await res.text()
    const rows = [...text.matchAll(/<linha>([\s\S]*?)<\/linha>/g)]
    if (rows.length === 0) return []
    return rows.map(([, inner]) => {
      const tags = [...inner.matchAll(/<(\w+)>(.*?)<\/\1>/g)]
      return Object.fromEntries(tags.map(([, tag, val]) => [tag, val]))
    })
  } catch { return [] }
}

// Exames realizados — máscara 191865
// dataInicio/dataFim em DD/MM/YYYY, janela máx. 30 dias
export async function getHistoricoFuncionarios(_empresaTrabalho = EMPRESA): Promise<unknown[]> {
  if (!MASK_ASO) return []
  const hoje  = ddmmyyyy(new Date())
  const ini30 = ddmmyyyy(new Date(Date.now() - 30 * 86_400_000))
  return exportaDados(MASK_ASO, { dataInicio: ini30, dataFim: hoje }).catch(() => [])
}

// Máscara 193046 — EPIs por funcionário (vinculados ao GHE/riscos)
// Campos: EMPRESA, MATRICULA, NOME_EPI, CODIGO_EPI, CODIGO_CA, DATA_VENCIMENTO,
//   DATA_TROCA (sempre vazio), QUANTIDADE_ENTREGUE (sempre 1), REPOSICAO, TIPO_REPOSICAO
// matriculaFuncionario vazio → tenta retornar todos (não confirmado)
export async function getEntregasEpi(matriculaFuncionario = ''): Promise<unknown[]> {
  if (!MASK_EPI) return []
  return exportaDados(MASK_EPI, { matriculaFuncionario }).catch(() => [])
}

// Máscara 193691 — GHE (Grupos Homogêneos de Exposição)
// tipoSaida suportado: xml (não json)
// Campos camelCase: codigoGhe, descricaoGhe, codigoUnidadeCliente,
//   maiorAdicionalInsalubridade, existePericulosidade, existeAposentadoriaEspecial, maiorPeriodoAposentadoria
export async function getRiscos(_empresaTrabalho = EMPRESA): Promise<unknown[]> {
  if (!MASK_RISCOS) return []
  const [codigo, chave] = MASK_RISCOS.split(':')
  if (!codigo || !chave) return []
  const params = JSON.stringify({ empresa: EMPRESA, codigo, chave, tipoSaida: 'xml', situacaoGhe: 'Ativo' })
  try {
    const res = await fetch(`${BASE_GET}?parametro=${encodeURIComponent(params)}`, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) return []
    const text = await res.text()
    const rows = [...text.matchAll(/<linha>([\s\S]*?)<\/linha>/g)]
    if (rows.length === 0) return []
    return rows.map(([, inner]) => {
      const tags = [...inner.matchAll(/<(\w+)>(.*?)<\/\1>/g)]
      return Object.fromEntries(tags.map(([, tag, val]) => [tag, val]))
    })
  } catch { return [] }
}

// Máscara 215356 — vencimentos de documentos/serviços (ASO, PPRA, PCMSO, etc.)
// Campos: CODIGO_CLIENTE, NOME_PRODUTO, LOCAL_TRABALHO, DATA_VENCIMENTO
// Observação: ano=0 significa vencimento recorrente (só dia/mês, sem ano fixo)
// codigoProduto obrigatório — deixar vazio retorna todos os produtos disponíveis
export async function getDocumentosVencimentos(empresaCliente = EMPRESA, codigoProduto = ''): Promise<unknown[]> {
  if (!MASK_DOCUMENTOS) return []
  return exportaDados(MASK_DOCUMENTOS, { empresaCliente, codigoProduto }).catch(() => [])
}

// Máscara 163382 — licenças médicas
// dataInicio/dataFim em DD/MM/YYYY, janela máx. 31 dias
// Campos: CODCID, NOMEFUNCIONARIO, DATA_INICIO_LICENCA, DATA_FIM_LICENCAO, AFASTAMENTO_EM_HORAS,
//   MOTIVO_LICENCA, TIPO_LICENCA, SITUACAO, MEDICO, ACIDENTE_TRAJETO, etc.
export async function getLicencasMedicas(empresaTrabalho = EMPRESA): Promise<unknown[]> {
  if (!MASK_LICENCAS) return []
  const hoje  = ddmmyyyy(new Date())
  const ini31 = ddmmyyyy(new Date(Date.now() - 31 * 86_400_000))
  return exportaDados(MASK_LICENCAS, { empresaTrabalho, dataInicio: ini31, dataFim: hoje }).catch(() => [])
}

// Máscara 193540 — Exames realizados por empresa (XML, tipoSaida não suporta JSON)
// Campos: EMPRESA, CODFUNCIONARIO, NOMEFUNCIONARIO, MATRICULA, DATAFICHA, TIPOFICHA,
//   DATAEXAMES, CODEXAME, NOMEEXAME, EXAMEALTERADO, SAIASO, UNIDADE, SETOR, CARGO,
//   CPF, CODIGOSEQUENCIALFICHA, CODIGOSEQUENCIALRESULTADO, PARECERASO
// SAIASO: APT=Apto | INAPTO=Inapto | APT_R=Apto c/ restrições | others
// Parâmetros: dataInicio/dataFim em DD/MM/YYYY
// Nota: não passa empresaTrabalho — retorna todos os exames da conta SafeWork
export async function getExamesDetalhados(diasAtras = 30): Promise<unknown[]> {
  if (!MASK_EXAMES_EMPRESA) return []
  const [codigo, chave] = MASK_EXAMES_EMPRESA.split(':')
  if (!codigo || !chave) return []
  const hoje = new Date()
  const ini  = new Date(Date.now() - diasAtras * 86_400_000)
  const params = JSON.stringify({
    empresa: EMPRESA, codigo, chave,
    tipoSaida: 'xml',
    dataInicio: ddmmyyyy(ini),
    dataFim: ddmmyyyy(hoje),
  })
  try {
    const res = await fetch(`${BASE_GET}?parametro=${encodeURIComponent(params)}`, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) return []
    const text = await res.text()
    const rows = [...text.matchAll(/<linha>([\s\S]*?)<\/linha>/g)]
    if (rows.length === 0) return []
    return rows.map(([, inner]) => {
      const tags = [...inner.matchAll(/<(\w+)>([\s\S]*?)<\/\1>/g)]
      return Object.fromEntries(tags.map(([, tag, val]) => [tag, val.trim()]))
    })
  } catch { return [] }
}

// Máscara 215360 — Exames por código de exame (XML)
// codexame vazio = todos; filtra por tipo de exame específico (ex: audiometria)
// Parâmetros: dataInicio/datafim em DD/MM/YYYY, codexame (opcional)
export async function getExamesPorCodigo(codexame = '', diasAtras = 30): Promise<unknown[]> {
  if (!MASK_EXAMES_CODEXAME) return []
  const [codigo, chave] = MASK_EXAMES_CODEXAME.split(':')
  if (!codigo || !chave) return []
  const hoje = new Date()
  const ini  = new Date(Date.now() - diasAtras * 86_400_000)
  const params = JSON.stringify({
    empresa: EMPRESA, codigo, chave,
    tipoSaida: 'xml',
    dataInicio: ddmmyyyy(ini),
    datafim: ddmmyyyy(hoje),
    codexame,
  })
  try {
    const res = await fetch(`${BASE_GET}?parametro=${encodeURIComponent(params)}`, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) return []
    const text = await res.text()
    const rows = [...text.matchAll(/<linha>([\s\S]*?)<\/linha>/g)]
    if (rows.length === 0) return []
    return rows.map(([, inner]) => {
      const tags = [...inner.matchAll(/<(\w+)>([\s\S]*?)<\/\1>/g)]
      return Object.fromEntries(tags.map(([, tag, val]) => [tag, val.trim()]))
    })
  } catch { return [] }
}

// Exames para período arbitrário (datas em DD/MM/YYYY) — usado para comparação mensal
export async function getExamesPeriodo(dataInicio: string, dataFim: string): Promise<unknown[]> {
  if (!MASK_ASO) return []
  return exportaDados(MASK_ASO, { dataInicio, dataFim }).catch(() => [])
}

// Licenças para período arbitrário (datas em DD/MM/YYYY)
export async function getLicencasPeriodo(dataInicio: string, dataFim: string): Promise<unknown[]> {
  if (!MASK_LICENCAS) return []
  return exportaDados(MASK_LICENCAS, { empresaTrabalho: EMPRESA, dataInicio, dataFim }).catch(() => [])
}

// Máscara 163368 — faturamento da empresa
// tipoSaida: xml (não json); dataInicio/dataFim em DD/MM/YYYY
// Campos: CODIGO_EMPRESA, EMPRESA, CODIGO_UNIDADE, UNIDADE, CODIGO_PRODUTO, PRODUTO,
//   MES_COBRANCA, QUANTIDADE_VIDAS, VALOR_VIDA, VALOR_TOTAL, QUANTIDADE_EVENTOS_ESOCIAL, VALOR_EVENTO
export async function getFaturamento(mesesAtras = 3): Promise<unknown[]> {
  if (!MASK_FATURAMENTO) return []
  const [codigo, chave] = MASK_FATURAMENTO.split(':')
  if (!codigo || !chave) return []
  const hoje = new Date()
  const ini  = new Date(hoje.getFullYear(), hoje.getMonth() - mesesAtras, 1)
  const params = JSON.stringify({
    empresa: EMPRESA, codigo, chave,
    tipoSaida: 'xml',
    dataInicio: ddmmyyyy(ini),
    dataFim: ddmmyyyy(hoje),
  })
  try {
    const res = await fetch(`${BASE_GET}?parametro=${encodeURIComponent(params)}`, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) return []
    const text = await res.text()
    const rows = [...text.matchAll(/<linha>([\s\S]*?)<\/linha>/g)]
    if (rows.length === 0) return []
    return rows.map(([, inner]) => {
      const tags = [...inner.matchAll(/<(\w+)>(.*?)<\/\1>/g)]
      return Object.fromEntries(tags.map(([, tag, val]) => [tag, val]))
    })
  } catch { return [] }
}
