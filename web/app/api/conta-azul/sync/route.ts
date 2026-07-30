export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import {
  ContaAzulClient,
  setTokenRefreshCallback,
  type ContaAzulItemFinanceiro,
  type ContaAzulContaFinanceira,
} from '../../../../lib/conta-azul/client'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any, any, any>

const CLIENT_ID = process.env.CONTA_AZUL_CLIENT_ID!
const CLIENT_SECRET = process.env.CONTA_AZUL_CLIENT_SECRET!

// Empresas INATIVAS no Conta Azul (não pagam / sem conta própria hoje).
// O cron PULA estas para não puxarem conta alheia e re-duplicar — o token
// delas ainda aponta para outra conta. Os tokens ficam INTACTOS (o Cleber
// pediu para não mexer): quando forem reativadas, basta reautorizar com o
// login próprio e tirar o nome daqui. O sync manual (POST com lista de
// empresas) ignora este filtro. Ver memory/feedback_sync_conta_azul_duplica.md.
const EMPRESAS_INATIVAS = ['SafeR&S', 'SafeHelp', 'SafeSolucoes']

function autenticado(req: NextRequest): boolean {
  // Vercel Cron (GET) ou header legado (POST)
  return (
    req.headers.get('x-vercel-cron') === '1' ||
    req.headers.get('x-cron-secret') === process.env.CRON_SECRET ||
    req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
  )
}

// GET /api/conta-azul/sync — Vercel Cron
// Janela: 90 dias atrás → 90 dias À FRENTE. Precisa incluir vencimentos FUTUROS
// (aluguel, salários, honorários, contas a pagar/receber já lançadas para os
// próximos dias) — senão o mês corrente aparece "pela metade" (só até hoje) e
// o fluxo de caixa futuro fica vazio.
export async function GET(req: NextRequest) {
  if (!autenticado(req)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const hoje = new Date()
  const inicio = new Date(hoje); inicio.setDate(hoje.getDate() - 90)
  const fim    = new Date(hoje); fim.setDate(hoje.getDate() + 90)

  const dataInicio = inicio.toISOString().split('T')[0]
  const dataFim    = fim.toISOString().split('T')[0]

  return runSync(dataInicio, dataFim)
}

async function runSync(dataInicio: string, dataFim: string, skipDebounce = false, filtroEmpresas?: string[], force = false): Promise<NextResponse> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Guard de concorrência — estabilidade do token Conta Azul.
  // O Cognito ROTACIONA o refresh_token a cada uso: dois syncs sobrepostos
  // fazem refresh com o mesmo token, um invalida o outro e derruba TODAS as
  // empresas com invalid_grant até reautorizar na mão. Para evitar isso,
  // pulamos se JÁ HOUVE um sync (em andamento ou concluído) INICIADO nas
  // últimas 2h. Combinado ao cron 1x/dia, elimina a rotação concorrente.
  // Não se aplica a syncs manuais via POST (skipDebounce=true).
  if (!skipDebounce) {
    const duasHorasAtras = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    const { data: syncRecente } = await supabase
      .from('sync_log')
      .select('iniciado_em')
      .eq('fonte', 'conta_azul')
      .eq('tipo_sync', 'financeiro')
      .gte('iniciado_em', duasHorasAtras)
      .order('iniciado_em', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (syncRecente) {
      return NextResponse.json({ skipped: true, reason: 'sync já iniciado/executado nas últimas 2h — evita rotação concorrente do token', ultimo: syncRecente.iniciado_em })
    }
  }

  setTokenRefreshCallback(async (empresaNome, newRefreshToken) => {
    // .select() confirma a gravação: erro OU 0 linhas afetadas → throw,
    // que aciona o retry do client (token rotacionado não pode se perder)
    const { data: gravado, error } = await supabase
      .from('conta_azul_tokens')
      .update({ refresh_token: newRefreshToken, atualizado_em: new Date().toISOString() })
      .eq('empresa_nome', empresaNome)
      .select('empresa_nome')
    if (error) throw new Error(`persistência do token de ${empresaNome}: ${error.message}`)
    if (!gravado || gravado.length === 0) throw new Error(`persistência do token de ${empresaNome}: nenhuma linha atualizada`)
  })

  let query = supabase.from('conta_azul_tokens').select('empresa_nome, empresa_id')
  if (filtroEmpresas?.length) {
    query = query.in('empresa_nome', filtroEmpresas)
  }
  const { data: empresaList, error } = await query

  if (error || !empresaList?.length) {
    return NextResponse.json({ error: 'Nenhuma empresa autorizada', detalhe: error?.message })
  }

  // Cron (sem filtroEmpresas) pula as inativas para não re-duplicar conta alheia.
  // POST manual com lista explícita respeita a lista (permite sync pontual).
  const empresasParaSync = filtroEmpresas?.length
    ? empresaList
    : empresaList.filter(t => !EMPRESAS_INATIVAS.includes(t.empresa_nome))

  // Trava anti-queima de token: o Conta Azul ROTACIONA o refresh_token a cada
  // sync. Sincronizar a MESMA empresa 2x no mesmo dia pode invalidá-lo. Então
  // pulamos empresas que já tiveram sync com SUCESSO nas últimas 6h — nem o cron
  // nem um POST acidental queimam o token. POST com { force: true } ignora
  // (re-sync intencional logo após reautorização).
  const seisHorasAtras = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
  const empresaIds = empresasParaSync.map(t => t.empresa_id).filter(Boolean) as string[]
  const sincronizadasRecentes = new Set<string>()
  if (!force && empresaIds.length) {
    const { data: recentes } = await supabase
      .from('sync_log')
      .select('empresa_id')
      .eq('fonte', 'conta_azul')
      .eq('tipo_sync', 'financeiro')
      .eq('status', 'sucesso')
      .gte('iniciado_em', seisHorasAtras)
      .in('empresa_id', empresaIds)
    for (const r of recentes ?? []) if (r.empresa_id) sincronizadasRecentes.add(r.empresa_id)
  }

  const resumo = []
  const inicioRun = Date.now()
  for (const t of empresasParaSync) {
    // Time-budget: maxDuration é 300s. Com menos de 60s de folga, ADIA as
    // empresas restantes — se a Vercel matar a função entre o refresh do
    // Cognito e a gravação do token novo, a empresa queima (invalid_grant).
    if (Date.now() - inicioRun > 240_000) {
      resumo.push({ empresa: t.empresa_nome, status: 'adiado', registros: 0, detalhe: 'tempo do run esgotando — adiado para o próximo sync (proteção anti-queima do token)' })
      continue
    }
    if (t.empresa_id && sincronizadasRecentes.has(t.empresa_id)) {
      resumo.push({ empresa: t.empresa_nome, status: 'pulado', registros: 0, detalhe: 'sync com sucesso nas últimas 6h — trava anti-queima de token (use force para forçar)' })
      continue
    }
    // Re-lê o token fresco do banco antes de cada empresa — garante
    // que usamos o refresh_token mais recente mesmo se outro sync rotacionou.
    const { data: tokenRow } = await supabase
      .from('conta_azul_tokens')
      .select('refresh_token')
      .eq('empresa_nome', t.empresa_nome)
      .single()

    if (!tokenRow?.refresh_token) {
      resumo.push({ empresa: t.empresa_nome, status: 'erro', registros: 0, detalhe: 'token não encontrado' })
      continue
    }

    try {
      const result = await syncEmpresa(supabase, { ...t, refresh_token: tokenRow.refresh_token }, dataInicio, dataFim)
      resumo.push({ empresa: t.empresa_nome, ...result })
    } catch (err) {
      resumo.push({ empresa: t.empresa_nome, status: 'erro', registros: 0, detalhe: String(err) })
    }
    await new Promise(r => setTimeout(r, 5000)) // 5s entre empresas — evita 429
  }

  return NextResponse.json({ resumo, periodo: `${dataInicio} → ${dataFim}` })
}

// POST /api/conta-azul/sync — dispara com período customizado (sem debounce)
// Body: { dataInicio?, dataFim?, empresas?: string[] }
export async function POST(req: NextRequest) {
  if (!autenticado(req)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  const body = await req.json().catch(() => ({}))
  const hoje = new Date().toISOString().split('T')[0]
  return runSync(body.dataInicio ?? '2020-01-01', body.dataFim ?? hoje, true, body.empresas, body.force === true)
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

    const lancamentosBrutos = [
      ...receber.map(r => mapLancamento(r, 'receita', tokenRow.empresa_id)),
      ...pagar.map(p => mapLancamento(p, 'despesa', tokenRow.empresa_id)),
    ]

    // Dedup cross-empresa: um lançamento do Conta Azul (fonte_id) pertence a UMA
    // empresa. No Conta Azul do contador, holding e subsidiária às vezes têm o
    // MESMO lançamento (ex.: GP e Londrina compartilham PIX/IPTU/honorários) e o
    // mesmo fonte_id volta em duas contas. Sem isto, o cron reintroduz a duplicata
    // todo dia (reativando o que foi cancelado). Regra: se o fonte_id já existe
    // ATIVO em OUTRA empresa (a dona, que o tem no histórico), não gravamos aqui.
    const fonteIds = lancamentosBrutos.map(l => l.fonte_id).filter(Boolean) as string[]
    const jaEmOutra = new Set<string>()
    if (tokenRow.empresa_id) {
      for (let i = 0; i < fonteIds.length; i += 150) {
        const loteIds = fonteIds.slice(i, i + 150)
        const { data: existentes } = await supabase
          .from('lancamentos_financeiros')
          .select('fonte_id')
          .eq('fonte', 'conta_azul')
          .neq('status', 'cancelado')
          .neq('empresa_id', tokenRow.empresa_id)
          .in('fonte_id', loteIds)
        for (const r of existentes ?? []) jaEmOutra.add(r.fonte_id as string)
      }
    }
    const lancamentos = lancamentosBrutos.filter(l => !l.fonte_id || !jaEmOutra.has(l.fonte_id))

    let registrosProcessados = 0
    let registrosErro = 0
    const erros: string[] = []

    for (let i = 0; i < lancamentos.length; i += 500) {
      const lote = lancamentos.slice(i, i + 500)
      const { error } = await supabase
        .from('lancamentos_financeiros')
        .upsert(lote, { onConflict: 'empresa_id,fonte_id,fonte' })
      if (error) {
        registrosErro += lote.length
        erros.push(error.message)
      } else {
        registrosProcessados += lote.length
      }
    }

    // Busca saldos de cada conta bancária individualmente
    const saldos = await Promise.all(
      contas.map(async (c: ContaAzulContaFinanceira) => {
        try {
          const resp = await client.getSaldoConta(c.id) as Record<string, unknown>
          // A API pode retornar { saldo } ou { saldo_atual } ou { valor }
          const saldoVal = (resp.saldo ?? resp.saldo_atual ?? resp.valor ?? null) as number | null
          if (saldoVal === null) return null
          return {
            empresa_id: tokenRow.empresa_id,
            banco: c.nome,
            agencia: c.agencia ?? null,
            conta: c.numero ?? null,
            saldo: saldoVal,
            // Saldo é ATUAL (getSaldoConta) → carimba HOJE. Antes usava dataFim
            // (+90d, futuro) e a v_saldos_ativos descartava por data_referencia > hoje.
            data_referencia: new Date().toISOString().split('T')[0],
            fonte: 'conta_azul',
          }
        } catch {
          return null
        }
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

function mapLancamento(
  item: ContaAzulItemFinanceiro,
  tipo: 'receita' | 'despesa',
  empresaId: string | null
) {
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
    ACQUITTED: 'pago',
    PENDING: 'pendente',
    OVERDUE: 'vencido',
    CANCELLED: 'cancelado',
    PARTIALLY_PAID: 'parcial',
  }
  return map[s] ?? 'pendente'
}
