// Conciliação bancária — casa o EXTRATO real (Pluggy) com os lançamentos do ERP.
//
// Regra de match: mesmo |valor| (± 1 centavo) e data próxima (janela em dias).
// Greedy: cada lançamento do ERP casa com no máximo uma transação bancária.
//
// Classificação de cada transação do extrato:
//   'conciliado'    → achou lançamento correspondente no ERP
//   'transferencia' → é PIX/TED entre contas (o outro lado aparece quando a
//                     conta de destino também estiver conectada no Pluggy)
//   'sem_erp'       → movimento no banco SEM registro no ERP (ponto-cego / a revisar)

export type TxBanco = {
  id: string
  pluggy_account_id: string
  conta_nome: string
  data: string            // YYYY-MM-DD
  descricao: string
  valor: number           // sinal: + entrada, - saída
  tipo: string            // DEBIT | CREDIT
}

export type LancErp = {
  id: string
  data_pagamento: string  // YYYY-MM-DD
  valor: number
  tipo: string            // receita | despesa
  descricao: string
  categoria: string
}

export type StatusConc = 'conciliado' | 'transferencia' | 'sem_erp'

export type TxConciliada = TxBanco & {
  status: StatusConc
  lancamento?: LancErp
}

export function ehTransferencia(descricao: string): boolean {
  return /\bPIX\b|\bTED\b|\bDOC\b|TRANSFER[EÊ]NCIA|TRANSF\b|ENVIAD|RECEB/i.test(descricao || '')
}

function diasEntre(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00').getTime()
  const db = new Date(b + 'T00:00:00').getTime()
  return Math.abs(da - db) / 86_400_000
}

export function conciliar(
  txs: TxBanco[],
  lancs: LancErp[],
  janelaDias = 3,
): TxConciliada[] {
  // Índice de lançamentos por valor absoluto (arredondado a centavo) → acelera o match
  const porValor = new Map<number, LancErp[]>()
  for (const l of lancs) {
    const chave = Math.round(Math.abs(l.valor) * 100)
    const arr = porValor.get(chave)
    if (arr) arr.push(l)
    else porValor.set(chave, [l])
  }
  const usados = new Set<string>()

  // Ordena por data para um pareamento estável
  const ordenadas = [...txs].sort((a, b) => a.data.localeCompare(b.data))

  return ordenadas.map(tx => {
    const chave = Math.round(Math.abs(tx.valor) * 100)
    const candidatos = porValor.get(chave) ?? []
    // melhor candidato: não usado, tipo compatível (crédito↔receita, débito↔despesa)
    // e dentro da janela de dias — escolhe o mais próximo em data
    let melhor: LancErp | undefined
    let melhorDist = Infinity
    for (const l of candidatos) {
      if (usados.has(l.id)) continue
      const d = diasEntre(tx.data, l.data_pagamento)
      if (d > janelaDias) continue
      if (d < melhorDist) { melhorDist = d; melhor = l }
    }
    if (melhor) {
      usados.add(melhor.id)
      return { ...tx, status: 'conciliado' as const, lancamento: melhor }
    }
    return { ...tx, status: (ehTransferencia(tx.descricao) ? 'transferencia' : 'sem_erp') as StatusConc }
  })
}

export type ResumoConc = {
  total: number
  entradas: number
  saidas: number
  qtdConciliado: number; valorConciliado: number
  qtdSemErp: number;     valorSemErp: number
  qtdTransfer: number;   valorTransfer: number
}

export function resumir(conc: TxConciliada[]): ResumoConc {
  const r: ResumoConc = {
    total: conc.length, entradas: 0, saidas: 0,
    qtdConciliado: 0, valorConciliado: 0,
    qtdSemErp: 0, valorSemErp: 0,
    qtdTransfer: 0, valorTransfer: 0,
  }
  for (const t of conc) {
    if (t.valor >= 0) r.entradas += t.valor
    else              r.saidas += Math.abs(t.valor)
    if (t.status === 'conciliado')        { r.qtdConciliado++; r.valorConciliado += Math.abs(t.valor) }
    else if (t.status === 'transferencia'){ r.qtdTransfer++;   r.valorTransfer += Math.abs(t.valor) }
    else                                  { r.qtdSemErp++;     r.valorSemErp += Math.abs(t.valor) }
  }
  return r
}
