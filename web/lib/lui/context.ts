// ============================================================
// LUI — Coleta de contexto do Supabase
// Monta o JSON de negócio enviado ao LUI antes de cada resposta
// ============================================================

import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function hoje() {
  return new Date().toISOString().split('T')[0]
}

function diasAtras(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

export async function buildBusinessContext(): Promise<string> {
  const supabase = getSupabase()
  const context: Record<string, unknown> = {}

  // 1. Alertas em aberto (críticos primeiro)
  const { data: alertas } = await supabase
    .from('alertas')
    .select('modulo, tipo, titulo, prioridade, empresa_id, data_referencia')
    .eq('status', 'aberto')
    .order('prioridade', { ascending: false })
    .limit(20)

  context.alertas_abertos = alertas ?? []

  // 2. Financeiro — inadimplência (vencidos últimos 90 dias)
  const { data: inadimplencia } = await supabase
    .from('lancamentos_financeiros')
    .select('empresa_id, valor, data_vencimento')
    .eq('tipo', 'receita')
    .eq('status', 'vencido')
    .gte('data_vencimento', diasAtras(90))

  const totalInadimplencia = (inadimplencia ?? []).reduce((acc, l) => acc + Number(l.valor), 0)
  context.inadimplencia = {
    total_reais: totalInadimplencia,
    quantidade_titulos: (inadimplencia ?? []).length,
  }

  // 3. Financeiro — A/R vencendo nos próximos 7 dias
  const { data: vencendoBreve } = await supabase
    .from('lancamentos_financeiros')
    .select('empresa_id, valor, data_vencimento')
    .eq('tipo', 'receita')
    .eq('status', 'pendente')
    .gte('data_vencimento', hoje())
    .lte('data_vencimento', diasAtras(-7))

  context.receber_proximos_7d = {
    total_reais: (vencendoBreve ?? []).reduce((acc, l) => acc + Number(l.valor), 0),
    quantidade: (vencendoBreve ?? []).length,
  }

  // 4. ASOs vencendo nos próximos 30 dias
  const { data: asosVencendo } = await supabase
    .from('asos')
    .select('cliente_id, trabalhador_nome, data_validade, empresa_id')
    .in('status_alerta', ['vencendo_30d', 'vencendo_60d', 'vencido'])
    .order('data_validade')
    .limit(10)

  context.asos_alertas = {
    quantidade: (asosVencendo ?? []).length,
    proximos: asosVencendo ?? [],
  }

  // 5. Laudos em atraso
  const { data: laudosAtrasados } = await supabase
    .from('laudos_tecnicos')
    .select('tipo_laudo, cliente_id, data_vencimento, empresa_id')
    .in('status', ['vencido', 'pendente'])
    .lt('data_vencimento', hoje())
    .limit(10)

  context.laudos_atrasados = {
    quantidade: (laudosAtrasados ?? []).length,
    detalhes: laudosAtrasados ?? [],
  }

  // 6. Consultas de medicina — ontem vs mesmo dia semana passada
  const ontem = diasAtras(1)
  const mesmodiaSemanaPassada = diasAtras(8)

  const { count: consultasOntem } = await supabase
    .from('consultas')
    .select('*', { count: 'exact', head: true })
    .eq('data_consulta', ontem)
    .eq('status', 'realizada')

  const { count: consultasSemanaAnterior } = await supabase
    .from('consultas')
    .select('*', { count: 'exact', head: true })
    .eq('data_consulta', mesmodiaSemanaPassada)
    .eq('status', 'realizada')

  context.consultas_medicina = {
    ontem: consultasOntem ?? 0,
    mesmo_dia_semana_passada: consultasSemanaAnterior ?? 0,
    variacao_pct: consultasSemanaAnterior
      ? Math.round(((consultasOntem ?? 0) - consultasSemanaAnterior) / consultasSemanaAnterior * 100)
      : null,
  }

  // 7. Pipeline comercial
  const { data: pipeline } = await supabase
    .from('oportunidades_crm')
    .select('etapa_funil, valor_estimado')
    .neq('etapa_funil', 'fechado_perdido')

  const totalPipeline = (pipeline ?? []).reduce((acc, o) => acc + Number(o.valor_estimado ?? 0), 0)
  const porEtapa = (pipeline ?? []).reduce((acc: Record<string, number>, o) => {
    acc[o.etapa_funil] = (acc[o.etapa_funil] ?? 0) + 1
    return acc
  }, {})

  context.pipeline_comercial = {
    total_reais: totalPipeline,
    oportunidades_ativas: (pipeline ?? []).length,
    por_etapa: porEtapa,
  }

  // 8. Status das integrações (últimas 24h)
  const { data: syncStatus } = await supabase
    .from('sync_log')
    .select('fonte, status, finalizado_em, registros_processados')
    .gte('iniciado_em', diasAtras(1))
    .order('iniciado_em', { ascending: false })

  context.integrações = syncStatus ?? []

  return JSON.stringify(context, null, 2)
}

// Contexto simplificado para perguntas interativas (não briefing)
export async function buildQueryContext(pergunta: string): Promise<string> {
  const supabase = getSupabase()
  const context: Record<string, unknown> = { pergunta }

  const p = pergunta.toLowerCase()

  if (p.includes('financ') || p.includes('caixa') || p.includes('receita') || p.includes('inadimpl')) {
    const { data } = await supabase
      .from('lancamentos_financeiros')
      .select('tipo, status, valor, data_vencimento, empresa_id')
      .gte('data_vencimento', diasAtras(30))
      .limit(200)
    context.financeiro_30d = data ?? []
  }

  if (p.includes('aso') || p.includes('consul') || p.includes('medic') || p.includes('exam')) {
    const { data } = await supabase
      .from('asos')
      .select('status_alerta, data_validade, cliente_id, empresa_id')
      .in('status_alerta', ['vencendo_30d', 'vencido'])
      .limit(50)
    context.asos_criticos = data ?? []
  }

  if (p.includes('laudo') || p.includes('pgr') || p.includes('engenh')) {
    const { data } = await supabase
      .from('laudos_tecnicos')
      .select('tipo_laudo, status, data_vencimento, empresa_id')
      .in('status', ['vencido', 'pendente'])
      .limit(50)
    context.laudos_pendentes = data ?? []
  }

  if (p.includes('contrat') || p.includes('clien') || p.includes('comerci') || p.includes('vend')) {
    const { data } = await supabase
      .from('contratos')
      .select('titulo, status, valor_mensal, data_fim, empresa_id')
      .eq('status', 'ativo')
      .limit(50)
    context.contratos_ativos = data ?? []
  }

  return JSON.stringify(context, null, 2)
}
