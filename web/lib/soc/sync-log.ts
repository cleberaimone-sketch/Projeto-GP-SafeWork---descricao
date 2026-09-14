// Registro da carga do SOC em sync_log.
//
// Descoberto em 14/09/2026: sync_log tinha 2.566 linhas e TODAS de
// 'conta_azul'. A carga do SOC — rota diária e os três scripts — nunca
// registrou nada. Consequências práticas:
//
//   · o painel de sistema mostrava uma integração só, porque a outra não se
//     anunciava;
//   · não havia como responder "quando o espelho do SOC foi atualizado", nem
//     para dizer que estava parado;
//   · o Carlitos, que cuida justamente de integrações, não tinha o que falar
//     do SOC.
//
// A ausência de registro é indistinguível de uma integração saudável e
// silenciosa — é a mesma falha que já custou caro em outros pontos deste
// projeto: falta de dado sendo lida como ausência de problema.
//
// Espelha o formato que a rota do Conta Azul já usa, para as duas fontes serem
// lidas pelo mesmo código.

import type { SupabaseClient } from '@supabase/supabase-js'

export type ResumoCarga = {
  /** 'exames', 'licencas', 'funcionarios', 'trabalhadores' */
  tipo: string
  registros: number
  /** Unidades de falha: janelas ou empresas que não importaram. */
  erros: number
  /** Mensagens de erro, se houver. Vão truncadas — cabem no log, não no prompt. */
  detalhes?: string[]
  /** Qualquer contexto extra útil depois: período, quantas janelas, etc. */
  metadados?: Record<string, unknown>
}

const LIMITE_MENSAGEM = 2000

/**
 * Grava uma execução de carga do SOC.
 *
 * Nunca lança: falhar ao registrar não pode derrubar a carga que deu certo. Mas
 * também não fica em silêncio — escreve no console, porque um registro que
 * some sem avisar recria o problema que esta função existe para resolver.
 */
export async function registrarCargaSOC(
  db: SupabaseClient,
  iniciadoEm: string,
  r: ResumoCarga,
): Promise<void> {
  const mensagem = r.detalhes?.length ? r.detalhes.join(' | ').slice(0, LIMITE_MENSAGEM) : null
  try {
    const { error } = await db.from('sync_log').insert({
      fonte: 'soc',
      empresa_id: null,          // a carga é da conta SafeWork inteira
      tipo_sync: r.tipo,
      // 'parcial' quando houve erro mas também houve importação: é o caso
      // comum aqui, já que uma janela falha sem derrubar as outras.
      status: r.erros === 0 ? 'sucesso' : r.registros > 0 ? 'parcial' : 'erro',
      registros_processados: r.registros,
      registros_erro: r.erros,
      mensagem_erro: mensagem,
      iniciado_em: iniciadoEm,
      finalizado_em: new Date().toISOString(),
      metadados: r.metadados ?? null,
    })
    if (error) console.error('[SOC] não consegui registrar em sync_log:', error.message)
  } catch (e) {
    console.error('[SOC] não consegui registrar em sync_log:', e)
  }
}
