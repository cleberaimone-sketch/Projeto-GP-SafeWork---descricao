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
export default function CurvaSaldo({
  semAtrasados, comAtrasados, empresaNome,
}: {
  semAtrasados: Curva
  comAtrasados: Curva
  empresaNome?: string
}) {
  const [incluirAtrasados, setIncluirAtrasados] = useState(false)
  const [dias, setDias] = useState<number>(90)

  const base = incluirAtrasados ? comAtrasados : semAtrasados

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
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            Posição de caixa projetada
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Parte do saldo de hoje{empresaNome ? ` de ${empresaNome}` : ' das contas ativas'} e
            projeta pelos vencimentos em aberto — <strong>todos</strong>, inclusive empréstimos,
            parcelamentos e investimento. Reflete as marcações do Caixa do Dia.
            <span className="block mt-1 text-amber-700">
              Assume que <strong>tudo a receber será recebido</strong>: não há desconto de
              inadimplência, então a curva é o melhor cenário.
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
          <button
            onClick={() => setIncluirAtrasados(v => !v)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              incluirAtrasados
                ? 'bg-amber-100 border-amber-300 text-amber-900'
                : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
            title="Joga todos os títulos vencidos no dia de hoje"
          >
            {incluirAtrasados ? '✓ ' : ''}Incluir atrasados
          </button>
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
        {!incluirAtrasados && base.atrasadoPagar > 0 && (
          <p className="text-slate-500">
            Fora da curva: {brl(base.atrasadoPagar)} de contas já vencidas. Use
            &ldquo;incluir atrasados&rdquo; para vê-las lançadas no dia de hoje.
          </p>
        )}
        <p className="text-slate-400">
          Saldo negativo aqui é conta deixada de pagar, não cheque especial.
        </p>
      </div>
    </section>
  )
}
