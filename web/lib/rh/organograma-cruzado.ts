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

/** Marca as iniciais antes de limpar a pontuação: "J." vira inicial, "Ap" não. */
function tokens(nome: string): { t: string; inicial: boolean }[] {
  return nome.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(TITULOS, '')
    .split(/\s+/)
    .map(bruto => {
      const inicial = /^[a-z]{1,2}\.$/.test(bruto)
      return { t: bruto.replace(/[^a-z]/g, ''), inicial }
    })
    .filter(x => x.t.length > 0)
}

/** Distância de edição, com corte: só interessa saber se é 0, 1 ou "mais que 1". */
function perto(a: string, b: string): boolean {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0, j = 0, erros = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue }
    if (++erros > 1) return false
    if (a.length > b.length) i++
    else if (b.length > a.length) j++
    else { i++; j++ }
  }
  return erros + (a.length - i) + (b.length - j) <= 1
}

/**
 * Um pedaço do nome curto casa com algum pedaço do nome da planilha.
 *
 * Três formas, todas vistas no cruzamento real de 11/09/2026:
 *   igual ou prefixo   "Ap" em "Aparecida", "Marcelo" em "Marcelo"
 *   inicial com ponto  "J." em "Jovelino"
 *   grafia diferente   "Adrielly" e "Adriely", "Andressa" e "Andrerssa"
 *
 * A tolerância de grafia exige 5 letras ou mais: em nome curto, uma letra de
 * diferença já é outra pessoa ("Ana" e "Ane").
 */
function casaToken(curto: { t: string; inicial: boolean }, longos: { t: string }[]): boolean {
  return longos.some(l => {
    if (curto.inicial) return l.t.startsWith(curto.t)
    if (l.t === curto.t) return true
    if (curto.t.length >= 2 && l.t.length > curto.t.length && l.t.startsWith(curto.t)) return true
    if (curto.t.length >= 5 && l.t.length >= 5 && perto(curto.t, l.t)) return true
    return false
  })
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

  const candidatos = PESSOAS
    .map(p => ({ p, longo: tokens(p.nome) }))
    .filter(({ longo }) => curto.every(c => casaToken(c, longo)))
    // Prefixo de duas ou três letras é permissivo demais sozinho ("Ap" casaria
    // com meio mundo), então quem usa essa porta precisa de outro pedaço
    // batendo letra por letra: "Lucia Ap" passa por "Lucia", "Ap" sozinho não.
    //
    // Grafia diferente não entra nessa exigência — "Adrielly" e "Adriely" são
    // a mesma pessoa escrita de dois jeitos, e o nome tem uma palavra só.
    .filter(({ longo }) => {
      const usouPrefixoCurto = curto.some(c =>
        !c.inicial && c.t.length < 4 &&
        !longo.some(l => l.t === c.t) &&
        longo.some(l => l.t.startsWith(c.t)))
      if (!usouPrefixoCurto) return true
      return curto.some(c => longo.some(l => l.t === c.t))
    })
  if (candidatos.length === 0) return null
  if (candidatos.length === 1) return candidatos[0].p

  // Havendo mais de um, desempata por quantos pedaços batem LETRA POR LETRA —
  // "Gabriele C. Teles" casa com "Gabriele das chagas Teles" e com "Gabrielly
  // Costa de Carvalho" pelas regras frouxas, e só o primeiro tem dois tokens
  // idênticos. Entre empates, o ativo manda: o organograma descreve quem está
  // lá hoje.
  const pontuado = candidatos.map(({ p, longo }) => ({
    p,
    exatos: curto.filter(c => longo.some(l => l.t === c.t)).length,
    ativo: p.status === 'Ativo' ? 1 : 0,
  })).sort((a, b) => b.exatos - a.exatos || b.ativo - a.ativo)

  // Empate no topo com nomes diferentes é ambiguidade real: melhor não casar do
  // que atribuir salário à pessoa errada.
  const [primeiro, segundo] = pontuado
  if (segundo && primeiro.exatos === segundo.exatos && primeiro.ativo === segundo.ativo
      && !mesmaPessoa(primeiro.p.nome, segundo.p.nome)) return null
  return primeiro.p
}

/**
 * Dois registros da mesma pessoa.
 *
 * Quem atende várias unidades entra na planilha uma vez por unidade —
 * "Hillyard Adrian Galdino Pivato - SAFEMAIS", "- LONDRINA", "- FOZ DO IGUAÇU"
 * e mais duas. São cinco linhas, um contrato cada, e a pessoa é uma só: tratar
 * como ambiguidade a deixaria sem custo nenhum no organograma.
 */
function mesmaPessoa(a: string, b: string): boolean {
  const base = (n: string) => n.split(/\s+-\s+/)[0].trim().toLowerCase()
  return base(a) === base(b)
}

/** Todos os registros de uma pessoa — quem atende várias unidades tem vários. */
export function registrosDe(nome: string): Pessoa[] {
  const achado = encontrar(nome)
  if (!achado) return []
  const base = achado.nome.split(/\s+-\s+/)[0].trim().toLowerCase()
  return PESSOAS.filter(p => p.nome.split(/\s+-\s+/)[0].trim().toLowerCase() === base)
}

export function cruzar(
  pessoas: { nome: string; cargo: string; destaque?: string }[],
  mesesFechados: number,
): PessoaOrganograma[] {
  return pessoas.map(p => {
    const regs = registrosDe(p.nome)
    const reg = regs.find(r => r.status === 'Ativo') ?? regs[0] ?? null
    // Soma os contratos: quem atende cinco unidades custa a soma dos cinco.
    const custos = regs.map(r => custoMedio(r, mesesFechados)).filter((v): v is number => v !== null)
    return {
      ...p,
      registro: reg,
      saiu: regs.length > 0 && regs.every(r => r.status === 'Inativo'),
      saida: reg?.saida ?? null,
      custoMes: custos.length > 0 ? custos.reduce((s, v) => s + v, 0) : null,
    }
  })
}
