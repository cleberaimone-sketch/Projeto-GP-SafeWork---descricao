'use client'

import { useState, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  Tooltip, Legend, ReferenceLine, Cell,
} from 'recharts'
import { avaliarCarga, MESES_MINIMOS_COMPARAVEIS } from '@/lib/financeiro/integridade'

/**
 * O mesmo recorte no exercício anterior. `temMovimento` diz em quais meses a
 * unidade de fato operou — um mês em que ela ainda não existia vale como
 * "sem base", não como zero, senão a variação estoura.
 */
export type SerieAnterior = {
  receita: number[]
  despesa: number[]
  lucro: number[]
  deducoes: number[]
  temMovimento: boolean[]
}

/** Uma linha de despesa que era regular na unidade e virou esparsa. */
export type DespesaParada = {
  unidade: string
  categoria: string
  mesesBase: number
  mesesLancados: number
  ultimoMes: number
  faltando: number
}

export type SerieUnidade = {
  unidade: string
  receita: number[]
  despesa: number[]
  lucro: number[]
  deducoes: number[]
  anterior?: SerieAnterior
  despesasParadas?: DespesaParada[]
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

// Precisa bater com o rótulo que a page.tsx dá ao consolidado.
const GRUPO = 'TOTAL DO GRUPO'

// As cores do modelo que o Cleber trouxe (Google Sheets), para o gráfico ser
// reconhecível: receita azul, despesa vermelha, lucro amarelo.
const AZUL = '#4285f4'
const VERMELHO = '#ea4335'
const AMARELO = '#f9ab00'
const VERDE = '#0f766e'
// Margem não estava na planilha e não é dinheiro — ganha cor própria para
// ninguém ler os pontos percentuais como reais.
const VIOLETA = '#8b5cf6'
// Contorno do mês que destoa da série.
const AMBAR = '#d97706'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const pct = (v: number) => `${v.toFixed(1).replace('.', ',')}%`
const pp = (v: number) => `${Math.abs(v).toFixed(1).replace('.', ',')} p.p.`
const eixo = (v: number) => {
  const a = Math.abs(v)
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}mi`
  if (a >= 1_000)     return `${(v / 1_000).toFixed(0)}k`
  return String(Math.round(v))
}
const eixoPct = (v: number) => `${Math.round(v)}%`
const tooltipStyle = {
  backgroundColor: '#fff', border: '1px solid #e2e8f0',
  borderRadius: 8, fontSize: 12, color: '#1e293b',
}

type Visao = 'completo' | 'lucro' | 'despesa' | 'receita' | 'margem'
type Chave = 'receita' | 'despesa' | 'lucro'

const VISOES: { chave: Visao; rotulo: string; dica: string }[] = [
  { chave: 'completo', rotulo: 'Receita, despesa e lucro', dica: 'As três séries juntas, como na planilha' },
  { chave: 'lucro',    rotulo: 'Só lucro',                 dica: 'Isola o lucro para ver a tendência' },
  { chave: 'despesa',  rotulo: 'Só despesa',               dica: 'Isola a despesa: está subindo ou caindo?' },
  { chave: 'receita',  rotulo: 'Só receita',               dica: 'Isola o faturamento' },
  { chave: 'margem',   rotulo: 'Margem %',                 dica: 'Lucro sobre receita: quem opera melhor, e não quem é maior' },
]

// Na visão completa a barra é a receita, então é a receita que ganha fantasma.
const SERIE_DA_VISAO: Record<Visao, { chave: Chave; rotulo: string; cor: string }> = {
  completo: { chave: 'receita', rotulo: 'Receita', cor: AZUL },
  receita:  { chave: 'receita', rotulo: 'Receita', cor: AZUL },
  despesa:  { chave: 'despesa', rotulo: 'Despesa', cor: VERMELHO },
  lucro:    { chave: 'lucro',   rotulo: 'Lucro',   cor: AMARELO },
  margem:   { chave: 'lucro',   rotulo: 'Margem',  cor: VIOLETA },
}

/**
 * Abaixo disto a unidade não é uma operação com margem ruim: é centro de custo.
 * A matriz concentra a despesa administrativa do grupo e quase não emite nota
 * (faturou 2% do que gastou em 2026), e a SW Meio Ambiente, 3% — dividir um
 * prejuízo por uma receita simbólica devolve "-4.886%", que não é margem, é
 * ruído. As unidades que operam de verdade faturam de 118% a 173% da própria
 * despesa, então o corte separa os dois grupos com folga dos dois lados.
 */
const LIMIAR_OPERACAO = 0.25

/** Margem do período: lucro sobre receita, ou null quando não se aplica. */
function margem(receita: number, despesa: number) {
  if (receita === 0 || receita < despesa * LIMIAR_OPERACAO) return null
  return ((receita - despesa) / receita) * 100
}

/** Margem mês a mês. Mês sem faturamento não tem margem — é lacuna, não zero. */
const margemMensal = (receita: number[], despesa: number[]) =>
  receita.map((r, i) => margem(r, despesa[i]))

/**
 * Margem de um conjunto de meses: lucro do período sobre receita do período.
 *
 * Não é a média das margens mensais. Um mês de R$ 5 mil faturados com 80% de
 * margem pesaria igual a um de R$ 800 mil com 10%, e a unidade pareceria muito
 * melhor do que é.
 */
function margemPeriodo(receita: number[], despesa: number[], indices: number[]) {
  return margem(
    indices.reduce((a, i) => a + receita[i], 0),
    indices.reduce((a, i) => a + despesa[i], 0),
  )
}

/**
 * Quantas vezes a mediana um mês precisa valer para ser tratado como atípico.
 *
 * Mediana, e não média, porque a média já vem envenenada pelo próprio outlier
 * que se quer achar. Três é o corte que separa os casos reais sem pegar mês
 * bom: na SafeT de 2025 a mediana da receita é R$ 52.865 e jan/fev valem
 * R$ 451 mil e R$ 471 mil — 8,5x —, enquanto março, o mês mais caro depois
 * deles, fica em 2,6x e continua de fora.
 */
const LIMIAR_ATIPICO = 3

/** Meses do recorte cujo valor supera LIMIAR_ATIPICO vezes a mediana. */
function mesesAtipicos(serie: number[], indices: number[]): number[] {
  const comMovimento = indices.filter(i => serie[i] !== 0)
  // Com poucos pontos a mediana não sustenta conclusão nenhuma.
  if (comMovimento.length < 4) return []
  const ordenados = comMovimento.map(i => Math.abs(serie[i])).sort((a, b) => a - b)
  const meio = Math.floor(ordenados.length / 2)
  const mediana = ordenados.length % 2
    ? ordenados[meio]
    : (ordenados[meio - 1] + ordenados[meio]) / 2
  if (mediana === 0) return []
  return comMovimento.filter(i => Math.abs(serie[i]) > mediana * LIMIAR_ATIPICO)
}

/**
 * A mesma checagem de carga tributária do Cockpit e do DRE, aplicada unidade a
 * unidade. A regra mora em lib/financeiro/integridade — foi aqui que ela
 * nasceu, mas o problema não é desta tela.
 */
function integridadeTributaria(
  serie: SerieUnidade, anterior: SerieAnterior | undefined, indicesSel: number[],
) {
  if (!anterior) return null
  // Mesmos meses nos dois anos, senão a carga compara períodos diferentes.
  const idx = indicesSel.filter(i => anterior.temMovimento[i])
  // Poucos meses não sustentam a comparação: imposto entra em bloco e um
  // recorte curto acusa falta onde só há irregularidade de lançamento.
  if (idx.length < MESES_MINIMOS_COMPARAVEIS) return null

  const somar = (s: number[]) => idx.reduce((a, i) => a + s[i], 0)
  const avaliacao = avaliarCarga(
    somar(serie.receita), somar(serie.deducoes),
    somar(anterior.receita), somar(anterior.deducoes),
  )
  return avaliacao && { ...avaliacao, meses: idx.length }
}

/** "4.05.02 Aluguel – Administrativo" → "Aluguel" */
const limparCategoria = (c: string) =>
  c.replace(/^[\d.]+\s*/, '')
   .replace(/\s*[–-]\s*(Administrativo|Comercial|Medicina|Engenharia)\s*$/i, '')

/** "jan", "jan e fev", "jan, fev e mar" */
const listar = (nomes: string[]) =>
  nomes.length <= 1 ? (nomes[0] ?? '')
    : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`

export default function AcompanhamentoClient({
  ano, anoCorrente, unidades, mesesFechados,
}: {
  ano: number
  anoCorrente: number
  unidades: SerieUnidade[]
  mesesFechados: number
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [visao, setVisao] = useState<Visao>('completo')
  const [comparar, setComparar] = useState(true)
  // Guarda quem está FORA, não quem está dentro: assim trocar de exercício e
  // trazer outra composição de unidades não esvazia o painel.
  const [ocultas, setOcultas] = useState<Set<string>>(() => new Set())

  // Quais meses entram no acumulado e na média. Começa nos fechados, mas dá
  // para tirar um mês atípico — agosto/2026, por exemplo, tem o projeto
  // fechado da Safe+ e sozinho puxa a média do grupo para cima.
  const [selecionados, setSelecionados] = useState<Set<number>>(
    () => new Set(Array.from({ length: mesesFechados }, (_, i) => i)))

  const excluirMeses = (indices: number[]) => setSelecionados(atual => {
    const novo = new Set(atual)
    for (const i of indices) novo.delete(i)
    return novo
  })

  const alternarMes = (i: number) => setSelecionados(atual => {
    const novo = new Set(atual)
    if (novo.has(i)) novo.delete(i); else novo.add(i)
    return novo
  })

  const trocarAno = (a: number) => {
    const p = new URLSearchParams(params.toString())
    p.set('ano', String(a))
    router.push(`/dashboard/financeiro/acompanhamento?${p}`)
  }

  const alternarUnidade = (nome: string) => setOcultas(atual => {
    const novo = new Set(atual)
    if (novo.has(nome)) novo.delete(nome); else novo.add(nome)
    return novo
  })

  const visiveis = unidades.filter(u => !ocultas.has(u.unidade))

  const anos = Array.from({ length: anoCorrente - 2024 + 1 }, (_, i) => 2024 + i).reverse()
  const anoAnterior = ano - 1
  const temBase = unidades.some(u => u.anterior)
  const comparando = comparar && temBase

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-end gap-5">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5">Exercício</p>
          <div className="flex gap-1">
            {anos.map(a => (
              <button key={a} onClick={() => trocarAno(a)}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  a === ano ? 'bg-blue-900 text-white border-blue-900'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                {a}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5">O que mostrar</p>
          <div className="flex flex-wrap gap-1">
            {VISOES.map(v => (
              <button key={v.chave} onClick={() => setVisao(v.chave)} title={v.dica}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  v.chave === visao ? 'bg-blue-900 text-white border-blue-900'
                                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                {v.rotulo}
              </button>
            ))}
          </div>
        </div>
        {temBase && (
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5">Comparação</p>
            <button onClick={() => setComparar(c => !c)}
              title={`Sobrepõe o mesmo recorte de ${anoAnterior} e mostra a variação de cada linha`}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                comparar ? 'bg-blue-900 text-white border-blue-900'
                         : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
              vs {anoAnterior}
            </button>
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">
            Meses no acumulado e na média
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => setSelecionados(new Set(Array.from({ length: mesesFechados }, (_, i) => i)))}
              className="px-2.5 py-1 text-[11px] rounded-lg border border-slate-200 text-slate-600 hover:border-slate-300">
              Só meses fechados
            </button>
            <button
              onClick={() => setSelecionados(new Set(Array.from({ length: 12 }, (_, i) => i)))}
              className="px-2.5 py-1 text-[11px] rounded-lg border border-slate-200 text-slate-600 hover:border-slate-300">
              Ano todo
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {MESES.map((m, i) => {
            const ativo = selecionados.has(i)
            const fechado = i < mesesFechados
            return (
              <button key={m} onClick={() => alternarMes(i)}
                title={fechado ? undefined : 'mês ainda não fechado'}
                className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                  ativo ? 'bg-blue-900 text-white border-blue-900'
                        : `bg-white border-slate-200 hover:border-slate-300 ${
                            fechado ? 'text-slate-600' : 'text-slate-300'}`}`}>
                {m}
              </button>
            )
          })}
        </div>
        {selecionados.size === 0 && (
          <p className="text-[11px] text-amber-700 mt-2">
            Nenhum mês selecionado — o acumulado e a média ficam zerados.
          </p>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">
            Unidades no painel
          </p>
          <div className="flex gap-1">
            <button onClick={() => setOcultas(new Set())}
              className="px-2.5 py-1 text-[11px] rounded-lg border border-slate-200 text-slate-600 hover:border-slate-300">
              Todas
            </button>
            <button
              onClick={() => setOcultas(new Set(unidades.map(u => u.unidade).filter(n => n !== GRUPO)))}
              className="px-2.5 py-1 text-[11px] rounded-lg border border-slate-200 text-slate-600 hover:border-slate-300">
              Só o grupo
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {unidades.map(u => {
            const ativo = !ocultas.has(u.unidade)
            return (
              <button key={u.unidade} onClick={() => alternarUnidade(u.unidade)}
                className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                  ativo ? 'bg-blue-900 text-white border-blue-900'
                        : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'}`}>
                {u.unidade === GRUPO ? 'Grupo' : u.unidade}
              </button>
            )
          })}
        </div>
      </div>

      {visiveis.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-sm text-slate-500">
          Nenhuma unidade selecionada acima.
        </div>
      ) : visiveis.map(u => (
        <GraficoUnidade key={u.unidade} serie={u} visao={visao} ano={ano}
                        mesesFechados={mesesFechados} selecionados={selecionados}
                        comparando={comparando} onExcluirMeses={excluirMeses} />
      ))}
    </div>
  )
}

/**
 * Variação percentual do recorte contra o mesmo recorte do ano anterior.
 *
 * Só entram os meses em que a unidade operou nos dois anos: comparar agosto de
 * 2026 com um agosto de 2025 em que a unidade nem existia produziria um "+∞%"
 * que não quer dizer nada. Quando sobram menos meses do que os selecionados, o
 * card avisa em quantos a comparação se apoia.
 */
function variacaoAnual(
  atual: number[], anterior: SerieAnterior | undefined,
  chave: Chave, indicesSel: number[],
) {
  if (!anterior) return null
  const base = indicesSel.filter(i => anterior.temMovimento[i])
  if (!base.length) return null
  const somaAtual = base.reduce((a, i) => a + atual[i], 0)
  const somaAnt = base.reduce((a, i) => a + anterior[chave][i], 0)
  if (somaAnt === 0) return null
  return {
    pct: ((somaAtual - somaAnt) / Math.abs(somaAnt)) * 100,
    somaAtual, somaAnt,
    meses: base.length,
    parcial: base.length < indicesSel.length,
  }
}

/**
 * Margem contra a do ano anterior — em pontos percentuais, nunca em "%".
 * Sair de 10% para 15% é ganhar 5 p.p.; dizer "+50%" seria verdade aritmética
 * e leitura errada.
 */
function variacaoMargem(
  serie: SerieUnidade, anterior: SerieAnterior | undefined, indicesSel: number[],
) {
  if (!anterior) return null
  const base = indicesSel.filter(i => anterior.temMovimento[i])
  if (!base.length) return null
  const atual = margemPeriodo(serie.receita, serie.despesa, base)
  const ant = margemPeriodo(anterior.receita, anterior.despesa, base)
  if (atual === null || ant === null) return null
  return { delta: atual - ant, atual, ant, meses: base.length, parcial: base.length < indicesSel.length }
}

function GraficoUnidade({
  serie, visao, ano, mesesFechados, selecionados, comparando, onExcluirMeses,
}: {
  serie: SerieUnidade; visao: Visao; ano: number
  mesesFechados: number; selecionados: Set<number>; comparando: boolean
  onExcluirMeses: (indices: number[]) => void
}) {
  const destaque = serie.unidade === GRUPO
  const base = comparando ? serie.anterior : undefined
  const daVisao = SERIE_DA_VISAO[visao]
  const ehMargem = visao === 'margem'

  const indicesSel = [...selecionados].sort((a, b) => a - b)

  // Média dos meses SELECIONADOS que tiveram movimento. Antes a janela era
  // fixa nos meses fechados; agora quem escolhe é o seletor, então dá para
  // tirar um mês atípico da conta sem tirá-lo do gráfico.
  const media = (s: number[]) => {
    const c = s.filter((v, i) => selecionados.has(i) && v !== 0)
    return c.length ? c.reduce((a, b) => a + b, 0) / c.length : 0
  }

  const margens = useMemo(() => margemMensal(serie.receita, serie.despesa), [serie])
  const principal: (number | null)[] = ehMargem ? margens : serie[daVisao.chave]

  // Em margem a referência do período é a margem ponderada, não a média das
  // margens mensais; nas demais, a média mensal de sempre.
  const referencia = ehMargem
    ? margemPeriodo(serie.receita, serie.despesa, indicesSel)
    : media(serie[daVisao.chave])

  // Em margem quem distorce é a receita, não o lucro: um contrato grande entra
  // como faturamento e arrasta a margem junto.
  const referenciaAtipico = ehMargem ? serie.receita : serie[daVisao.chave]
  const rotuloAtipico = ehMargem ? 'receita' : daVisao.rotulo.toLowerCase()

  const atipicos = useMemo(
    () => mesesAtipicos(referenciaAtipico, [...selecionados].sort((a, b) => a - b)),
    [referenciaAtipico, selecionados])

  // Os meses do ano anterior que servem de base — só onde a unidade operou.
  const baseIdx = useMemo(
    () => base ? [...selecionados].sort((a, b) => a - b).filter(i => base.temMovimento[i]) : [],
    [base, selecionados])
  const referenciaAnt = base ? (ehMargem ? base.receita : base[daVisao.chave]) : null
  const atipicosAnt = useMemo(
    () => referenciaAnt ? mesesAtipicos(referenciaAnt, baseIdx) : [],
    [referenciaAnt, baseIdx])

  const dados = useMemo(() => {
    // O acumulado soma só os meses marcados. Antes vinha pronto do servidor,
    // fechando o ano inteiro: ao tirar agosto da conta, o rodapé mudava e a
    // linha verde não — dois números diferentes para a mesma pergunta.
    let soma = 0
    const antMargens = base ? margemMensal(base.receita, base.despesa) : null
    return MESES.map((m, i) => {
      const dentro = selecionados.has(i)
      if (dentro) soma += serie.lucro[i]
      return {
        mes: m,
        Receita: serie.receita[i],
        Despesa: serie.despesa[i],
        Lucro: serie.lucro[i],
        Margem: margens[i],
        // Mês de fora não interrompe a curva: ela liga o ponto anterior ao
        // próximo que conta (connectNulls), pulando o mês excluído.
        Acumulado: dentro ? soma : null,
        // Mês sem operação no ano anterior vira lacuna na linha, não um
        // mergulho até o zero.
        anterior: base && base.temMovimento[i]
          ? (ehMargem ? antMargens![i] : base[daVisao.chave][i])
          : null,
        // "fechado" aqui é o que ENTRA na conta — o mês fora da seleção fica
        // esmaecido do mesmo jeito que um mês em curso.
        fechado: dentro,
        atipico: atipicos.includes(i),
      }
    })
  }, [serie, selecionados, base, daVisao.chave, margens, ehMargem, atipicos])

  const temDado = principal.some(v => v !== null && v !== 0)
  if (!temDado) {
    // Fora da visão de margem, série vazia é unidade sem movimento: não ocupa
    // espaço. Na de margem é outra coisa — a unidade opera, só não fatura —, e
    // sumir do painel faria parecer que ela deixou de existir.
    if (!ehMargem) return null
    const r = indicesSel.reduce((a, i) => a + serie.receita[i], 0)
    const d = indicesSel.reduce((a, i) => a + serie.despesa[i], 0)
    return (
      <div className="bg-white rounded-xl p-4 border border-slate-200">
        <h2 className={`font-bold ${destaque ? 'text-blue-900 text-lg' : 'text-slate-800'}`}>
          {serie.unidade}
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Margem não se aplica no período: {brl(r)} de receita contra {brl(d)} de despesa.
          É centro de custo, não operação — o percentual só devolveria ruído.
        </p>
      </div>
    )
  }

  const totalPeriodo = ehMargem
    ? referencia
    : serie[daVisao.chave].reduce((a, v, i) => selecionados.has(i) ? a + v : a, 0)

  // Compara com o último mês SELECIONADO, não com o último fechado: se agosto
  // saiu da conta, não faz sentido a variação ainda apontar para agosto.
  const ultimo = indicesSel.length ? principal[indicesSel[indicesSel.length - 1]] : null
  // Em margem a distância é em pontos percentuais; nas outras, em porcentagem.
  const variacao = ultimo === null || referencia === null || (!ehMargem && referencia === 0)
    ? null
    : ehMargem ? ultimo - referencia
               : ((ultimo - referencia) / Math.abs(referencia)) * 100
  // Em despesa, subir é ruim; nas outras, subir é bom.
  const ehBom = (v: number) => visao === 'despesa' ? v <= 0 : v >= 0

  // Quanto os meses atípicos pesam no total do próprio recorte — é o número
  // que faz o alerta valer alguma coisa: "67% da receita" explica sozinho.
  const participacao = (s: number[], quais: number[], universo: number[]) => {
    const total = universo.reduce((a, i) => a + Math.abs(s[i]), 0)
    return total ? (quais.reduce((a, i) => a + Math.abs(s[i]), 0) / total) * 100 : 0
  }

  const avisos = [
    ...(atipicos.length
      ? [{ ano, meses: atipicos, pct: participacao(referenciaAtipico, atipicos, indicesSel) }] : []),
    // O outlier do ano anterior contamina igual: é ele que vira a régua.
    ...(atipicosAnt.length && referenciaAnt
      ? [{ ano: ano - 1, meses: atipicosAnt, pct: participacao(referenciaAnt, atipicosAnt, baseIdx) }] : []),
  ]
  const mesesDoAviso = [...new Set(avisos.flatMap(a => a.meses))].sort((a, b) => a - b)

  // Independe do botão "vs ano anterior": desligar a comparação é escolher uma
  // leitura, não motivo para deixar de avisar que o dado está incompleto.
  const tributos = integridadeTributaria(serie, serie.anterior, indicesSel)

  // Independe da seleção de meses: a RPC olha o exercício inteiro até o último
  // mês fechado, que é a janela em que "parou de ser lançado" faz sentido.
  const paradas = serie.despesasParadas ?? []
  const totalParado = paradas.reduce((a, d) => a + d.faltando, 0)
  const unidadesComParada = new Set(paradas.map(d => d.unidade)).size

  const yoy = ehMargem ? null : variacaoAnual(serie[daVisao.chave], base, daVisao.chave, indicesSel)
  const yoyMargem = ehMargem ? variacaoMargem(serie, base, indicesSel) : null

  return (
    <div className={`bg-white rounded-xl p-4 border ${
      destaque ? 'border-blue-300 shadow-sm' : 'border-slate-200'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h2 className={`font-bold ${destaque ? 'text-blue-900 text-lg' : 'text-slate-800'}`}>
            {serie.unidade}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {ehMargem ? (
              <>Margem do período {referencia === null ? '—' : pct(referencia)}</>
            ) : (
              <>Média {brl(referencia ?? 0)} · Acumulado {brl((totalPeriodo as number) ?? 0)}</>
            )}
            <span className="text-slate-400">
              {' '}({selecionados.size} {selecionados.size === 1 ? 'mês' : 'meses'} na conta)
            </span>
          </p>
        </div>
        {selecionados.size > 0 && (
          <div className="flex items-start gap-5">
            {yoy && (
              <div className="text-right"
                   title={`${daVisao.rotulo}: ${brl(yoy.somaAtual)} em ${ano} contra ${brl(yoy.somaAnt)} nos mesmos ${yoy.meses} meses de ${ano - 1}`}>
                <p className={`text-sm font-bold tabular-nums ${
                  ehBom(yoy.pct) ? 'text-emerald-700' : 'text-red-700'}`}>
                  {yoy.pct >= 0 ? '▲' : '▼'} {Math.abs(yoy.pct).toFixed(0)}%
                </p>
                <p className="text-[10px] text-slate-400">
                  vs {ano - 1}{yoy.parcial ? ` · ${yoy.meses} ${yoy.meses === 1 ? 'mês' : 'meses'} com base` : ''}
                </p>
              </div>
            )}
            {yoyMargem && (
              <div className="text-right"
                   title={`Margem de ${pct(yoyMargem.atual)} em ${ano} contra ${pct(yoyMargem.ant)} nos mesmos ${yoyMargem.meses} meses de ${ano - 1}`}>
                <p className={`text-sm font-bold tabular-nums ${
                  yoyMargem.delta >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                  {yoyMargem.delta >= 0 ? '▲' : '▼'} {pp(yoyMargem.delta)}
                </p>
                <p className="text-[10px] text-slate-400">
                  vs {ano - 1}{yoyMargem.parcial ? ` · ${yoyMargem.meses} ${yoyMargem.meses === 1 ? 'mês' : 'meses'} com base` : ''}
                </p>
              </div>
            )}
            {variacao !== null && (
              <div className="text-right">
                <p className={`text-sm font-bold tabular-nums ${
                  ehBom(variacao) ? 'text-emerald-700' : 'text-red-700'}`}>
                  {variacao >= 0 ? '▲' : '▼'} {ehMargem ? pp(variacao) : `${Math.abs(variacao).toFixed(0)}%`}
                </p>
                <p className="text-[10px] text-slate-400">
                  último mês vs {ehMargem ? 'o período' : 'média'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {(tributos || paradas.length > 0) && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 space-y-1.5">
          {tributos && (
            <p className="text-[11px] text-red-900">
              <strong>Faltam tributos na base.</strong> As deduções somam{' '}
              <strong>{pct(tributos.cargaAtual)}</strong> da receita nestes {tributos.meses}{' '}
              {tributos.meses === 1 ? 'mês' : 'meses'}, contra <strong>{pct(tributos.cargaAnterior)}</strong>{' '}
              nos mesmos meses de {ano - 1}. São cerca de <strong>{brl(tributos.faltante)}</strong> de
              imposto fora da conta — lucro e margem deste card estão altos demais.
            </p>
          )}
          {paradas.length > 0 && (
            <p className="text-[11px] text-red-900">
              <strong>
                {paradas.length === 1
                  ? 'Uma despesa recorrente parou de ser lançada.'
                  : `${paradas.length} despesas recorrentes pararam de ser lançadas.`}
              </strong>{' '}
              {destaque ? (
                <>Somando as unidades, cerca de <strong>{brl(totalParado)}</strong> de despesa fora
                da conta em {unidadesComParada} {unidadesComParada === 1 ? 'unidade' : 'unidades'} —
                o detalhe está no card de cada uma.</>
              ) : (
                <>
                  {paradas.slice(0, 3).map((d, i) => (
                    <span key={d.categoria}>
                      {i > 0 && '; '}
                      {limparCategoria(d.categoria)} ({d.mesesLancados} de {d.mesesBase} meses,
                      {' '}última em {MESES[d.ultimoMes - 1]})
                    </span>
                  ))}
                  {paradas.length > 3 && ` e mais ${paradas.length - 3}`}.
                  {' '}Cerca de <strong>{brl(totalParado)}</strong> de despesa fora da conta.
                </>
              )}
            </p>
          )}
        </div>
      )}

      {avisos.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg
                        border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-[11px] text-amber-900 flex-1 min-w-[280px]">
            {avisos.map((a, k) => (
              <span key={a.ano}>
                {k > 0 && ' '}
                <strong>{listar(a.meses.map(i => MESES[i]))} de {a.ano}</strong>
                {a.meses.length > 1 ? ' concentram ' : ' concentra '}
                <strong>{Math.round(a.pct)}%</strong> da {rotuloAtipico} do período.
              </span>
            ))}
            {' '}Enquanto {mesesDoAviso.length > 1 ? 'estiverem' : 'estiver'} na conta, média e
            comparação dizem mais sobre {mesesDoAviso.length > 1 ? 'esses meses' : 'esse mês'} do
            que sobre a operação.
          </p>
          <button onClick={() => onExcluirMeses(mesesDoAviso)}
            className="px-2.5 py-1 text-[11px] rounded-lg border border-amber-300 bg-white
                       text-amber-900 hover:border-amber-400 shrink-0"
            title="Desmarca esses meses no seletor acima — vale para todo o painel">
            Tirar da conta
          </button>
        </div>
      )}

      <ResponsiveContainer width="100%" height={destaque ? 300 : 240}>
        <ComposedChart data={dados} margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
          <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="mes" tickFormatter={ehMargem ? eixoPct : eixo}
                 tick={{ fontSize: 10, fill: ehMargem ? VIOLETA : '#94a3b8' }}
                 axisLine={false} tickLine={false} width={52} />
          <YAxis yAxisId="acum" orientation="right" tickFormatter={eixo}
                 tick={{ fontSize: 10, fill: '#0f766e' }} axisLine={false} tickLine={false} width={52} />
          <Tooltip contentStyle={tooltipStyle}
                   formatter={(value, name) => {
                     const n = String(name)
                     // O eixo da direita é sempre lucro em reais, mesmo na
                     // visão de margem.
                     const emPontos = ehMargem && !n.startsWith('Acumulado')
                     return [emPontos ? pct(Number(value)) : brl(Number(value)), n]
                   }} />
          <Legend wrapperStyle={{ fontSize: 11 }} iconSize={9} />
          <ReferenceLine yAxisId="mes" y={0} stroke="#cbd5e1" />
          {referencia !== null && referencia !== 0 && (
            <ReferenceLine yAxisId="mes" y={referencia} stroke="#94a3b8" strokeDasharray="4 3"
              label={{ value: ehMargem ? 'período' : 'média', position: 'left', fontSize: 9, fill: '#64748b' }} />
          )}
          {mesesFechados > 0 && mesesFechados < 12 && (
            <ReferenceLine yAxisId="mes" x={MESES[mesesFechados - 1]} stroke="#0f172a" strokeDasharray="3 3"
              label={{ value: 'hoje', position: 'top', fontSize: 9, fill: '#0f172a' }} />
          )}

          {visao === 'completo' && (
            <>
              <Bar yAxisId="mes" dataKey="Receita" fill={AZUL} radius={[3, 3, 0, 0]}>
                {dados.map((d, i) => (
                  <Cell key={i} fillOpacity={d.fechado ? 1 : 0.3}
                        stroke={d.atipico ? AMBAR : undefined} strokeWidth={d.atipico ? 1.5 : 0} />
                ))}
              </Bar>
              <Line yAxisId="mes" type="monotone" dataKey="Despesa" stroke={VERMELHO} strokeWidth={2} dot={{ r: 2.5 }} />
              <Line yAxisId="mes" type="monotone" dataKey="Lucro" stroke={AMARELO} strokeWidth={2} dot={{ r: 2.5 }} />
            </>
          )}

          {visao !== 'completo' && (
            <Bar yAxisId="mes"
                 dataKey={ehMargem ? 'Margem'
                        : visao === 'lucro' ? 'Lucro'
                        : visao === 'despesa' ? 'Despesa' : 'Receita'}
                 radius={[3, 3, 0, 0]}>
              {dados.map((d, i) => (
                <Cell key={i}
                  // Margem negativa em vermelho: prejuízo não se lê na mesma
                  // cor de lucro.
                  fill={ehMargem ? ((d.Margem ?? 0) < 0 ? VERMELHO : VIOLETA)
                      : visao === 'despesa' ? VERMELHO
                      : visao === 'lucro' ? AMARELO : AZUL}
                  fillOpacity={d.fechado ? 1 : 0.3}
                  stroke={d.atipico ? AMBAR : undefined} strokeWidth={d.atipico ? 1.5 : 0} />
              ))}
            </Bar>
          )}

          {/* O ano anterior na mesma cor da série, desbotado: o olho lê como
              "a mesma coisa, um ano atrás", e não como uma quarta grandeza. */}
          {base && (
            <Line yAxisId="mes" type="monotone" dataKey="anterior"
                  name={`${daVisao.rotulo} ${ano - 1}`}
                  stroke={daVisao.cor} strokeOpacity={0.45} strokeWidth={2}
                  strokeDasharray="4 3" dot={false} connectNulls={false} />
          )}

          <Line yAxisId="acum" type="monotone" dataKey="Acumulado"
                name={`Acumulado (${selecionados.size} ${selecionados.size === 1 ? 'mês' : 'meses'})`}
                stroke={VERDE} strokeWidth={2} strokeDasharray="5 3" dot={false} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>

      <p className="text-[10px] text-slate-400 mt-1">
        {ehMargem
          ? <>Barras em pontos percentuais no eixo da esquerda (lucro sobre receita do mês).{' '}</>
          : <>Barras e linhas cheias no eixo da esquerda (valor do mês).{' '}</>}
        O <strong>acumulado do lucro</strong>, tracejado em verde, soma apenas os meses marcados acima
        e tem eixo próprio à direita — no mesmo eixo ele achataria as barras.
        {base && ' A linha desbotada é o mesmo mês do exercício anterior.'}
      </p>

      <ResumoPeriodo serie={serie} selecionados={selecionados} base={base} ano={ano} />
    </div>
  )
}

/**
 * Fechamento do card: as três séries somadas e em média, até o último mês
 * fechado. É o retrato do que o gráfico mostra mês a mês.
 *
 * Acumulado e média vão em blocos separados, cada um com sua própria escala de
 * barra. Juntos não funcionaria: o acumulado é da ordem de milhões e a média
 * de centenas de milhares, então a barra da média sumiria.
 */
function ResumoPeriodo({ serie, selecionados, base, ano }: {
  serie: SerieUnidade; selecionados: Set<number>; base?: SerieAnterior; ano: number
}) {
  if (selecionados.size === 0) return null

  const idx = [...selecionados].sort((a, b) => a - b)
  const soma = (s: number[]) => s.reduce((a, v, i) => selecionados.has(i) ? a + v : a, 0)
  const media = (s: number[]) => {
    const c = s.filter((v, i) => selecionados.has(i) && v !== 0)
    return c.length ? c.reduce((a, b) => a + b, 0) / c.length : 0
  }

  const linhas = ([
    { rotulo: 'Receita', chave: 'receita', cor: AZUL },
    { rotulo: 'Despesa', chave: 'despesa', cor: VERMELHO },
    { rotulo: 'Lucro',   chave: 'lucro',   cor: AMARELO },
  ] as const).map(l => ({
    ...l,
    acum: soma(serie[l.chave]),
    med: media(serie[l.chave]),
    yoy: variacaoAnual(serie[l.chave], base, l.chave, idx),
  }))

  // Rótulo do período: intervalo quando é contínuo, lista quando tem furo.
  const contiguo = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1)
  const ateMes = contiguo
    ? (idx.length === 1 ? MESES[idx[0]] : `${MESES[idx[0]]}–${MESES[idx[idx.length - 1]]}`)
    : idx.map(i => MESES[i]).join(', ')
  const maiorAcum = Math.max(1, ...linhas.map(l => Math.abs(l.acum)))
  const maiorMed  = Math.max(1, ...linhas.map(l => Math.abs(l.med)))
  const comYoy = linhas.some(l => l.yoy)

  const margemDoPeriodo = margemPeriodo(serie.receita, serie.despesa, idx)
  const margemYoy = variacaoMargem(serie, base, idx)

  const bloco = (
    titulo: string, valor: (l: typeof linhas[number]) => number, maior: number,
    variacao?: (l: typeof linhas[number]) => ReturnType<typeof variacaoAnual>,
  ) => (
    <div className="flex-1 min-w-[260px]">
      <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1.5">{titulo}</p>
      <div className="space-y-1.5">
        {linhas.map(l => {
          const v = valor(l)
          const d = variacao?.(l)
          // Despesa que sobe é notícia ruim; receita e lucro, o contrário.
          const bom = d ? (l.chave === 'despesa' ? d.pct <= 0 : d.pct >= 0) : false
          return (
            <div key={l.rotulo} className="flex items-center gap-2">
              <span className="text-[11px] text-slate-600 w-14 shrink-0">{l.rotulo}</span>
              <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden min-w-0">
                <div className="h-full rounded-full"
                     style={{
                       width: `${(Math.abs(v) / maior) * 100}%`,
                       backgroundColor: v < 0 ? VERMELHO : l.cor,
                     }} />
              </div>
              <span className={`text-[11px] font-semibold tabular-nums w-24 text-right shrink-0 ${
                v < 0 ? 'text-red-700' : 'text-slate-700'}`}>
                {brl(v)}
              </span>
              {variacao && (
                <span className={`text-[11px] tabular-nums w-16 text-right shrink-0 ${
                  d ? (bom ? 'text-emerald-700' : 'text-red-700') : 'text-slate-300'}`}
                  title={d ? `${brl(d.somaAnt)} nos mesmos ${d.meses} meses de ${ano - 1}` : `sem base em ${ano - 1}`}>
                  {d ? `${d.pct >= 0 ? '+' : '−'}${Math.abs(d.pct).toFixed(0)}%` : '—'}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <div className="mt-3 pt-3 border-t border-slate-100">
      <div className="flex flex-wrap gap-6">
        {bloco(
          comYoy ? `Acumulado · ${ateMes} · vs ${ano - 1}` : `Acumulado · ${ateMes}`,
          l => l.acum, maiorAcum,
          comYoy ? l => l.yoy : undefined,
        )}
        {bloco(`Média mensal · ${ateMes}`, l => l.med, maiorMed)}
      </div>
      {margemDoPeriodo !== null && (
        <p className="text-[11px] text-slate-500 mt-2.5">
          <span className="uppercase tracking-wide text-[10px] text-slate-400">Margem do período</span>{' '}
          <strong className={margemDoPeriodo < 0 ? 'text-red-700' : 'text-slate-700'}>{pct(margemDoPeriodo)}</strong>
          {margemYoy && (
            <span className="text-slate-400">
              {' '}· {pct(margemYoy.ant)} em {ano - 1}{' '}
              <span className={margemYoy.delta >= 0 ? 'text-emerald-700' : 'text-red-700'}>
                ({margemYoy.delta >= 0 ? '+' : '−'}{pp(margemYoy.delta)})
              </span>
            </span>
          )}
        </p>
      )}
    </div>
  )
}
