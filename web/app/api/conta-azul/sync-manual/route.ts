// POST /api/conta-azul/sync-manual
// Dispara sync via dashboard autenticado (sem cron-secret)
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAuth } from '@/lib/supabase/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { ContaAzulClient, setTokenRefreshCallback, type ContaAzulItemFinanceiro, type ContaAzulContaFinanceira } from '@/lib/conta-azul/client'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any, any, any>

const CLIENT_ID = process.env.CONTA_AZUL_CLIENT_ID!
const CLIENT_SECRET = process.env.CONTA_AZUL_CLIENT_SECRET!

export async function POST(req: NextRequest) {
  const authClient = await createAuth()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  setTokenRefreshCallback(async (empresaNome, newRefreshToken) => {
    await supabase
      .from('conta_azul_tokens')
      .update({ refresh_token: newRefreshToken, atualizado_em: new Date().toISOString() })
      .eq('empresa_nome', empresaNome)
  })

  const body = await req.json().catch(() => ({}))
  const dataInicio = body.dataInicio ?? '2020-01-01'
  const dataFim    = body.dataFim    ?? new Date().toISOString().split('T')[0]
  // Se "empresa_nome" vier no body, sincroniza só ela
  const empresaNome: string | undefined = body.empresa_nome

  let q = supabase.from('conta_azul_tokens').select('empresa_nome, empresa_id, refresh_token')
  if (empresaNome) q = q.eq('empresa_nome', empresaNome)
  const { data: tokens, error } = await q

  if (error || !tokens?.length) {
    return NextResponse.json({
      error: empresaNome ? `Empresa "${empresaNome}" não encontrada` : 'Nenhuma empresa autorizada',
      detalhe: error?.message,
    }, { status: 404 })
  }

  const resumo = []
  for (const t of tokens) {
    try {
      const result = await syncEmpresa(supabase, t, dataInicio, dataFim)
      resumo.push({ empresa: t.empresa_nome, ...result })
    } catch (err) {
      resumo.push({ empresa: t.empresa_nome, status: 'erro', registros: 0, detalhe: String(err) })
    }
    await new Promise(r => setTimeout(r, 2000))
  }

  return NextResponse.json({ resumo, periodo: `${dataInicio} → ${dataFim}` })
}

async function syncEmpresa(
  supabase: AnySupabase,
  tokenRow: { empresa_nome: string; empresa_id: string | null; refresh_token: string },
  dataInicio: string,
  dataFim: string
): Promise<{ status: string; registros: number }> {
  const iniciouEm = new Date().toISOString()
  const client = new ContaAzulClient({
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    refreshToken: tokenRow.refresh_token,
    empresaSupabaseId: tokenRow.empresa_id ?? '',
    empresaNome: tokenRow.empresa_nome,
  })

  try {
    const [receber, pagar, contas] = await Promise.all([
      client.getContasReceber(dataInicio, dataFim),
      client.getContasPagar(dataInicio, dataFim),
      client.getContasBancarias(),
    ])

    const lancamentos = [
      ...receber.map(r => mapLancamento(r, 'receita', tokenRow.empresa_id)),
      ...pagar.map(p => mapLancamento(p, 'despesa', tokenRow.empresa_id)),
    ]

    let registrosProcessados = 0
    let registrosErro = 0
    const erros: string[] = []

    for (let i = 0; i < lancamentos.length; i += 500) {
      const lote = lancamentos.slice(i, i + 500)
      const { error } = await supabase
        .from('lancamentos_financeiros')
        .upsert(lote, { onConflict: 'fonte_id,fonte' })
      if (error) {
        registrosErro += lote.length
        erros.push(error.message)
      } else {
        registrosProcessados += lote.length
      }
    }

    const saldos = await Promise.all(
      contas.map(async (c: ContaAzulContaFinanceira) => {
        try {
          const resp = await client.getSaldoConta(c.id) as Record<string, unknown>
          const saldoVal = (resp.saldo ?? resp.saldo_atual ?? resp.valor ?? null) as number | null
          if (saldoVal === null) return null
          return {
            empresa_id: tokenRow.empresa_id,
            banco: c.nome,
            agencia: c.agencia ?? null,
            conta: c.numero ?? null,
            saldo: saldoVal,
            data_referencia: dataFim,
            fonte: 'conta_azul',
          }
        } catch { return null }
      })
    )

    const saldosValidos = saldos.filter((s): s is NonNullable<typeof s> => s !== null)
    if (saldosValidos.length > 0) {
      const { error } = await supabase
        .from('saldos_bancarios')
        .upsert(saldosValidos, { onConflict: 'empresa_id,banco,conta,data_referencia' })
      if (error) erros.push(`Saldos: ${error.message}`)
    }

    const status = erros.length === 0 ? 'sucesso' : 'parcial'
    await supabase.from('sync_log').insert({
      fonte: 'conta_azul',
      empresa_id: tokenRow.empresa_id,
      tipo_sync: 'financeiro',
      status,
      registros_processados: registrosProcessados,
      registros_erro: registrosErro,
      mensagem_erro: erros.length ? erros.join(' | ') : null,
      iniciado_em: iniciouEm,
      finalizado_em: new Date().toISOString(),
    })
    return { status, registros: registrosProcessados }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await supabase.from('sync_log').insert({
      fonte: 'conta_azul',
      empresa_id: tokenRow.empresa_id,
      tipo_sync: 'financeiro',
      status: 'erro',
      registros_processados: 0,
      registros_erro: 1,
      mensagem_erro: msg,
      iniciado_em: iniciouEm,
      finalizado_em: new Date().toISOString(),
    })
    throw err
  }
}

function mapLancamento(item: ContaAzulItemFinanceiro, tipo: 'receita' | 'despesa', empresaId: string | null) {
  return {
    empresa_id: empresaId,
    tipo,
    categoria: item.categorias?.[0]?.nome ?? null,
    descricao: item.descricao,
    valor: item.total,
    data_vencimento: item.data_vencimento,
    data_pagamento: item.status === 'ACQUITTED' ? item.data_competencia ?? null : null,
    status: mapStatus(item.status),
    numero_documento: null,
    fonte: 'conta_azul',
    fonte_id: item.id,
  }
}

function mapStatus(s: string): string {
  const map: Record<string, string> = {
    ACQUITTED: 'pago', PENDING: 'pendente', OVERDUE: 'vencido',
    CANCELLED: 'cancelado', PARTIALLY_PAID: 'parcial',
  }
  return map[s] ?? 'pendente'
}
