// ============================================================
// Conta Azul API — Tipos
// Docs: https://developers.contaazul.com
// ============================================================

export interface ContaAzulCredentials {
  clientId: string
  clientSecret: string
  refreshToken: string      // por empresa, salvo na tabela conta_azul_tokens
  empresaSupabaseId: string // UUID da empresa no nosso Supabase
  empresaNome: string
}

// ---- Conta Azul: Lançamentos ----
export interface ContaAzulLancamento {
  id: string
  type: 'DEBIT' | 'CREDIT'
  description: string
  value: number
  dueDate: string          // ISO date
  paymentDate?: string
  status: 'PENDING' | 'PAID' | 'LATE' | 'CANCELLED'
  category?: {
    id: string
    name: string
  }
  contact?: {
    id: string
    name: string
    document?: string
  }
  bankAccount?: {
    id: string
    name: string
  }
  attachment?: string
  notes?: string
}

// ---- Conta Azul: Contas a Receber ----
export interface ContaAzulContaReceber {
  id: string
  description: string
  value: number
  dueDate: string
  paymentDate?: string
  status: 'PENDING' | 'PAID' | 'LATE' | 'CANCELLED'
  contact: {
    id: string
    name: string
    document?: string
  }
  category?: {
    id: string
    name: string
  }
  installment?: {
    number: number
    total: number
  }
}

// ---- Conta Azul: Contas a Pagar ----
export interface ContaAzulContaPagar {
  id: string
  description: string
  value: number
  dueDate: string
  paymentDate?: string
  status: 'PENDING' | 'PAID' | 'LATE' | 'CANCELLED'
  contact: {
    id: string
    name: string
    document?: string
  }
  category?: {
    id: string
    name: string
  }
}

// ---- Conta Azul: Conta Bancária ----
export interface ContaAzulContaBancaria {
  id: string
  name: string
  type: 'CHECKING' | 'SAVINGS' | 'INVESTMENT'
  balance: number
  bank?: string
  agency?: string
  number?: string
}

// ---- Resultado do sync ----
export interface SyncResult {
  empresa: string
  sucesso: boolean
  registrosProcessados: number
  registrosErro: number
  erros: string[]
  iniciouEm: Date
  finalizouEm?: Date
}
