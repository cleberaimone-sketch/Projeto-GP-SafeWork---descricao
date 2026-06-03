// ============================================================
// GP OS Core — helper de publicação de eventos
//
// Insere diretamente no Supabase (sem HTTP inter-processo).
// Use em qualquer route handler do servidor que produza um evento
// relevante para o ecossistema.
//
// Exemplo:
//   await publicarEvento('briefing_gerado', 'command_center', { data: '2026-06-03' })
// ============================================================

import { createClient } from '@supabase/supabase-js'

export const TIPOS_EVENTO = [
  // Comercial / vendas (GP Sales IA)
  'lead_criado', 'lead_qualificado', 'proposta_gerada',
  'venda_fechada', 'pagamento_confirmado', 'cliente_criado',
  'contrato_gerado', 'contrato_assinado',
  // Operacional SST (GP SST Core)
  'ordem_servico_aberta', 'exame_agendado', 'visita_tecnica_agendada', 'documento_entregue',
  // Financeiro (GP ERP Core / Conta Azul)
  'fatura_gerada', 'pagamento_recebido',
  // Operacional interno (Command Center)
  'briefing_gerado', 'sync_concluido', 'sync_erro',
  // Alertas
  'alerta_critico',
] as const

export type TipoEvento = typeof TIPOS_EVENTO[number]

export type OrigemEvento =
  | 'command_center'
  | 'gp_sales_ia'
  | 'gp_erp_core'
  | 'gp_sst_core'
  | 'd4sign'
  | 'conta_azul'
  | 'externo'

export async function publicarEvento(
  tipo: TipoEvento,
  origem: OrigemEvento = 'command_center',
  payload: Record<string, unknown> = {},
): Promise<string | null> {
  try {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const { data, error } = await sb
      .from('os_eventos')
      .insert({ tipo, origem, payload })
      .select('id')
      .single()

    if (error) {
      console.error(`[os/eventos] Erro ao publicar ${tipo}:`, error.message)
      return null
    }
    return data.id as string
  } catch (err) {
    console.error(`[os/eventos] Exceção ao publicar ${tipo}:`, err)
    return null
  }
}
