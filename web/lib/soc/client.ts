// Cliente SOC — ExportaDados
//
// NENHUMA função aqui engole erro devolvendo lista vazia. Já engoliram, e o
// efeito foi que o SOC fora do ar virava "nenhum ASO vencido, nenhuma licença"
// no dashboard de medicina — com o selo verde de "SOC conectado" no cabeçalho,
// porque ele só olhava se a credencial existia. Zero por falha e zero de
// verdade são coisas diferentes, e aqui a diferença tem consequência legal.
//
// A exceção é getTodosFuncionarios, que varre empresa por empresa: lá uma
// empresa falhar não pode derrubar as outras, e a falha é por item.
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
const MASK_COMPROMISSOS  = process.env.SOC_MASK_COMPROMISSOS  ?? ''

// Códigos das 7 agendas SOC (codigoUsuarioAgenda) — IDs de cadastro, não são segredos
// New Life, Rede Credenciada, Foz, Londrina, Medianeira, Santa Helena, São Miguel
const CODIGOS_AGENDAS = ['02746781', '01929818', '01463906', '01463660', '00134153', '01463775', '03572569']
const MASK_LICENCAS      = process.env.SOC_MASK_LICENCAS      ?? ''
const MASK_DOCUMENTOS      = process.env.SOC_MASK_DOCUMENTOS      ?? ''
const MASK_FATURAMENTO     = process.env.SOC_MASK_FATURAMENTO     ?? ''
const MASK_EXAMES_EMPRESA  = process.env.SOC_MASK_EXAMES_EMPRESA  ?? ''
const MASK_EXAMES_CODEXAME = process.env.SOC_MASK_EXAMES_CODEXAME ?? ''

/**
 * Lê a resposta do SOC respeitando o encoding que ele realmente usa.
 *
 * O ExportaDados devolve ISO-8859-1 sem declarar charset, e `res.text()` assume
 * UTF-8. O resultado é acento virando "Fun\uFFFDo": chegou assim ao espelho em
 * "Apto para Fun��o", "Inapto para Fun��o", nomes de funcionários e
 * "SAFEWORK LONDRINA (PR�PRIO)".
 *
 * Estraga mais do que a estética — quebra qualquer comparação por texto e
 * qualquer busca por nome. Decodifica como UTF-8 primeiro e, se aparecer
 * caractere de substituição, refaz como latin-1.
 */
async function lerTexto(res: Response): Promise<string> {
  const bytes = await res.arrayBuffer()
  const utf8 = new TextDecoder('utf-8').decode(bytes)
  if (!utf8.includes('\uFFFD')) return utf8
  return new TextDecoder('iso-8859-1').decode(bytes)
}

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

// Parser XML do SOC — aceita tanto <record> (formato atual da API) quanto
// <linha> (formato legado, mantido por compatibilidade).
// Extrai todos os pares <TAG>valor</TAG> de dentro de cada record/linha.
function parseSocXmlRows(text: string): Record<string, string>[] {
  // Tenta record primeiro (formato atual), depois linha (legado)
  let matches = [...text.matchAll(/<record>([\s\S]*?)<\/record>/g)]
  if (matches.length === 0) {
    matches = [...text.matchAll(/<linha>([\s\S]*?)<\/linha>/g)]
  }
  if (matches.length === 0) {
    // O SOC recusa em português puro, com HTTP 200 e sem uma tag sequer:
    // "Metodo de acesso não permitido" é o que a máscara 193691 (GHE) responde
    // hoje, e sem esta checagem a frase caía aqui e virava zero riscos no
    // painel de Engenharia — indistinguível de uma carteira sem risco algum.
    const limpo = text.trim()
    if (limpo && !limpo.startsWith('<')) {
      throw new Error(`SOC recusou a consulta: ${limpo.slice(0, 200)}`)
    }
    return []
  }
  return matches.map(([, inner]) => {
    const tags = [...inner.matchAll(/<(\w+)>([\s\S]*?)<\/\1>/g)]
    return Object.fromEntries(tags.map(([, tag, val]) => [tag, val.trim()]))
  })
}

// Chama ExportaDados via GET (máscaras com tipoSaida=json)
export async function exportaDados(mask: string, extras: Record<string, string> = {}): Promise<unknown[]> {
  const [codigo, chave] = mask.split(':')
  if (!codigo || !chave) throw new Error(`Máscara inválida: "${mask}"`)

  const params = JSON.stringify({ empresa: EMPRESA, codigo, chave, tipoSaida: 'json', ...extras })
  const url = `${BASE_GET}?parametro=${encodeURIComponent(params)}`

  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`SOC GET HTTP ${res.status}`)

  const text = await lerTexto(res)
  if (!text.trim().startsWith('[') && !text.trim().startsWith('{')) {
    throw new Error(`SOC GET resposta inesperada: ${text.slice(0, 200)}`)
  }

  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : Object.values(parsed)[0] as unknown[] ?? []
  } catch {
    // Resposta que não é JSON é falha do SOC, não ausência de registro.
    throw new Error(`SOC GET devolveu resposta ilegível: ${text.slice(0, 200)}`)
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

  const text = await lerTexto(res)
  const retorno = text.match(/<retorno>([\s\S]*?)<\/retorno>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '') ?? ''
  if (!retorno) {
    const erro = text.match(/<mensagemErro>(.*?)<\/mensagemErro>/)?.[1]
    throw new Error(`SOC SOAP erro: ${erro ?? 'resposta vazia'}`)
  }

  try {
    const parsed = JSON.parse(retorno)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    throw new Error(`SOC SOAP devolveu retorno ilegível: ${retorno.slice(0, 200)}`)
  }
}

// ─── Helpers para os agentes ──────────────────────────────────────────────────

// Máscara 215358 — retorna empresas com CODIGO, NOME, CNPJ, NUMERO_VIDAS (sem tipoSaida=json → XML)
// A API SOC retorna <record>...</record> envolvido em <root>.
export async function getEmpresasClientes(): Promise<Array<{ CODIGO: string; NOME: string; CNPJ?: string; NUMERO_VIDAS?: string }>> {
  if (!MASK_EMPRESAS) return []
  const [codigo, chave] = MASK_EMPRESAS.split(':')
  if (!codigo || !chave) return []
  const params = JSON.stringify({ empresa: EMPRESA, codigo, chave })
  const url = `${BASE_GET}?parametro=${encodeURIComponent(params)}`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) throw new Error(`SOC empresas: HTTP ${res.status}`)
    const text = await lerTexto(res)
    return parseSocXmlRows(text).map(r => ({
      CODIGO: r.CODIGO ?? '',
      NOME: r.NOME ?? '',
      CNPJ: r.CNPJ ?? '',
      NUMERO_VIDAS: r.NUMERO_VIDAS ?? '',
    }))
  } catch (e) {
    // Lista de empresas vazia faria toda tela que a usa parecer "sem clientes".
    throw e instanceof Error ? e : new Error(String(e))
  }
}

// Máscara 203461 — Compromissos de funcionários (agendamentos das 7 agendas SafeWork)
// DESCOBERTAS (testado contra a API em 2026-05):
//   • Só funciona via SOAP (GET → "Método de acesso não permitido")
//   • Datas em DD/MM/YYYY (YYYY-MM-DD → "campo dataInicial é um campo Data")
//   • Filtro correto é codigoUsuarioAgenda (NÃO codigosAgendamentos)
//   • Múltiplos códigos numa chamada travam a query → buscar 1 agenda por chamada
//   • SITUACAO vem como TEXTO: "Atendido" | "Não Atendido"
// Campos (camelCase normalizado p/ UPPERCASE): DATACOMPROMISSO, NOMEAGENDA, NOMEEMPRESA,
//   NOMEFUNCIONARIO, TIPOCOMPROMISSO, NOMETIPOCOMPROMISSO, SITUACAO, HORAINICIO, HORAFIM,
//   HORACHEGADA, HORASAIDA, NOMECOMPROMISSO, NOMEPROFISSIONALAGENDA
export async function getCompromissos(params: {
  dataInicial?: string   // YYYY-MM-DD ou DD/MM/YYYY
  dataFinal?: string     // YYYY-MM-DD ou DD/MM/YYYY
} = {}): Promise<Record<string, string>[]> {
  if (!MASK_COMPROMISSOS) return []
  const [codigo, chave] = MASK_COMPROMISSOS.split(':')
  if (!codigo || !chave) return []

  const paraDDMM = (s: string): string => {
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
    return m ? `${m[3]}/${m[2]}/${m[1]}` : s
  }
  const hojeIso = new Date().toISOString().split('T')[0]
  const fim30Iso = new Date(Date.now() + 30 * 86_400_000).toISOString().split('T')[0]
  let agendasComFalha = 0
  const dataInicial = paraDDMM(params.dataInicial ?? hojeIso)
  const dataFinal = paraDDMM(params.dataFinal ?? fim30Iso)

  async function buscarAgenda(codigoUsuarioAgenda: string): Promise<Record<string, string>[]> {
    const parametros = JSON.stringify({
      empresa: EMPRESA, codigo, chave, tipoSaida: 'json',
      codigoUsuarioAgenda, dataInicial, dataFinal,
    })
    const soap = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://services.soc.age.com/">
  <soapenv:Header/>
  <soapenv:Body>
    <ser:exportaDadosWs>
      <arg0><parametros><![CDATA[${parametros}]]></parametros></arg0>
    </ser:exportaDadosWs>
  </soapenv:Body>
</soapenv:Envelope>`
    try {
      const res = await fetch(BASE_SOAP, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml;charset=UTF-8', SOAPAction: '' },
        body: soap,
        signal: AbortSignal.timeout(45_000),
      })
      if (!res.ok) return []
      const text = await lerTexto(res)
      const retorno = text.match(/<retorno>([\s\S]*?)<\/retorno>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '') ?? ''
      if (!retorno) return []
      const parsed = JSON.parse(retorno)
      const rows: Record<string, unknown>[] = Array.isArray(parsed) ? parsed : []
      // Normaliza chaves p/ UPPERCASE e decodifica &amp; → &
      return rows.map(row =>
        Object.fromEntries(
          Object.entries(row).map(([k, v]) => [k.toUpperCase(), String(v ?? '').replace(/&amp;/g, '&')])
        )
      )
    } catch {
      // Isolado de propósito: uma clínica fora não pode zerar as outras seis.
      agendasComFalha++
      return []
    }
  }

  // Busca em chunks de 4 (respeita limite de requisições simultâneas do SOC)
  const todos: Record<string, string>[] = []
  for (let i = 0; i < CODIGOS_AGENDAS.length; i += 4) {
    const chunk = CODIGOS_AGENDAS.slice(i, i + 4)
    const res = await Promise.all(chunk.map(buscarAgenda))
    for (const r of res) todos.push(...r)
  }
  // Todas as agendas falharem não é "nenhum compromisso": é o SOC fora.
  // Devolver lista vazia aqui apagaria a agenda inteira do mês sem avisar.
  if (agendasComFalha === CODIGOS_AGENDAS.length) {
    throw new Error(`SOC agenda: as ${CODIGOS_AGENDAS.length} agendas falharam`)
  }
  return todos
}

// Máscara 192399 — funcionários por empresa (CODIGO, NOME, SITUACAO, DATA_ADMISSAO, etc.)
// Requer empresaTrabalho = código específico da empresa (não retorna todos com vazio)
export async function getFuncionarios(empresaTrabalho = EMPRESA): Promise<unknown[]> {
  if (!MASK_FUNCIONARIOS) return []
  return exportaDados(MASK_FUNCIONARIOS, { empresaTrabalho })
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

// Agendamentos com intervalo customizado — usa máscara 203461 (nova) se disponível
// diasAtras > 0 = passado; diasAFrente > 0 = futuro
export async function getAgendamentosRange(diasAtras = 0, diasAFrente = 30): Promise<unknown[]> {
  const ini = new Date(Date.now() - diasAtras * 86_400_000).toISOString().split('T')[0]
  const fim = new Date(Date.now() + diasAFrente * 86_400_000).toISOString().split('T')[0]
  if (MASK_COMPROMISSOS) return getCompromissos({ dataInicial: ini, dataFinal: fim })
  if (!MASK_AGENDAMENTOS) return []
  const [codigo, chave] = MASK_AGENDAMENTOS.split(':')
  if (!codigo || !chave) return []
  const params = JSON.stringify({ empresa: EMPRESA, codigo, chave, tipoSaida: 'xml', codigoUsuarioAgenda: '', dataInicial: ini, dataFinal: fim })
  const res = await fetch(`${BASE_GET}?parametro=${encodeURIComponent(params)}`, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`SOC: HTTP ${res.status}`)
  return parseSocXmlRows(await lerTexto(res))
}

// Agendamentos próximos 30 dias — usa máscara 203461 (nova) se disponível
// Campos disponíveis: DATACOMPROMISSO, NOMEAGENDA, NOMEEMPRESA, NOMEFUNCIONARIO,
//   TIPOCOMPROMISSO, NOMETIPOCOMPROMISSO, SITUACAO, HORAINICIO, HORAFIM
// NOTA: não recebe empresa. A máscara responde pela conta configurada em
// EMPRESA, e aceitar um parâmetro que o corpo ignora fazia a assinatura
// prometer um filtro que não existe — foi assim que getExamesDetalhados passou
// meses devolvendo vazio, porque o SOC exigia empresaTrabalho e ninguém
// passava.
export async function getAgendamentos(): Promise<unknown[]> {
  const hoje = new Date().toISOString().split('T')[0]
  const fim  = new Date(Date.now() + 30 * 86_400_000).toISOString().split('T')[0]
  if (MASK_COMPROMISSOS) return getCompromissos({ dataInicial: hoje, dataFinal: fim })
  if (!MASK_AGENDAMENTOS) return []
  const [codigo, chave] = MASK_AGENDAMENTOS.split(':')
  if (!codigo || !chave) return []
  const params = JSON.stringify({ empresa: EMPRESA, codigo, chave, tipoSaida: 'xml', codigoUsuarioAgenda: '', dataInicial: hoje, dataFinal: fim })
  const res = await fetch(`${BASE_GET}?parametro=${encodeURIComponent(params)}`, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`SOC: HTTP ${res.status}`)
  return parseSocXmlRows(await lerTexto(res))
}

// Exames realizados — máscara 191865
// dataInicio/dataFim em DD/MM/YYYY, janela máx. 30 dias
// NOTA: não recebe empresa. A máscara responde pela conta configurada em
// EMPRESA, e aceitar um parâmetro que o corpo ignora fazia a assinatura
// prometer um filtro que não existe — foi assim que getExamesDetalhados passou
// meses devolvendo vazio, porque o SOC exigia empresaTrabalho e ninguém
// passava.
export async function getHistoricoFuncionarios(): Promise<unknown[]> {
  if (!MASK_ASO) return []
  const hoje  = ddmmyyyy(new Date())
  const ini30 = ddmmyyyy(new Date(Date.now() - 30 * 86_400_000))
  return exportaDados(MASK_ASO, { dataInicio: ini30, dataFim: hoje })
}

// Máscara 193046 — EPIs por funcionário (vinculados ao GHE/riscos)
// Campos: EMPRESA, MATRICULA, NOME_EPI, CODIGO_EPI, CODIGO_CA, DATA_VENCIMENTO,
//   DATA_TROCA (sempre vazio), QUANTIDADE_ENTREGUE (sempre 1), REPOSICAO, TIPO_REPOSICAO
// matriculaFuncionario vazio → tenta retornar todos (não confirmado)
export async function getEntregasEpi(matriculaFuncionario = ''): Promise<unknown[]> {
  if (!MASK_EPI) return []
  return exportaDados(MASK_EPI, { matriculaFuncionario })
}

// Máscara 193691 — GHE (Grupos Homogêneos de Exposição)
// tipoSaida suportado: xml (não json)
// Campos camelCase: codigoGhe, descricaoGhe, codigoUnidadeCliente,
//   maiorAdicionalInsalubridade, existePericulosidade, existeAposentadoriaEspecial, maiorPeriodoAposentadoria
// NOTA: não recebe empresa. A máscara responde pela conta configurada em
// EMPRESA, e aceitar um parâmetro que o corpo ignora fazia a assinatura
// prometer um filtro que não existe — foi assim que getExamesDetalhados passou
// meses devolvendo vazio, porque o SOC exigia empresaTrabalho e ninguém
// passava.
export async function getRiscos(): Promise<unknown[]> {
  if (!MASK_RISCOS) return []
  const [codigo, chave] = MASK_RISCOS.split(':')
  if (!codigo || !chave) return []
  const params = JSON.stringify({ empresa: EMPRESA, codigo, chave, tipoSaida: 'xml', situacaoGhe: 'Ativo' })
  const res = await fetch(`${BASE_GET}?parametro=${encodeURIComponent(params)}`, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`SOC: HTTP ${res.status}`)
  return parseSocXmlRows(await lerTexto(res))
}

// Máscara 215356 — vencimentos de documentos/serviços (ASO, PPRA, PCMSO, etc.)
// Campos: CODIGO_CLIENTE, NOME_PRODUTO, LOCAL_TRABALHO, DATA_VENCIMENTO
// Observação: ano=0 significa vencimento recorrente (só dia/mês, sem ano fixo)
// codigoProduto obrigatório — deixar vazio retorna todos os produtos disponíveis
export async function getDocumentosVencimentos(empresaCliente = EMPRESA, codigoProduto = ''): Promise<unknown[]> {
  if (!MASK_DOCUMENTOS) return []
  return exportaDados(MASK_DOCUMENTOS, { empresaCliente, codigoProduto })
}

// Máscara 163382 — licenças médicas
// dataInicio/dataFim em DD/MM/YYYY, janela máx. 31 dias
// Campos: CODCID, NOMEFUNCIONARIO, DATA_INICIO_LICENCA, DATA_FIM_LICENCAO, AFASTAMENTO_EM_HORAS,
//   MOTIVO_LICENCA, TIPO_LICENCA, SITUACAO, MEDICO, ACIDENTE_TRAJETO, etc.
export async function getLicencasMedicas(empresaTrabalho = EMPRESA): Promise<unknown[]> {
  if (!MASK_LICENCAS) return []
  const hoje  = ddmmyyyy(new Date())
  const ini31 = ddmmyyyy(new Date(Date.now() - 31 * 86_400_000))
  return exportaDados(MASK_LICENCAS, { empresaTrabalho, dataInicio: ini31, dataFim: hoje })
}

// Máscara 193540 — Exames realizados, COM identificação do trabalhador.
// Campos: EMPRESA, CODFUNCIONARIO, NOMEFUNCIONARIO, MATRICULA, CPF, DATAFICHA,
//   TIPOFICHA, DATAEXAME, CODEXAME, NOMEEXAME, EXAMEALTERADO, SAIASO, UNIDADE,
//   SETOR, CARGO, CODIGOSEQUENCIALFICHA, CODIGOSEQUENCIALRESULTADO, PARECERASO
// SAIASO: APT=Apto | INAPTO=Inapto | APT_R=Apto c/ restrições
//
// empresaTrabalho é OBRIGATÓRIO e tem de ser o código de uma empresa CLIENTE.
// O comentário anterior aqui dizia o oposto ("não passa empresaTrabalho —
// retorna todos os exames da conta SafeWork"), e por isso a função vinha
// devolvendo lista vazia havia tempo: o SOC responde
// "O campo empresaTrabalho é obrigatório." com HTTP 200 e texto puro, o parser
// de XML não encontra linha nenhuma e o resultado sai como zero exames.
//
// Esta é a máscara que permite ASO vencido (>365 dias sem consulta clínica por
// TRABALHADOR) e ASO pendente (SAIASO vazio) — a 191865, usada em
// getExamesPeriodo, não identifica a pessoa.
export async function getExamesDetalhados(diasAtras = 30, empresaTrabalho?: string): Promise<unknown[]> {
  if (!MASK_EXAMES_EMPRESA) return []
  if (!empresaTrabalho) {
    throw new Error(
      '[ContaAzul/SOC] getExamesDetalhados exige empresaTrabalho (código da empresa cliente). ' +
      'Sem ele o SOC responde "campo obrigatório" com HTTP 200 e o retorno vira lista vazia.'
    )
  }
  const [codigo, chave] = MASK_EXAMES_EMPRESA.split(':')
  if (!codigo || !chave) return []
  const hoje = new Date()
  const ini  = new Date(Date.now() - diasAtras * 86_400_000)
  const params = JSON.stringify({
    empresa: EMPRESA, codigo, chave,
    tipoSaida: 'json',
    empresaTrabalho,
    dataInicio: ddmmyyyy(ini),
    dataFim: ddmmyyyy(hoje),
  })
  const res = await fetch(`${BASE_GET}?parametro=${encodeURIComponent(params)}`, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(`SOC exames detalhados: HTTP ${res.status}`)
  const texto = await lerTexto(res)
  // O SOC devolve erro de parâmetro como texto puro e HTTP 200 — a validação
  // por status não pega, e sem esta checagem a mensagem de erro vira "0 exames".
  if (!texto.trim().startsWith('[') && !texto.trim().startsWith('{')) {
    throw new Error(`SOC exames detalhados recusou a consulta: ${texto.slice(0, 150)}`)
  }
  const parsed = JSON.parse(texto)
  return Array.isArray(parsed) ? parsed : []
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
  const res = await fetch(`${BASE_GET}?parametro=${encodeURIComponent(params)}`, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`SOC: HTTP ${res.status}`)
  return parseSocXmlRows(await lerTexto(res))
}

// Exames para período arbitrário (datas em DD/MM/YYYY) — usado para comparação mensal
export async function getExamesPeriodo(dataInicio: string, dataFim: string): Promise<unknown[]> {
  if (!MASK_ASO) return []
  return exportaDados(MASK_ASO, { dataInicio, dataFim })
}

// Licenças para período arbitrário (datas em DD/MM/YYYY)
export async function getLicencasPeriodo(dataInicio: string, dataFim: string): Promise<unknown[]> {
  if (!MASK_LICENCAS) return []
  return exportaDados(MASK_LICENCAS, { empresaTrabalho: EMPRESA, dataInicio, dataFim })
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
  const res = await fetch(`${BASE_GET}?parametro=${encodeURIComponent(params)}`, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`SOC: HTTP ${res.status}`)
  return parseSocXmlRows(await lerTexto(res))
}
