// Leitura do retorno da máscara 193691 (GHE — Grupos Homogêneos de Exposição).
//
// A máscara ficou recusando acesso ("Metodo de acesso não permitido") até ser
// liberada no painel em 10/09/2026. Liberada, ela responde — mas responde o
// catálogo da CONTA SafeWork, não os GHE das empresas clientes: quatro grupos
// (administrativo, vigia, portaria, limpeza), todos sem unidade cliente, e
// idênticos para qualquer `empresaTrabalho` que se passe. É a mesma armadilha
// do relatório de setores, que devolve sempre as mesmas 36 linhas.
//
// Isso é pior que a recusa. Recusado, o painel dizia "não sei". Liberado, ele
// diria "4 GHE, nenhum com insalubridade" para uma carteira de 25 mil
// trabalhadores ativos — uma afirmação de ausência de risco que ninguém
// verificou, na tela de segurança do trabalho.

export type Ghe = {
  codigoGhe?: string
  descricaoGhe?: string
  codigoUnidadeCliente?: string
  maiorAdicionalInsalubridade?: string
  existePericulosidade?: string
  existeAposentadoriaEspecial?: string
  maiorPeriodoAposentadoria?: string
}

/**
 * O SOC escreve booleano como 'true'/'false' nesta máscara. O código antigo
 * testava 'S' e 'Sim', que a resposta nunca traz — então periculosidade e
 * aposentadoria especial dariam zero mesmo com o dado certo na mão.
 */
export function ehSim(v: string | undefined): boolean {
  const s = (v ?? '').trim().toLowerCase()
  return s === 'true' || s === 's' || s === 'sim' || s === '1'
}

/**
 * O retorno descreve as empresas clientes, ou é só o catálogo interno?
 *
 * Um GHE de cliente traz `codigoUnidadeCliente`. Se nenhum traz, o que veio é
 * o catálogo da própria conta e não diz nada sobre a carteira.
 */
export function ehCatalogoInterno(ghe: Ghe[]): boolean {
  return ghe.length > 0 && ghe.every(g => !(g.codigoUnidadeCliente ?? '').trim())
}

export function resumirGhe(ghe: Ghe[]) {
  const comInsalubridade = ghe.filter(g => {
    const v = (g.maiorAdicionalInsalubridade ?? '').trim()
    return v !== '' && v !== '0'
  })
  return {
    total: ghe.length,
    comInsalubridade,
    comPericulosidade: ghe.filter(g => ehSim(g.existePericulosidade)),
    comAposEsp: ghe.filter(g => ehSim(g.existeAposentadoriaEspecial)),
    // Enquanto isto for verdade, os números acima descrevem a SafeWork, não os
    // clientes — e a tela precisa dizer isso em vez de exibi-los como fato.
    apenasCatalogoInterno: ehCatalogoInterno(ghe),
  }
}
