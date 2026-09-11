// Cruza o organograma com o quadro de pessoas.
//
// O organograma veio das fotos da parede em 06/05/2026 e envelhece sozinho: em
// 11/09 havia doze pessoas nele que já tinham saído, com datas entre março e
// setembro. A planilha do DP sabe quem saiu e quanto cada um custa; aqui os
// dois se encontram, sem reescrever o organograma à mão a cada desligamento.
//
// Os nomes vêm de fontes diferentes — "Josiane Klaus" na parede, "Josiane Klaus
// da Silva" na planilha; "Dra. Gabriela" contra o nome civil. O casamento exige
// que TODOS os tokens do nome curto apareçam no longo, o que erra para menos
// (deixa de casar) em vez de para mais (casar com a pessoa errada) — e quem não
// casa aparece sem custo, não com custo zero.

import { PESSOAS, type Pessoa } from './pessoas'

export type PessoaOrganograma = {
  nome: string
  cargo: string
  destaque?: string
  /** Achado na planilha do DP. */
  registro: Pessoa | null
  /** Saiu, com a data. O organograma da parede ainda a mostra. */
  saiu: boolean
  saida: string | null
  /** Custo médio mensal dos meses com lançamento. Null quando não casou. */
  custoMes: number | null
}

const TITULOS = /\b(dra?|enf|enfa|sr|sra)\b\.?/g

function tokens(nome: string): string[] {
  return nome.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(TITULOS, '')
    .replace(/[^a-z ]/g, ' ')
    .split(/\s+/).filter(Boolean)
}

/** Custo médio da pessoa nos meses em que houve lançamento. */
export function custoMedio(p: Pessoa, mesesFechados: number): number | null {
  const meses = p.custoMensal.slice(0, mesesFechados).filter(v => v > 0)
  if (meses.length === 0) return null
  return meses.reduce((s, v) => s + v, 0) / meses.length
}

export function encontrar(nome: string): Pessoa | null {
  const curto = tokens(nome)
  if (curto.length === 0) return null
  const candidatos = PESSOAS.filter(p => {
    const longo = tokens(p.nome)
    return curto.every(t => longo.some(a => a === t || (t.length >= 4 && a.startsWith(t))))
  })
  if (candidatos.length === 0) return null
  // Havendo homônimos, o ativo manda: o organograma descreve quem está lá.
  return candidatos.find(c => c.status === 'Ativo') ?? candidatos[0]
}

export function cruzar(
  pessoas: { nome: string; cargo: string; destaque?: string }[],
  mesesFechados: number,
): PessoaOrganograma[] {
  return pessoas.map(p => {
    const reg = encontrar(p.nome)
    return {
      ...p,
      registro: reg,
      saiu: reg ? reg.status === 'Inativo' : false,
      saida: reg?.saida ?? null,
      custoMes: reg ? custoMedio(reg, mesesFechados) : null,
    }
  })
}
