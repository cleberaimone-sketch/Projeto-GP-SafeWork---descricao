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
  // Contagens e último sync vêm AGREGADOS do banco.
  //
  // O último sync saía de `sync_log ... limit(20)`, e o Carlitos pegava a
  // primeira linha de cada fonte. As 20 mais recentes são todas de conta_azul
  // — ele sincroniza por empresa, várias vezes ao dia —, então a fonte 'soc'
  // nunca chegava ao contexto, e nada dizia que ela havia sumido. A RPC usa
  // DISTINCT ON, uma linha por fonte, e traz também o frescor do espelho do
  // SOC, que não passa por sync_log nenhum.
  //
  // As conversas eram trazidas cruas e contadas em JS: 9 linhas hoje, mas o
  // teto de 1.000 do PostgREST chega sem avisar e "N total" é apresentado como
  // número absoluto.
  const [saudeRes, ninaRes] = await Promise.allSettled([
    db.rpc('fn_carlitos_saude_sistema', { p_dias: 30 }),

    db.from('relatorios_estrategicos')
      .select('data_relatorio, status, metricas, enviado_whatsapp')
      .eq('status', 'ok')
      .order('data_relatorio', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  // Falha de consulta não pode virar afirmação de ausência. O `?? []` fazia
  // erro de RLS ou timeout sair como "sem registros nos últimos 7 dias" — o
  // Carlitos afirmava que nada rodou, com a mesma convicção de quando rodou.
  type Saude = {
    ultimo_sync_por_fonte: { fonte: string; status: string; finalizado_em: string | null; registros: number | null; erro: string | null }[]
    espelho_soc: { tabela: string; carregado_em: string | null; linhas: number; dias_desde_a_carga: number | null }[]
    nota_espelho_soc: string
    conversas_total: number
    conversas_por_agente: { agente: string; qtd: number }[]
    briefings_7d: { total: number; enviados: number }
  }
  const saude = saudeRes.status === 'fulfilled' && !saudeRes.value.error
    ? (saudeRes.value.data as Saude)
    : null
  if (!saude) {
    console.error('[carlitos] saúde do sistema:',
      saudeRes.status === 'rejected' ? saudeRes.reason : saudeRes.value.error)
  }

  const briefingHealth = !saude
    ? 'NÃO SEI — a consulta falhou. Não conclua que nenhum briefing rodou.'
    : saude.briefings_7d.total > 0
      ? `${saude.briefings_7d.enviados}/${saude.briefings_7d.total} enviados nos últimos 7 dias`
      : 'nenhum briefing registrado nos últimos 7 dias'

  // Nina — último relatório
  const nina = ninaRes.status === 'fulfilled' ? ninaRes.value.data : null
  const ninaStatus = nina
    ? `último relatório: ${nina.data_relatorio} · WhatsApp enviado: ${nina.enviado_whatsapp ? 'sim' : 'não'}`
    : 'nenhum relatório gerado ainda'
  const ninaMetricas = nina?.metricas
    ? `${(nina.metricas as Record<string, unknown>).total_empresas ?? '?'} empresas · ${(nina.metricas as Record<string, unknown>).total_oportunidades ?? '?'} oportunidades`
    : ''

  // Conversas por agente — últimos 30 dias
  const totalConversas = saude ? saude.conversas_total : null
  const conversasResumo = (saude?.conversas_por_agente ?? [])
    .map(c => `${c.agente}: ${c.qtd}`)
    .join(', ')

  const quando = (iso: string | null) => iso
    ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : 'sem data'

  const syncResumo = (saude?.ultimo_sync_por_fonte ?? [])
    .map(s => `${s.fonte}: ${s.status} (${quando(s.finalizado_em)}, ${s.registros ?? 0} registros)` +
              (s.erro ? ` — erro: ${s.erro}` : ''))
    .join('\n    ')

  // Espelho do SOC: a carga roda por script e não passa por sync_log, então a
  // única forma de saber o frescor é olhar importado_em na própria tabela.
  const espelhoResumo = (saude?.espelho_soc ?? [])
    .map(t => `${t.tabela}: ${t.linhas.toLocaleString('pt-BR')} linhas, carga em ${quando(t.carregado_em)}` +
              (t.dias_desde_a_carga !== null && t.dias_desde_a_carga >= 2
                ? ` (${t.dias_desde_a_carga} dias atrás)` : ''))
    .join('\n    ')

  const produtosAtivos = PRODUTOS_SAFEHELP.filter(p => p.status !== 'pausado')
  const processosCriticos = PROCESSOS_OPERACIONAIS.filter(p => p.status !== 'em_dia')

  return [
    `=== Dados de Processos & Tech — Grupo GP SafeWork ===`,
    `Data: ${new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
    ``,
    `## SAÚDE DO SISTEMA DE IA`,
    `Briefings diários: ${briefingHealth}`,
    `Nina (estratégia): ${ninaStatus}`,
    ninaMetricas ? `  → ${ninaMetricas}` : '',
    `Conversas com agentes (últimos 30d): ${totalConversas ?? 'NÃO SEI — consulta falhou'}`,
    conversasResumo
      ? `  → Por agente: ${conversasResumo}`
      : (saude ? '  → Nenhuma conversa registrada no período' : '  → Não consultado'),
    ``,
    `## INTEGRAÇÕES — ÚLTIMO SYNC`,
    syncResumo ? `    ${syncResumo}` : (saude ? '    Nenhum sync registrado' : '    NÃO SEI — consulta falhou'),
    espelhoResumo ? `` : '',
    espelhoResumo ? `## ESPELHO DO SOC (carga por script, fora do sync_log)` : '',
    espelhoResumo ? `    ${espelhoResumo}` : '',
    saude ? `    ${saude.nota_espelho_soc}` : '',
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
