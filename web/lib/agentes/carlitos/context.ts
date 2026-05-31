// ============================================================
// Carlitos — Contexto de Processos/Tech para o agente
// Fontes: dados estáticos (processos/dados.ts) + Supabase (IA health, syncs)
// ============================================================

import {
  PRODUTOS_SAFEHELP,
  PROCESSOS_OPERACIONAIS,
  EQUIPE_TECH_CARLITOS,
  INDICADORES_TECH,
} from '@/lib/processos/dados'
import { createClient } from '@supabase/supabase-js'

function getDB() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function buildCarlitosContext(_pergunta?: string): Promise<string> {
  const db = getDB()
  const sete_dias_atras = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
  const trinta_dias_atras = new Date(Date.now() - 30 * 86400000).toISOString()

  // Fetch all Supabase data in parallel
  const [briefingsRes, ninaRes, conversasRes, syncRes] = await Promise.allSettled([
    db.from('briefings_diarios')
      .select('data_briefing, enviado, created_at')
      .gte('data_briefing', sete_dias_atras)
      .order('data_briefing', { ascending: false }),

    db.from('relatorios_estrategicos')
      .select('data_relatorio, status, metricas, enviado_whatsapp')
      .eq('status', 'ok')
      .order('data_relatorio', { ascending: false })
      .limit(1)
      .maybeSingle(),

    db.from('conversas_ia')
      .select('agente')
      .gte('created_at', trinta_dias_atras),

    db.from('sync_log')
      .select('fonte, status, finalizado_em, registros_processados')
      .in('fonte', ['conta_azul', 'soc'])
      .order('finalizado_em', { ascending: false })
      .limit(20),
  ])

  // Briefing health — últimos 7 dias
  const briefings = briefingsRes.status === 'fulfilled' ? (briefingsRes.value.data ?? []) : []
  const briefingsEnviados = briefings.filter(b => b.enviado).length
  const briefingHealth = briefings.length > 0
    ? `${briefingsEnviados}/${briefings.length} enviados nos últimos 7 dias`
    : 'sem registros nos últimos 7 dias'

  // Nina — último relatório
  const nina = ninaRes.status === 'fulfilled' ? ninaRes.value.data : null
  const ninaStatus = nina
    ? `último relatório: ${nina.data_relatorio} · WhatsApp enviado: ${nina.enviado_whatsapp ? 'sim' : 'não'}`
    : 'nenhum relatório gerado ainda'
  const ninaMetricas = nina?.metricas
    ? `${(nina.metricas as Record<string, unknown>).total_empresas ?? '?'} empresas · ${(nina.metricas as Record<string, unknown>).total_oportunidades ?? '?'} oportunidades`
    : ''

  // Conversas por agente — últimos 30 dias
  const conversas = conversasRes.status === 'fulfilled' ? (conversasRes.value.data ?? []) : []
  const contagemPorAgente: Record<string, number> = {}
  for (const c of conversas) {
    contagemPorAgente[c.agente] = (contagemPorAgente[c.agente] ?? 0) + 1
  }
  const totalConversas = conversas.length
  const conversasResumo = Object.entries(contagemPorAgente)
    .sort((a, b) => b[1] - a[1])
    .map(([agente, n]) => `${agente}: ${n}`)
    .join(', ')

  // Sync log — último sync por fonte
  const syncs = syncRes.status === 'fulfilled' ? (syncRes.value.data ?? []) : []
  const ultimoSync: Record<string, { status: string; finalizado_em: string | null; registros: number }> = {}
  for (const s of syncs) {
    if (!ultimoSync[s.fonte]) {
      ultimoSync[s.fonte] = { status: s.status, finalizado_em: s.finalizado_em, registros: s.registros_processados }
    }
  }
  const syncResumo = Object.entries(ultimoSync)
    .map(([fonte, s]) => `${fonte}: ${s.status} (${s.finalizado_em ? new Date(s.finalizado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'sem data'}, ${s.registros} registros)`)
    .join('\n    ')

  const produtosAtivos = PRODUTOS_SAFEHELP.filter(p => p.status !== 'pausado')
  const processosCriticos = PROCESSOS_OPERACIONAIS.filter(p => p.status !== 'em_dia')

  return [
    `=== Dados de Processos & Tech — Grupo GP SafeWork ===`,
    `Data: ${new Date().toLocaleDateString('pt-BR')}`,
    ``,
    `## SAÚDE DO SISTEMA DE IA`,
    `Briefings diários: ${briefingHealth}`,
    `Nina (estratégia): ${ninaStatus}`,
    ninaMetricas ? `  → ${ninaMetricas}` : '',
    `Conversas com agentes (últimos 30d): ${totalConversas} total`,
    conversasResumo ? `  → Por agente: ${conversasResumo}` : '  → Sem conversas registradas',
    ``,
    `## INTEGRAÇÕES — ÚLTIMO SYNC`,
    syncResumo ? `    ${syncResumo}` : '    Sem registros de sync',
    ``,
    `## PRODUTOS SAFEHELP (vertical digital SST)`,
    ...produtosAtivos.map(p =>
      `  - ${p.nome} [${p.status.toUpperCase()}]: ${p.descricao}` +
      (p.notas ? `\n      → ${p.notas}` : ''),
    ),
    ``,
    `## PROCESSOS TRANSVERSAIS (com gargalo ou em curso)`,
    ...(processosCriticos.length === 0
      ? ['  ✅ Todos os processos monitorados estão em dia.']
      : processosCriticos.map(p =>
          `  - ${p.nome} [${p.status.toUpperCase()}] (${p.area})` +
          (p.notas ? `\n      → ${p.notas}` : ''),
        )
    ),
    ``,
    `## TODOS OS PROCESSOS MONITORADOS`,
    ...PROCESSOS_OPERACIONAIS.map(p =>
      `  - ${p.nome} (${p.area}): ${p.status}`,
    ),
    ``,
    `## TIME DE TECH SOB CARLITOS`,
    `Estagiários ativos: ${INDICADORES_TECH.estagiariosAtivos}`,
    ...EQUIPE_TECH_CARLITOS.map(e => `  - ${e}`),
    ``,
    `## INDICADORES DE TECH (sem ClickUp integrado)`,
    `Velocidade semanal: ${INDICADORES_TECH.velocidadeTimeSemanal}`,
    `Bugs abertos: ${INDICADORES_TECH.bugsAbertos}`,
    `Releases últimos 30d: ${INDICADORES_TECH.releasesUltimo30d}`,
    `Observação: ${INDICADORES_TECH.observacao}`,
    ``,
    `## STACK E INTEGRAÇÕES DO SISTEMA`,
    `  - SOC (ExportaDados) — medicina, ASOs, agendamentos`,
    `  - Conta Azul (OAuth) — financeiro, custo de pessoal`,
    `  - D4sign — assinatura digital de contratos`,
    `  - RD Station — comercial / pipeline`,
    `  - Z-API / Evolution — WhatsApp`,
    `  - Pluggy — saldos bancários (em integração)`,
    `  - ClickUp — PENDENTE (gargalo do Carlitos)`,
    `  - Unisyst — migração planejada (vai substituir Conta Azul)`,
  ].filter(line => line !== '').join('\n')
}
