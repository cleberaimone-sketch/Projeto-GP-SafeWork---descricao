// Leitores de extrato bancário para conciliação.
//   - OFX  (Itaú, Cora, bancos em geral — padrão universal)
//   - XLS/XLSX (Conta Azul digital — exportação de planilha)
// Ambos normalizam para o mesmo shape (ExtratoTx) que alimenta extrato_bancario.

import * as XLSX from 'xlsx'

export type ExtratoTx = {
  data: string                     // YYYY-MM-DD
  descricao: string
  valor: number                    // sinal: + entrada, - saída
  tipo: 'CREDIT' | 'DEBIT'
  documento: string                // FITID (OFX) / nº doc (se houver)
}

export type ExtratoParse = {
  conta?: string                   // identificador da conta no arquivo (ACCTID)
  banco?: string                   // BANKID
  transacoes: ExtratoTx[]
  aviso?: string                   // mensagem se algo não pôde ser lido
}

// ─── Número em formato BR/US → number ────────────────────────────────────────
export function parseNumero(s: string): number {
  s = String(s ?? '').replace(/\s|R\$/g, '').trim()
  if (!s) return 0
  const temV = s.includes(','), temP = s.includes('.')
  if (temV && temP) {
    // separador decimal = o último que aparece
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (temV) {
    s = s.replace(',', '.')
  }
  const n = parseFloat(s)
  return isFinite(n) ? n : 0
}

// ─── OFX ──────────────────────────────────────────────────────────────────────
export function parseOFX(texto: string): ExtratoParse {
  const tag = (src: string, t: string) => {
    const m = src.match(new RegExp(`<${t}>\\s*([^<\\r\\n]+)`, 'i'))
    return m ? m[1].trim() : ''
  }
  const conta = tag(texto, 'ACCTID')
  const banco = tag(texto, 'BANKID')
  const transacoes: ExtratoTx[] = []
  const blocos = texto.split(/<STMTTRN>/i).slice(1)
  for (const raw of blocos) {
    const b = raw.split(/<\/STMTTRN>/i)[0]
    const dt = tag(b, 'DTPOSTED').replace(/[^0-9]/g, '')
    const data = dt.length >= 8 ? `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}` : ''
    const valor = parseNumero(tag(b, 'TRNAMT'))
    const documento = tag(b, 'FITID')
    const descricao = tag(b, 'MEMO') || tag(b, 'NAME') || ''
    if (!data && !valor) continue
    transacoes.push({ data, descricao, valor, tipo: valor < 0 ? 'DEBIT' : 'CREDIT', documento })
  }
  return { conta, banco, transacoes, aviso: transacoes.length ? undefined : 'Nenhuma transação (<STMTTRN>) encontrada no OFX.' }
}

// ─── XLS / XLSX ───────────────────────────────────────────────────────────────
const RE_DATA  = /\bdata\b|dt\.?\s*mov|competê|lançamento/i
const RE_DESC  = /hist[oó]rico|descri|lançamento|memo|detalh/i
const RE_VALOR = /valor|montante|quantia/i
const RE_CRED  = /cr[eé]dito|entrada/i
const RE_DEB   = /d[eé]bito|sa[ií]da/i

function celData(v: unknown): string {
  if (v instanceof Date) {
    const y = v.getFullYear(), m = String(v.getMonth() + 1).padStart(2, '0'), d = String(v.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const s = String(v ?? '').trim()
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{2,4})/)
  if (br) { const y = br[3].length === 2 ? '20' + br[3] : br[3]; return `${y}-${br[2]}-${br[1]}` }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  return ''
}

export function parseXLS(buf: ArrayBuffer): ExtratoParse {
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) return { transacoes: [], aviso: 'Planilha vazia.' }
  const linhas = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, blankrows: false })

  // Acha a linha de cabeçalho (a que tem uma coluna de data + valor/crédito/débito)
  let hIdx = -1, cols = { data: -1, desc: -1, valor: -1, credito: -1, debito: -1 }
  for (let i = 0; i < Math.min(linhas.length, 30); i++) {
    const row = (linhas[i] ?? []).map(c => String(c ?? ''))
    const c = { data: -1, desc: -1, valor: -1, credito: -1, debito: -1 }
    row.forEach((cell, j) => {
      if (c.data < 0 && RE_DATA.test(cell)) c.data = j
      if (c.desc < 0 && RE_DESC.test(cell)) c.desc = j
      if (c.credito < 0 && RE_CRED.test(cell)) c.credito = j
      if (c.debito < 0 && RE_DEB.test(cell)) c.debito = j
      if (c.valor < 0 && RE_VALOR.test(cell) && !RE_CRED.test(cell) && !RE_DEB.test(cell)) c.valor = j
    })
    if (c.data >= 0 && (c.valor >= 0 || c.credito >= 0 || c.debito >= 0)) { hIdx = i; cols = c; break }
  }
  if (hIdx < 0) {
    return { transacoes: [], aviso: 'Não reconheci as colunas do XLS (data/valor). Me envie uma amostra do arquivo para eu ajustar o leitor.' }
  }

  const transacoes: ExtratoTx[] = []
  for (let i = hIdx + 1; i < linhas.length; i++) {
    const row = linhas[i] ?? []
    const data = celData(row[cols.data])
    if (!data) continue
    const desc = String(row[cols.desc] ?? '').trim()
    let valor = 0
    if (cols.valor >= 0) valor = parseNumero(String(row[cols.valor] ?? ''))
    if (cols.credito >= 0) { const cr = parseNumero(String(row[cols.credito] ?? '')); if (cr) valor = Math.abs(cr) }
    if (cols.debito >= 0)  { const db = parseNumero(String(row[cols.debito] ?? '')); if (db) valor = -Math.abs(db) }
    if (!valor) continue
    transacoes.push({ data, descricao: desc, valor, tipo: valor < 0 ? 'DEBIT' : 'CREDIT', documento: '' })
  }
  return { transacoes, aviso: transacoes.length ? undefined : 'Cabeçalho reconhecido, mas nenhuma linha de movimento lida. Me envie uma amostra para ajustar.' }
}

// ─── Dispatcher por conteúdo/extensão ────────────────────────────────────────
export function parseExtrato(nome: string, buf: ArrayBuffer): { formato: 'ofx' | 'xls'; parse: ExtratoParse } {
  const ext = (nome.split('.').pop() ?? '').toLowerCase()
  const head = new TextDecoder('latin1').decode(buf.slice(0, 512)).toUpperCase()
  const ehOfx = ext === 'ofx' || head.includes('<OFX>') || head.includes('OFXHEADER')
  if (ehOfx) {
    return { formato: 'ofx', parse: parseOFX(new TextDecoder('latin1').decode(buf)) }
  }
  return { formato: 'xls', parse: parseXLS(buf) }
}
