'use client'

import { useMemo, useState } from 'react'
import {
  Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts'

export interface PontoCurva {
  dia: string
  entradas: number
  saidas: number
  saldo: number
}

export interface Curva {
  saldoInicial: number
  atrasadoPagar: number
  atrasadoReceber: number
  incluiAtrasados: boolean
  saldoMinimo: number
  diaSaldoMinimo: string | null
  saldoFinal: number
  diasHistorico?: number
  totalEntradas: number
  totalSaidas: number
  pontos: PontoCurva[]
}

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const brlExato = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const dataCurta = (iso: string) => {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

const VERDE = '#059669'
const VERMELHO = '#DC2626'
const AZUL = '#1D4ED8'

// 0 = tudo que o servidor mandou (até 31/12). O rótulo vira "ano".
const HORIZONTES = [30, 60, 90, 180, 0] as const

function Kpi({ rotulo, valor, detalhe, cor }: {
  rotulo: string; valor: string; detalhe?: string; cor?: string
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <p className="text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">{rotulo}</p>
      <p className="text-xl font-bold tabular-nums" style={{ color: cor ?? '#0F172A' }}>{valor}</p>
      {detalhe && <p className="text-[11px] text-slate-500 mt-1">{detalhe}</p>}
    </div>
  )
}

/**
 * Curva de saldo projetado.
 *
 * Recebe as duas versões prontas do servidor (com e sem os títulos atrasados)
 * para o botão alternar na hora, sem ida ao banco. O horizonte corta a série
 * que já veio — 90 dias é o máximo pedido ao banco.
 */
type Cenario = 'realista' | 'imediato' | 'otimista'

export default function CurvaSaldo({
  semAtrasados, comAtrasados, realista, taxaInadimplencia, despesaNaoLancada, empresaNome,
}: {
  semAtrasados: Curva
  comAtrasados: Curva
  realista: Curva
  taxaInadimplencia: number
  despesaNaoLancada: {
    mes: number; lancado: number; esperado: number
    faltando: number; categorias_sem: number
  }[]
  empresaNome?: string
}) {
  // Abre no cenário realista: é o único que não depende de uma hipótese que
  // ninguém vive — nem ignorar R$ 2,8 mi de dívida, nem pagá-los amanhã.
  const [cenario, setCenario] = useState<Cenario>('realista')
  const incluirAtrasados = cenario !== 'otimista'
  const [dias, setDias] = useState<number>(90)

  const base = cenario === 'realista' ? realista
             : cenario === 'imediato' ? comAtrasados
             : semAtrasados

  const pontos = useMemo(
    () => (dias === 0 ? base.pontos : base.pontos.slice(0, dias + 1)),
    [base, dias])

  // Recalcula os extremos para o horizonte escolhido — o resumo que veio do
  // banco é sempre dos 90 dias e mentiria ao olhar 30.
  const resumo = useMemo(() => {
    if (!pontos.length) return { minimo: 0, diaMinimo: '', final: 0, entradas: 0, saidas: 0 }
    let minimo = pontos[0].saldo, diaMinimo = pontos[0].dia
    let entradas = 0, saidas = 0
    for (const p of pontos) {
      if (p.saldo < minimo) { minimo = p.saldo; diaMinimo = p.dia }
      entradas += p.entradas
      saidas += p.saidas
    }
    return { minimo, diaMinimo, final: pontos[pontos.length - 1].saldo, entradas, saidas }
  }, [pontos])

  const viraPositivo = pontos.find(p => p.saldo >= 0)
  const temNegativo = resumo.minimo < 0

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
      <AvisoNaoLancado meses={despesaNaoLancada} />

      <ComparativoCenarios
        semAtrasados={semAtrasados}
        comAtrasados={comAtrasados}
        realista={realista}
        cenario={cenario}
      />

      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            Posição de caixa projetada
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Parte do saldo de hoje{empresaNome ? ` de ${empresaNome}` : ' das contas ativas'} e
            projeta pelos vencimentos em aberto — <strong>todos</strong>, inclusive empréstimos,
            parcelamentos e investimento. Reflete as marcações do Caixa do Dia.
            <span className="block mt-1 text-slate-600">
              {cenario === 'realista' && (
                <>Cenário <strong>realista</strong>: o que já venceu é pago em 12 parcelas mensais e{' '}
                <strong>{taxaInadimplencia}%</strong> do que há a receber não entra — a inadimplência
                medida nos últimos 12 meses. As duas coisas são premissas, não fatos.</>
              )}
              {cenario === 'imediato' && (
                <>Cenário <strong>tudo hoje</strong>: todo o vencido sai no primeiro dia. O saldo final
                está certo, mas o caminho não — ninguém paga R$ 2,8 mi de uma vez.</>
              )}
              {cenario === 'otimista' && (
                <>Cenário <strong>só o futuro</strong>: ignora tudo que já venceu e assume recebimento
                integral. Serve para ver se a operação daqui pra frente se paga, não para prever caixa.</>
              )}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-slate-300 overflow-hidden">
            {HORIZONTES.map(h => (
              <button key={h} onClick={() => setDias(h)}
                      title={h === 0 ? 'Até 31 de dezembro' : `Próximos ${h} dias`}
                      className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                        dias === h ? 'bg-blue-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                      }`}>
                {h === 0 ? 'ano' : `${h}d`}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg border border-slate-300 overflow-hidden">
            {([
              ['realista', 'Realista', `Vencido pago em 12x e ${taxaInadimplencia}% de inadimplência descontada`],
              ['imediato', 'Tudo hoje', 'Todo o vencido cai no dia de hoje'],
              ['otimista', 'Só o futuro', 'Ignora o que já venceu — apenas os vencimentos à frente'],
            ] as const).map(([k, rotulo, dica]) => (
              <button key={k} onClick={() => setCenario(k)} title={dica}
                      className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                        cenario === k ? 'bg-blue-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                      }`}>
                {rotulo}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Kpi rotulo="Saldo hoje" valor={brl(base.saldoInicial)}
             cor={base.saldoInicial >= 0 ? VERDE : VERMELHO}
             detalhe="contas ativas" />
        <Kpi rotulo="Pior momento" valor={brl(resumo.minimo)}
             cor={resumo.minimo >= 0 ? VERDE : VERMELHO}
             detalhe={resumo.diaMinimo ? `em ${dataCurta(resumo.diaMinimo)}` : undefined} />
        <Kpi rotulo={`Saldo em ${dias} dias`} valor={brl(resumo.final)}
             cor={resumo.final >= 0 ? VERDE : VERMELHO}
             detalhe={`${brl(resumo.entradas)} entra · ${brl(resumo.saidas)} sai`} />
        <Kpi rotulo="Atrasado a pagar" valor={brl(base.atrasadoPagar)} cor={VERMELHO}
             detalhe={`${brl(base.atrasadoReceber)} a receber vencido`} />
      </div>

      <div className="h-72 -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={pontos}>
            <defs>
              <linearGradient id="gradPos" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={VERDE} stopOpacity={0.25} />
                <stop offset="100%" stopColor={VERDE} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
            <XAxis dataKey="dia" tickFormatter={dataCurta} stroke="#94A3B8"
                   fontSize={11} tickLine={false} axisLine={false} minTickGap={28} />
            <YAxis tickFormatter={v => brl(v)} stroke="#94A3B8" fontSize={11}
                   tickLine={false} axisLine={false} width={84} />
            <ReferenceLine y={0} stroke="#94A3B8" strokeWidth={1.5} />
            <Tooltip
              cursor={{ stroke: '#94A3B8', strokeDasharray: '3 3' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const p = payload[0].payload as PontoCurva
                const [a, m, d] = p.dia.split('-')
                return (
                  <div className="bg-white border border-slate-300 rounded-lg px-3 py-2 shadow-lg">
                    <p className="text-xs text-slate-500 mb-1">{`${d}/${m}/${a}`}</p>
                    <p className="text-sm font-bold tabular-nums"
                       style={{ color: p.saldo >= 0 ? VERDE : VERMELHO }}>
                      Saldo: {brlExato(p.saldo)}
                    </p>
                    {p.entradas > 0 && (
                      <p className="text-xs tabular-nums" style={{ color: VERDE }}>
                        + {brlExato(p.entradas)} entra
                      </p>
                    )}
                    {p.saidas > 0 && (
                      <p className="text-xs tabular-nums" style={{ color: VERMELHO }}>
                        − {brlExato(p.saidas)} sai
                      </p>
                    )}
                  </div>
                )
              }}
            />
            <Area type="monotone" dataKey="saldo" stroke={AZUL} strokeWidth={2.5}
                  fill="url(#gradPos)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 pt-4 border-t border-slate-200 text-xs text-slate-600 space-y-1.5">
        {temNegativo && viraPositivo && (
          <p>
            O caixa fica negativo até <strong>{dataCurta(viraPositivo.dia)}</strong>, quando
            passa a positivo — se as entradas previstas se confirmarem.
          </p>
        )}
        {temNegativo && !viraPositivo && (
          <p className="text-red-700">
            O caixa segue negativo em todo o horizonte de {dias} dias.
            {base.atrasadoReceber > 0 && (
              <> Há {brl(base.atrasadoReceber)} de recebíveis vencidos que, se cobrados,
                 mudam esse quadro.</>
            )}
          </p>
        )}
        {cenario === 'otimista' && base.atrasadoPagar > 0 && (
          <p className="text-amber-700">
            Fora desta curva: {brl(base.atrasadoPagar)} de contas já vencidas. Os outros dois
            cenários as consideram.
          </p>
        )}
        {(base.diasHistorico ?? 0) > 0 && (
          <p className="text-slate-500">
            À esquerda da linha de hoje é saldo que de fato existiu, do fechamento diário; à
            direita, projeção.
          </p>
        )}
        <p className="text-slate-400">
          Saldo negativo aqui é conta deixada de pagar, não cheque especial.
        </p>
      </div>
    </section>
  )
}

/**
 * Os dois desfechos lado a lado. O contraste é o ponto: a diferença entre eles
 * é exatamente a dívida vencida que a projeção pode ou não considerar, e sem
 * isso à vista o cenário otimista passa por previsão.
 */
function ComparativoCenarios({ semAtrasados, comAtrasados, realista, cenario }: {
  semAtrasados: Curva; comAtrasados: Curva; realista: Curva; cenario: string
}) {
  const otimista = semAtrasados.saldoFinal
  const imediato = comAtrasados.saldoFinal
  const real = realista.saldoFinal
  if (Math.abs(otimista - imediato) < 1) return null

  return (
    <div className="mb-5 grid grid-cols-1 md:grid-cols-3 gap-3">
      {([
        ['realista', 'Realista', real,     'vencido em 12x, com inadimplência'],
        ['imediato', 'Tudo hoje', imediato, 'toda a dívida no primeiro dia'],
        ['otimista', 'Só o futuro', otimista, 'ignorando o que já venceu'],
      ] as const).map(([k, rotulo, valor, nota]) => (
        <div key={k} className={`rounded-lg border px-4 py-3 ${
          cenario === k ? (valor < 0 ? 'border-red-300 bg-red-50' : 'border-emerald-300 bg-emerald-50')
                        : 'border-slate-200 bg-slate-50 opacity-60'}`}>
          <p className="text-[10px] uppercase tracking-wide text-slate-500">{rotulo}</p>
          <p className={`text-lg font-bold tabular-nums ${valor < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
            {brl(valor)}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">{nota}</p>
        </div>
      ))}
    </div>
  )
}

/**
 * A projeção só enxerga o que está lançado. Quando as contas dos meses à
 * frente ainda não entraram no Conta Azul, a curva mostra uma folga que não
 * existe — e nada na tela denunciava isso.
 *
 * Compara o que está lançado em cada mês futuro com a média das categorias que
 * se repetem todo mês. Some sozinho quando o lançamento se normalizar.
 */
function AvisoNaoLancado({ meses }: {
  meses: { mes: number; lancado: number; esperado: number; faltando: number; categorias_sem: number }[]
}) {
  const relevantes = meses.filter(m => Number(m.faltando) > 1000)
  if (relevantes.length === 0) return null

  const total = relevantes.reduce((s, m) => s + Number(m.faltando), 0)
  const NOMES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

  return (
    <div className="mb-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
      <div className="flex items-start gap-2">
        <span className="text-amber-700 text-sm leading-none mt-0.5">⚠</span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-amber-900">
            Faltam cerca de {brl(total)} de despesa ainda não lançada
          </p>
          <p className="text-[11px] text-amber-800 mt-1 leading-relaxed">
            A curva só enxerga o que está no Conta Azul. Comparando com as categorias que se
            repetem todo mês, os meses abaixo têm menos contas do que o normal — a projeção está
            otimista nesse valor.
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-amber-900 tabular-nums">
            {relevantes.map(m => (
              <span key={m.mes}>
                <strong>{NOMES[m.mes - 1]}</strong> {brl(Number(m.faltando))}
                <span className="text-amber-700"> ({m.categorias_sem} categorias)</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
