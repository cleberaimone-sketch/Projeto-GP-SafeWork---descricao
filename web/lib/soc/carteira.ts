// Separa a carteira da SafeWork das clínicas da rede SOCNET.
//
// A máscara de empresas (215358) devolve, junto com os clientes, as clínicas
// parceiras da rede SOCNET do próprio SOC. Elas vêm com o sufixo "(SOCNET)" no
// nome e com o NUMERO_VIDAS da carteira DELAS — não da SafeWork.
//
// Medido em 14/09/2026:
//
//   total              1.516 empresas ·  470.262 "vidas"
//   SOCNET (rede)         16 empresas ·  447.580 "vidas"   ← 95,2%
//   carteira própria   1.500 empresas ·   22.682 vidas
//
// Uma só, PERSONAL SYSTEM SERVIÇOS (SOCNET), traz 207.501. Somar tudo dava
// "470.262 vidas gerenciadas" em quatro dashboards e nos contextos da Nina e
// do Luizito — vinte vezes o real, e incoerente com os 21.308 trabalhadores
// com vínculo no espelho do SOC.
//
// O efeito na Nina era pior que um número feio: as oportunidades são
// calculadas por vida (vidas × 100 para churn, × 40 para upsell), então as 16
// clínicas da rede dominavam o ranking e a "receita potencial total" saía em
// R$ 45,7 milhões — oito vezes o faturamento do grupo.

export type EmpresaSOC = { CODIGO: string; NOME: string; CNPJ?: string; NUMERO_VIDAS?: string }

/**
 * True para clínica da rede SOCNET, não cliente.
 *
 * O marcador é o sufixo "(SOCNET)" no fim do nome, que o SOC aplica de forma
 * consistente — medido: 16 nomes com o sufixo, zero com "socnet" ou
 * "credenciada" em outra posição. Se um dia o padrão mudar, o sintoma é o
 * total de vidas saltar de novo para a casa das centenas de milhares.
 */
export function ehRedeSocnet(nome: string | undefined): boolean {
  return /\(SOCNET\)\s*$/i.test(nome ?? '')
}

export type Carteira = {
  /** Clientes da SafeWork com pelo menos uma vida. */
  clientes: EmpresaSOC[]
  /** Soma de vidas dos clientes — o número que vale em tela. */
  vidas: number
  /** Clínicas da rede SOCNET, separadas para não somarem com a carteira. */
  redeSocnet: EmpresaSOC[]
  vidasRedeSocnet: number
}

export function separarCarteira(empresas: EmpresaSOC[]): Carteira {
  const comVidas = empresas.filter(e => Number(e.NUMERO_VIDAS ?? 0) > 0)
  const redeSocnet = comVidas.filter(e => ehRedeSocnet(e.NOME))
  const clientes = comVidas.filter(e => !ehRedeSocnet(e.NOME))
  const somar = (a: EmpresaSOC[]) => a.reduce((s, e) => s + Number(e.NUMERO_VIDAS ?? 0), 0)
  return {
    clientes,
    vidas: somar(clientes),
    redeSocnet,
    vidasRedeSocnet: somar(redeSocnet),
  }
}
