// Leitor do DRE gerencial da contabilidade (XLS "DRE - Resumido AAAA").
// Formato: aba "DRE" com um bloco por empresa; cada bloco começa numa linha
// cujo col0 = nome da empresa e col1 = "Jan/AA". Colunas Jan..Dec + "Valor"
// (total anual, col 13) + "Média". Números em formato US (1,234,567.89).

import * as XLSX from 'xlsx'

export type DreEmpresa = {
  empresa_nome: string
  receita: number      // 01T Receita Bruta de Vendas
  deducoes: number     // 02 Deduções
  custo: number        // 03 Custo dos Serviços
  despAdm: number      // 04.2 Despesas Administrativas
  despFinanc: number   // 05 Despesas Financeiras
  lucro: number        // 06T Lucro Líquido
  caixa: number        // CAIXA
}

export type DreParse = { ano: number | null; empresas: DreEmpresa[]; aviso?: string }

function numUS(s: unknown): number {
  const n = parseFloat(String(s ?? '').replace(/[R$\s,]/g, ''))
  return isFinite(n) ? n : 0
}

export function parseDreContabilidade(buf: ArrayBuffer): DreParse {
  const wb = XLSX.read(buf, { type: 'array' })
  const nomeAba = wb.SheetNames.find(n => n.trim().toUpperCase() === 'DRE') ?? wb.SheetNames[0]
  const ws = wb.Sheets[nomeAba]
  if (!ws) return { ano: null, empresas: [], aviso: 'Planilha sem aba DRE.' }
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, blankrows: false })

  const COL_VALOR = 13
  let ano: number | null = null
  const empresas: DreEmpresa[] = []
  let atual: DreEmpresa | null = null

  for (const r of rows) {
    const c0 = String(r[0] ?? '').trim()
    const c1 = String(r[1] ?? '').trim()

    // Início de bloco: col1 é um mês tipo "Jan/25"
    if (/^[A-Za-zç]{3}\/\d{2}$/.test(c1)) {
      if (!ano) { const m = c1.match(/\/(\d{2})$/); if (m) ano = 2000 + parseInt(m[1]) }
      if (atual) empresas.push(atual)
      atual = /TOTAL/i.test(c0)
        ? null
        : { empresa_nome: c0, receita: 0, deducoes: 0, custo: 0, despAdm: 0, despFinanc: 0, lucro: 0, caixa: 0 }
      continue
    }
    if (!atual) continue

    const v = numUS(r[COL_VALOR])
    if      (/^01T/.test(c0))    atual.receita    = v
    else if (/^02\b/.test(c0))   atual.deducoes   = v
    else if (/^03\b/.test(c0))   atual.custo      = v
    else if (/^04\.2/.test(c0))  atual.despAdm    = v
    else if (/^05\b/.test(c0))   atual.despFinanc = v
    else if (/^06T/.test(c0))    atual.lucro      = v
    else if (/^CAIXA/i.test(c0)) atual.caixa      = v
  }
  if (atual) empresas.push(atual)

  const limpo = empresas.filter(e => e.empresa_nome && !/TOTAL/i.test(e.empresa_nome))
  return { ano, empresas: limpo, aviso: limpo.length ? undefined : 'Não reconheci os blocos de empresa no DRE.' }
}
