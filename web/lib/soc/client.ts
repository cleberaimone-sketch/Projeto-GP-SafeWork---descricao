// Cliente SOC — Web Service SOAP/XML
// Documentação: https://sistema.soc.com.br
// Configurar no painel SOC: Menu > Cadastros > Empresa Principal > Configuração de Integração

const BASE = process.env.SOC_BASE_URL ?? 'https://sistema.soc.com.br/WebSoc'
const EMPRESA = process.env.SOC_EMPRESA ?? ''
const CODIGO = process.env.SOC_CODIGO ?? ''
const CHAVE = process.env.SOC_CHAVE ?? ''

function buildSoapEnvelope(service: string, method: string, params: Record<string, string>): string {
  const json = JSON.stringify({ empresa: EMPRESA, codigo: CODIGO, chave: CHAVE, ...params })
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Header/>
  <soapenv:Body>
    <${method} xmlns="${service}">
      <arg0><![CDATA[${json}]]></arg0>
    </${method}>
  </soapenv:Body>
</soapenv:Envelope>`
}

async function callSoap(endpoint: string, method: string, params: Record<string, string> = {}): Promise<string> {
  const ns = `http://ws.${endpoint.toLowerCase()}.soc.com.br`
  const body = buildSoapEnvelope(ns, method, params)

  const res = await fetch(`${BASE}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '""' },
    body,
    signal: AbortSignal.timeout(15000),
  })

  if (!res.ok) throw new Error(`SOC ${endpoint} ${res.status}: ${await res.text()}`)
  return res.text()
}

// Extrai o conteúdo de uma tag XML
function extractTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))
  return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : ''
}

// Funcionários de uma empresa
export async function getFuncionarios(empresaTrabalho = EMPRESA): Promise<unknown[]> {
  try {
    const xml = await callSoap('WsFuncionario', 'retornaFuncionario', { empresaTrabalho, funcionario: '' })
    const content = extractTag(xml, 'return')
    const parsed = JSON.parse(content)
    return Array.isArray(parsed) ? parsed : parsed?.funcionarios ?? []
  } catch { return [] }
}

// Agendamentos de exames
export async function getAgendamentos(empresaTrabalho = EMPRESA): Promise<unknown[]> {
  try {
    const xml = await callSoap('WsAgendamento', 'retornaAgendamento', {
      empresaTrabalho,
      dataInicial: new Date().toISOString().split('T')[0],
      dataFinal: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    })
    const content = extractTag(xml, 'return')
    const parsed = JSON.parse(content)
    return Array.isArray(parsed) ? parsed : parsed?.agendamentos ?? []
  } catch { return [] }
}

// Histórico de exames/ASOs
export async function getHistoricoFuncionarios(empresaTrabalho = EMPRESA): Promise<unknown[]> {
  try {
    const xml = await callSoap('WsHistoricoFuncionario', 'retornaHistoricoFuncionario', {
      empresaTrabalho,
      funcionario: '',
    })
    const content = extractTag(xml, 'return')
    const parsed = JSON.parse(content)
    return Array.isArray(parsed) ? parsed : parsed?.historicos ?? []
  } catch { return [] }
}

// Entregas de EPI
export async function getEntregasEpi(empresaTrabalho = EMPRESA): Promise<unknown[]> {
  try {
    const xml = await callSoap('WsEntregaEpi', 'retornaEntregaEpi', { empresaTrabalho, funcionario: '' })
    const content = extractTag(xml, 'return')
    const parsed = JSON.parse(content)
    return Array.isArray(parsed) ? parsed : parsed?.entregas ?? []
  } catch { return [] }
}

// Riscos por GHE (Grupos Homogêneos de Exposição)
export async function getRiscos(empresaTrabalho = EMPRESA): Promise<unknown[]> {
  try {
    const xml = await callSoap('WsRisco', 'retornaRisco', { empresaTrabalho })
    const content = extractTag(xml, 'return')
    const parsed = JSON.parse(content)
    return Array.isArray(parsed) ? parsed : parsed?.riscos ?? []
  } catch { return [] }
}

// Licenças médicas / atestados
export async function getLicencasMedicas(empresaTrabalho = EMPRESA): Promise<unknown[]> {
  try {
    const dataFim = new Date().toISOString().split('T')[0]
    const dataIni = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0]
    const xml = await callSoap('WsLicencaMedica', 'retornaLicencaMedica', {
      empresaTrabalho,
      dataInicial: dataIni,
      dataFinal: dataFim,
    })
    const content = extractTag(xml, 'return')
    const parsed = JSON.parse(content)
    return Array.isArray(parsed) ? parsed : parsed?.licencas ?? []
  } catch { return [] }
}

export function socConfigurado(): boolean {
  return Boolean(CHAVE && CHAVE !== 'PREENCHER_NO_PAINEL_SOC')
}
