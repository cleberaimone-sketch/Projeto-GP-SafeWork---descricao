// ============================================================
// SafeChat — Contexto para o agente (dados públicos, sem PII)
// ============================================================

import { getAgendamentosRange, socConfigurado } from '@/lib/soc/client'

export async function buildSafechatContext(): Promise<string> {
  const ctx: string[] = [
    `=== Contexto SafeChat — GP SafeWork ===`,
    `Data: ${new Date().toLocaleDateString('pt-BR')}`,
    ``,
    `## CLÍNICAS SAFEWORK`,
    `  - Medianeira (matriz) · Foz do Iguaçu · Santa Helena · Londrina`,
    `  - Safe+ (rede credenciada nacional)`,
    ``,
    `## SERVIÇOS DISPONÍVEIS`,
    `  - ASO: Admissional, Periódico, Demissional, Retorno, Mudança de Função`,
    `  - Exames: Acuidade Visual, Audiometria, Espirometria, ECG, EEG, Hemograma, Raio X`,
    `  - Treinamentos NR: NR-10, NR-35, NR-33, NR-06, NR-12 e outros`,
    ``,
  ]

  // Próximos agendamentos disponíveis — dados públicos (sem PII)
  if (socConfigurado()) {
    try {
      const agendamentos = await getAgendamentosRange(0, 7)
      const total = (agendamentos as unknown[]).length
      ctx.push(`## AGENDAMENTOS PRÓXIMOS 7 DIAS`)
      ctx.push(total > 0
        ? `  ${total} consulta(s) agendada(s) nos próximos 7 dias`
        : `  Nenhum agendamento nos próximos 7 dias — contate a clínica para agendar`)
    } catch {
      ctx.push(`## AGENDAMENTOS`)
      ctx.push(`  Dados indisponíveis no momento — contate a clínica diretamente`)
    }
  }

  return ctx.join('\n')
}
