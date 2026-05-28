// ============================================================
// Carlitos — Contexto de Processos/Tech para o agente
// Fontes: dados estáticos de produtos + processos (ClickUp pendente)
// ============================================================

import {
  PRODUTOS_SAFEHELP,
  PROCESSOS_OPERACIONAIS,
  EQUIPE_TECH_CARLITOS,
  INDICADORES_TECH,
} from '@/lib/processos/dados'

export async function buildCarlitosContext(_pergunta?: string): Promise<string> {
  const produtosAtivos = PRODUTOS_SAFEHELP.filter(p => p.status !== 'pausado')
  const processosCriticos = PROCESSOS_OPERACIONAIS.filter(p => p.status !== 'em_dia')

  return [
    `=== Dados de Processos & Tech — Grupo GP SafeWork ===`,
    `Data: ${new Date().toLocaleDateString('pt-BR')}`,
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
    `## INTEGRAÇÕES ATIVAS NO SISTEMA`,
    `  - SOC (ExportaDados) — medicina, ASOs, agendamentos`,
    `  - Conta Azul (OAuth) — financeiro, custo de pessoal`,
    `  - D4sign — assinatura digital de contratos`,
    `  - RD Station — comercial / pipeline`,
    `  - Z-API / Evolution — WhatsApp`,
    `  - Pluggy — saldos bancários (em integração)`,
    `  - ClickUp — PENDENTE (gargalo do Carlitos)`,
    `  - Unisyst — migração planejada (vai substituir Conta Azul)`,
  ].join('\n')
}
