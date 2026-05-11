// ============================================================
// Conta Azul → Supabase: Sync Financeiro
// Puxar A/R, A/P e saldos de cada empresa → lancamentos_financeiros
// ============================================================

import { createClient } from '@supabase/supabase-js'
import { ContaAzulClient } from '../client'
import type { ContaAzulCredentials, SyncResult } from '../types'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!   // precisa de service_role para INSERT
)

function toISODate(d: Date) {
  return d.toISOString().split('T')[0]
}

async function syncEmpresa(
  creds: ContaAzulCredentials,
  dataInicio: string,
  dataFim: string
): Promise<SyncResult> {
  const result: SyncResult = {
    empresa: creds.empresaNome,
    sucesso: false,
    registrosProcessados: 0,
    registrosErro: 0,
    erros: [],
    iniciouEm: new Date(),
  }

  const client = new ContaAzulClient(creds)

  try {
    // 1. Contas a Receber
    const receber = await client.getContasReceber(dataInicio, dataFim)
    const lancamentosReceber = receber.map(r => ({
      empresa_id: creds.empresaSupabaseId,
      tipo: 'receita',
      categoria: r.category?.name ?? null,
      descricao: r.description,
      valor: r.value,
      data_vencimento: r.dueDate,
      data_pagamento: r.paymentDate ?? null,
      status: mapStatus(r.status),
      numero_documento: null,
      fonte: 'conta_azul',
      fonte_id: r.id,
    }))

    // 2. Contas a Pagar
    const pagar = await client.getContasPagar(dataInicio, dataFim)
    const lancamentosPagar = pagar.map(p => ({
      empresa_id: creds.empresaSupabaseId,
      tipo: 'despesa',
      categoria: p.category?.name ?? null,
      descricao: p.description,
      valor: p.value,
      data_vencimento: p.dueDate,
      data_pagamento: p.paymentDate ?? null,
      status: mapStatus(p.status),
      numero_documento: null,
      fonte: 'conta_azul',
      fonte_id: p.id,
    }))

    const todos = [...lancamentosReceber, ...lancamentosPagar]

    // Upsert em lotes de 500 (evita timeout)
    for (let i = 0; i < todos.length; i += 500) {
      const lote = todos.slice(i, i + 500)
      const { error } = await supabase
        .from('lancamentos_financeiros')
        .upsert(lote, { onConflict: 'fonte_id,fonte' })

      if (error) {
        result.registrosErro += lote.length
        result.erros.push(error.message)
      } else {
        result.registrosProcessados += lote.length
      }
    }

    // 3. Saldos bancários
    const contas = await client.getContasBancarias()
    const hoje = toISODate(new Date())
    const saldos = contas.map(c => ({
      empresa_id: creds.empresaSupabaseId,
      banco: c.bank ?? c.name,
      agencia: c.agency ?? null,
      conta: c.number ?? null,
      saldo: c.balance,
      data_referencia: hoje,
      fonte: 'conta_azul',
    }))

    if (saldos.length > 0) {
      const { error } = await supabase
        .from('saldos_bancarios')
        .upsert(saldos, { onConflict: 'empresa_id,banco,conta,data_referencia' })

      if (error) result.erros.push(`Saldos: ${error.message}`)
    }

    // 4. Registrar no sync_log
    await supabase.from('sync_log').insert({
      fonte: 'conta_azul',
      empresa_id: creds.empresaSupabaseId,
      tipo_sync: 'financeiro',
      status: result.erros.length === 0 ? 'sucesso' : 'parcial',
      registros_processados: result.registrosProcessados,
      registros_erro: result.registrosErro,
      mensagem_erro: result.erros.length > 0 ? result.erros.join(' | ') : null,
      iniciado_em: result.iniciouEm.toISOString(),
      finalizado_em: new Date().toISOString(),
    })

    result.sucesso = result.registrosErro === 0
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    result.erros.push(msg)
    await supabase.from('sync_log').insert({
      fonte: 'conta_azul',
      empresa_id: creds.empresaSupabaseId,
      tipo_sync: 'financeiro',
      status: 'erro',
      registros_processados: 0,
      registros_erro: 1,
      mensagem_erro: msg,
      iniciado_em: result.iniciouEm.toISOString(),
      finalizado_em: new Date().toISOString(),
    })
  }

  result.finalizouEm = new Date()
  return result
}

function mapStatus(s: string): string {
  const map: Record<string, string> = {
    PENDING: 'pendente',
    PAID: 'pago',
    LATE: 'vencido',
    CANCELLED: 'cancelado',
  }
  return map[s] ?? 'pendente'
}

// ---- Entrada principal: roda para todas as empresas ----
export async function syncContaAzulFinanceiro(
  credenciais: ContaAzulCredentials[],
  diasRetroativos = 90
): Promise<SyncResult[]> {
  const fim = new Date()
  const inicio = new Date()
  inicio.setDate(inicio.getDate() - diasRetroativos)

  const dataInicio = toISODate(inicio)
  const dataFim = toISODate(fim)

  console.log(`[ContaAzul] Sync ${dataInicio} → ${dataFim} | ${credenciais.length} empresas`)

  const resultados = await Promise.allSettled(
    credenciais.map(c => syncEmpresa(c, dataInicio, dataFim))
  )

  return resultados.map((r, i) => {
    if (r.status === 'fulfilled') return r.value
    return {
      empresa: credenciais[i].empresaNome,
      sucesso: false,
      registrosProcessados: 0,
      registrosErro: 1,
      erros: [r.reason?.message ?? 'Erro desconhecido'],
      iniciouEm: new Date(),
      finalizouEm: new Date(),
    }
  })
}
