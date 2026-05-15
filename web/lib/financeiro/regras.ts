// ============================================================
// Regras de negócio para limpar dados financeiros do Conta Azul
// ============================================================
// Aplicar em TODA query/cálculo financeiro (dashboard, DRE, fluxo de caixa, agente Plata).
// Documentação completa: memory/project_regras_financeiras.md

import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface LancamentoBase {
  tipo: string
  categoria?: string | null
  status?: string | null
  valor?: number | null
  data_vencimento?: string | null
  data_pagamento?: string | null
  descricao?: string | null
  fonte_id?: string | null
  // O Conta Azul guarda o nome da conta bancária no campo 'banco' do lançamento
  // (vem via metadados — não temos hoje, mas vamos enriquecer no sync futuro)
  banco?: string | null
}

// ─── Categorias / contas excluídas (cache em módulo) ──────────────────────────

let _categoriasExcluidasCache: Set<string> | null = null
let _cacheExpiraEm = 0
const CACHE_TTL_MS = 5 * 60_000 // 5 minutos

/**
 * Carrega do banco a lista de categorias excluídas (transferências internas).
 * Faz cache em memória para não bater no banco a cada cálculo.
 */
export async function carregarCategoriasExcluidas(sb: SupabaseClient): Promise<Set<string>> {
  if (_categoriasExcluidasCache && Date.now() < _cacheExpiraEm) {
    return _categoriasExcluidasCache
  }

  const { data } = await sb.from('categorias_excluidas').select('categoria')
  const set = new Set((data ?? []).map(r => normalizarTexto(r.categoria)))

  _categoriasExcluidasCache = set
  _cacheExpiraEm = Date.now() + CACHE_TTL_MS
  return set
}

function normalizarTexto(s: string): string {
  // NFD + remove combining marks (U+0300 a U+036F) = sem acentos
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase()
}

/**
 * True se a categoria do lançamento for uma transferência interna do grupo.
 * Tolera acento, caixa e espaços.
 */
export function isTransferenciaInterna(categoria: string | null | undefined, excluidas: Set<string>): boolean {
  if (!categoria) return false
  return excluidas.has(normalizarTexto(categoria))
}

// ─── Conta Modelo (conta fictícia para reparcelamentos) ──────────────────────
// Regra:
//  - Saldo da Conta Modelo: SEMPRE ignorar (não é caixa real)
//  - Lançamento que CAI na Conta Modelo (baixa do parcelamento original):
//      conta para DRE/despesa, NÃO conta para fluxo de caixa
//  - Lançamento "conta atrasada" (novo parcelamento com nova data):
//      conta para fluxo de caixa, NÃO conta para DRE (senão duplica)

const CONTA_MODELO_PATTERN = /^conta\s*modelo$/i

export function isContaModelo(banco: string | null | undefined): boolean {
  if (!banco) return false
  return CONTA_MODELO_PATTERN.test(banco.trim())
}

const CONTA_ATRASADA_PATTERNS = [
  /conta\s*atrasada/i,
  /atrasad[ao]/i, // "Conta Atrasada", "Atrasados"
]

export function isContaAtrasada(banco: string | null | undefined): boolean {
  if (!banco) return false
  return CONTA_ATRASADA_PATTERNS.some(p => p.test(banco))
}

// ─── Filtros principais ──────────────────────────────────────────────────────

/**
 * Filtra lançamentos para cálculo de DRE / Receita / Despesa operacional.
 * Exclui:
 *   - Transferências internas
 *   - Lançamentos da "conta atrasada" (são parcelamentos, despesa já contada no original)
 *   - Lançamentos cancelados
 */
export function filtrarParaDRE<T extends LancamentoBase>(
  lancamentos: T[],
  excluidas: Set<string>,
): T[] {
  return lancamentos.filter(l => {
    if (l.status === 'cancelado') return false
    if (isTransferenciaInterna(l.categoria, excluidas)) return false
    if (isContaAtrasada(l.banco)) return false
    return true
  })
}

/**
 * Filtra lançamentos para cálculo de Fluxo de Caixa.
 * Exclui:
 *   - Transferências internas
 *   - Lançamentos que caem na Conta Modelo (são baixas fictícias, sem dinheiro real)
 *   - Lançamentos cancelados
 * Inclui:
 *   - Lançamentos da conta atrasada (esses sim são saídas reais futuras)
 */
export function filtrarParaFluxoCaixa<T extends LancamentoBase>(
  lancamentos: T[],
  excluidas: Set<string>,
): T[] {
  return lancamentos.filter(l => {
    if (l.status === 'cancelado') return false
    if (isTransferenciaInterna(l.categoria, excluidas)) return false
    if (isContaModelo(l.banco)) return false
    return true
  })
}

/**
 * Invalida o cache (útil em testes ou após mudar config no Supabase Studio).
 */
export function invalidarCacheRegras() {
  _categoriasExcluidasCache = null
  _cacheExpiraEm = 0
}
