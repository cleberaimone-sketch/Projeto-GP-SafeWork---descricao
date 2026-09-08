// Coleta de dados do SOC que distingue "não sei" de "zero".
//
// As telas que leem o SOC terminavam cada chamada em .catch(() => []). Falha
// virava lista vazia, e o painel dizia "nenhum ASO vencido, nenhum EPI a
// vencer" com a mesma cara de quando olhou de verdade — com o selo verde de
// "SOC conectado" no cabeçalho, que só checava se a credencial existia.
//
// Zero é uma afirmação; ausência de dado não é. Em medicina e engenharia a
// diferença tem consequência legal: prazo de eSocial e EPI vencido não somem
// porque a API caiu.

export type EstadoSOC = {
  /** Credencial configurada (não diz nada sobre a API responder). */
  configurado: boolean
  /** Nome das consultas que falharam nesta renderização. */
  falhas: string[]
  total: number
  /** Nenhuma consulta voltou: todo número da tela é zero por falta de dado. */
  mudo: boolean
  /** Parte voltou: os indicadores dessas consultas estão subestimados. */
  parcial: boolean
  /** Todas responderam. */
  integro: boolean
  /** Houve resposta suficiente para mostrar número em vez de "—". */
  disponivel: boolean
}

export function coletorSOC(configurado: boolean) {
  const falhas: string[] = []

  return {
    falhas,

    /** Executa a consulta; se falhar, registra o nome e devolve o vazio. */
    async tentar<T>(nome: string, buscar: () => Promise<T>, vazio: T): Promise<T> {
      if (!configurado) return vazio
      try {
        return await buscar()
      } catch (e) {
        falhas.push(nome)
        console.error(`[SOC] ${nome} falhou:`, e)
        return vazio
      }
    },

    /** `total` é quantas consultas a tela dispara ao todo. */
    estado(total: number): EstadoSOC {
      const mudo = configurado && falhas.length === total
      return {
        configurado,
        falhas,
        total,
        mudo,
        parcial: configurado && falhas.length > 0 && !mudo,
        integro: configurado && falhas.length === 0,
        disponivel: configurado && !mudo,
      }
    },
  }
}
