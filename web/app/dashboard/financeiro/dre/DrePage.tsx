'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useState, Fragment } from 'react'

interface Empresa { id: string; nome_curto: string; nome: string }

export interface DreBloco {
  titulo: string
  nivel: 'secao' | 'grupo' | 'subtotal' | 'total' | 'resultado'
  valor: number
  margem?: number
  indent?: number
  destaque?: 'positivo' | 'negativo' | 'neutro' | 'alerta' | 'total'
  separador?: boolean
  categorias?: { nome: string; valor: number }[]
}

interface Kpis {
  receitaBruta: number
  receitaLiquida: number
  lucroBruto: number
  margemBruta: number
  ebitda: number
  margemEbitda: number
  resultadoLiquido: number
  margemLiquida: number
  totalDespesas: number
  totalLancamentos: number
}

interface Props {
  empresas: Empresa[]
  blocos: DreBloco[]
  kpis: Kpis
  periodo: string
  empresaNome: string
  regime: string
  regimeLabel: string
}

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const fmtPct = (v: number) => v.toFixed(1) + '%'

function pctBar(pct: number, max = 100) {
  return Math.min(Math.abs(pct), max)
}

export default function DrePage({ empresas, blocos, kpis, periodo, empresaNome, regime, regimeLabel }: Props) {
  const router   = useRouter()
  const pathname = usePathname()
  const params   = useSearchParams()
  const [expandido, setExpandido] = useState<string | null>(null)

  const empresaId = params.get('empresa') ?? ''
  const ano       = params.get('ano')     ?? new Date().getFullYear().toString()
  const mes       = params.get('mes')     ?? ''

  function navegar(updates: Record<string, string>) {
    const p = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v) p.set(k, v); else p.delete(k)
    }
    router.push(`${pathname}?${p.toString()}`)
  }

  const anos = ['2020','2021','2022','2023','2024','2025','2026']
  const meses = [
    { v: '', l: 'Ano completo' },
    { v: '01', l: 'Jan' }, { v: '02', l: 'Fev' }, { v: '03', l: 'Mar' },
    { v: '04', l: 'Abr' }, { v: '05', l: 'Mai' }, { v: '06', l: 'Jun' },
    { v: '07', l: 'Jul' }, { v: '08', l: 'Ago' }, { v: '09', l: 'Set' },
    { v: '10', l: 'Out' }, { v: '11', l: 'Nov' }, { v: '12', l: 'Dez' },
  ]

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Empresa</label>
            <select value={empresaId} onChange={e => navegar({ empresa: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500">
              <option value="">Consolidado (Holding)</option>
              {empresas.map(e => <option key={e.id} value={e.id}>{e.nome_curto}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Ano</label>
            <select value={ano} onChange={e => navegar({ ano: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500">
              {anos.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Mês</label>
            <div className="flex gap-1 flex-wrap">
              {meses.map(m => (
                <button key={m.v} onClick={() => navegar({ mes: m.v })}
                  className={`text-xs px-2 py-1 rounded border transition-colors ${mes === m.v ? 'bg-amber-700 border-amber-600 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'}`}>
                  {m.l}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col justify-end">
            <p className="text-xs text-amber-400 font-medium">{empresaNome}</p>
            <p className="text-xs text-gray-500">{periodo}</p>
          </div>
        </div>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={() => navegar({ empresa: '' })}
              className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${!empresaId ? 'bg-amber-700 border-amber-600 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'}`}>
              Consolidado
            </button>
            {empresas.map(e => (
              <button key={e.id} onClick={() => navegar({ empresa: e.id })}
                className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${empresaId === e.id ? 'bg-amber-700 border-amber-600 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'}`}>
                {e.nome_curto}
              </button>
            ))}
          </div>
          {/* Toggle caixa / competência */}
          <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-0.5 border border-gray-700">
            <button
              onClick={() => navegar({ regime: 'competencia' })}
              className={`text-xs px-3 py-1 rounded-md transition-colors ${regime === 'competencia' ? 'bg-blue-700 text-white' : 'text-gray-400 hover:text-white'}`}
              title="Considera todos os lançamentos pela data de vencimento, pagos ou não"
            >
              Competência
            </button>
            <button
              onClick={() => navegar({ regime: 'caixa' })}
              className={`text-xs px-3 py-1 rounded-md transition-colors ${regime === 'caixa' ? 'bg-green-700 text-white' : 'text-gray-400 hover:text-white'}`}
              title="Considera apenas lançamentos efetivamente pagos/recebidos, pela data de pagamento"
            >
              Caixa
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards de margem */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <p className="text-xs text-gray-400 mb-1">Receita Líquida</p>
          <p className="text-lg font-bold text-white">{fmt(kpis.receitaLiquida)}</p>
          <p className="text-xs text-gray-500 mt-1">Bruta − Impostos</p>
        </div>
        <div className={`rounded-xl p-4 border ${kpis.margemBruta >= 40 ? 'bg-green-950/30 border-green-900/50' : kpis.margemBruta >= 20 ? 'bg-amber-950/30 border-amber-900/50' : 'bg-red-950/30 border-red-900/50'}`}>
          <p className="text-xs text-gray-400 mb-1">Margem Bruta</p>
          <p className={`text-lg font-bold ${kpis.margemBruta >= 40 ? 'text-green-300' : kpis.margemBruta >= 20 ? 'text-amber-300' : 'text-red-300'}`}>
            {fmtPct(kpis.margemBruta)}
          </p>
          <div className="h-1 bg-gray-800 rounded-full mt-2 overflow-hidden">
            <div className="h-full bg-green-700 rounded-full" style={{ width: `${pctBar(kpis.margemBruta)}%` }} />
          </div>
        </div>
        <div className={`rounded-xl p-4 border ${kpis.margemEbitda >= 20 ? 'bg-green-950/30 border-green-900/50' : kpis.margemEbitda >= 10 ? 'bg-amber-950/30 border-amber-900/50' : 'bg-red-950/30 border-red-900/50'}`}>
          <p className="text-xs text-gray-400 mb-1">Margem EBITDA</p>
          <p className={`text-lg font-bold ${kpis.margemEbitda >= 20 ? 'text-green-300' : kpis.margemEbitda >= 10 ? 'text-amber-300' : 'text-red-300'}`}>
            {fmtPct(kpis.margemEbitda)}
          </p>
          <div className="h-1 bg-gray-800 rounded-full mt-2 overflow-hidden">
            <div className="h-full bg-amber-700 rounded-full" style={{ width: `${pctBar(kpis.margemEbitda)}%` }} />
          </div>
        </div>
        <div className={`rounded-xl p-4 border ${kpis.margemLiquida >= 10 ? 'bg-green-950/30 border-green-900/50' : kpis.margemLiquida >= 0 ? 'bg-amber-950/30 border-amber-900/50' : 'bg-red-950/30 border-red-900/50'}`}>
          <p className="text-xs text-gray-400 mb-1">Margem Líquida</p>
          <p className={`text-lg font-bold ${kpis.margemLiquida >= 10 ? 'text-green-300' : kpis.margemLiquida >= 0 ? 'text-amber-300' : 'text-red-300'}`}>
            {fmtPct(kpis.margemLiquida)}
          </p>
          <div className="h-1 bg-gray-800 rounded-full mt-2 overflow-hidden">
            <div className={`h-full rounded-full ${kpis.margemLiquida >= 0 ? 'bg-blue-700' : 'bg-red-700'}`} style={{ width: `${pctBar(kpis.margemLiquida)}%` }} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* DRE Table */}
        <div className="lg:col-span-2 bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800 flex items-start justify-between">
            <div>
              <h2 className="text-sm font-bold text-white">DRE Gerencial — {empresaNome}</h2>
              <p className="text-xs text-gray-400">{periodo} · clique nos grupos para ver categorias</p>
            </div>
            <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${regime === 'caixa' ? 'bg-green-900/50 text-green-400' : 'bg-blue-900/50 text-blue-400'}`}>
              {regimeLabel}
            </span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-800">
                <th className="text-left px-5 py-2">Descrição</th>
                <th className="text-right px-4 py-2">Valor (R$)</th>
                <th className="text-right px-5 py-2">% Rec. Líq.</th>
              </tr>
            </thead>
            <tbody>
              {blocos.map((b, i) => {
                if (b.separador) return (
                  <tr key={i}><td colSpan={3} className="border-t border-gray-800/60 py-0.5" /></tr>
                )

                const cor = b.destaque === 'positivo' ? 'text-green-400'
                  : b.destaque === 'negativo' ? 'text-red-400'
                  : b.destaque === 'alerta'   ? 'text-orange-400'
                  : b.destaque === 'total'    ? 'text-white font-bold'
                  : 'text-gray-300'

                const bg = b.nivel === 'total'     ? 'bg-gray-800/80'
                  : b.nivel === 'subtotal'  ? 'bg-gray-800/40'
                  : b.nivel === 'resultado' ? 'bg-amber-900/20'
                  : b.nivel === 'secao'     ? 'bg-gray-800/20'
                  : ''

                const hasCats = b.categorias && b.categorias.length > 0
                const isExpanded = expandido === `${i}`

                return (
                  <Fragment key={i}>
                    <tr
                      className={`border-b border-gray-800/30 transition-colors ${bg} ${hasCats ? 'cursor-pointer hover:bg-gray-800/40' : ''}`}
                      onClick={() => hasCats ? setExpandido(isExpanded ? null : `${i}`) : undefined}
                    >
                      <td className="px-5 py-2" style={{ paddingLeft: `${(b.indent ?? 0) * 16 + 20}px` }}>
                        <div className="flex items-center gap-1.5">
                          {hasCats && (
                            <span className="text-gray-600 text-xs">{isExpanded ? '▼' : '▶'}</span>
                          )}
                          <span className={
                            b.nivel === 'total'     ? 'text-white font-bold text-sm'
                            : b.nivel === 'subtotal'  ? 'text-white font-semibold'
                            : b.nivel === 'resultado' ? 'text-amber-200 font-semibold'
                            : b.nivel === 'secao'     ? 'text-gray-200 font-medium'
                            : 'text-gray-400'
                          }>
                            {b.titulo}
                          </span>
                        </div>
                      </td>
                      <td className={`px-4 py-2 text-right font-mono text-sm ${cor}`}>
                        {b.nivel !== 'subtotal' || !b.separador ? fmt(Math.abs(b.valor)) : ''}
                      </td>
                      <td className="px-5 py-2 text-right text-xs text-gray-500">
                        {b.margem !== undefined ? fmtPct(b.margem) : ''}
                      </td>
                    </tr>
                    {isExpanded && b.categorias && b.categorias.map((c, j) => (
                      <tr key={`${i}-cat-${j}`} className="border-b border-gray-800/20 bg-gray-900/80">
                        <td className="py-1.5 text-gray-500 text-xs" style={{ paddingLeft: `${(b.indent ?? 0) * 16 + 44}px` }}>
                          · {c.nome}
                        </td>
                        <td className="px-4 py-1.5 text-right font-mono text-xs text-gray-400">
                          {fmt(c.valor)}
                        </td>
                        <td className="px-5 py-1.5 text-right text-xs text-gray-600">
                          {kpis.receitaLiquida > 0 ? fmtPct((c.valor / kpis.receitaLiquida) * 100) : '—'}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Painel lateral */}
        <div className="space-y-4">
          {/* Resumo executivo */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Resumo Executivo</h3>
            <div className="space-y-2.5">
              {[
                { label: 'Receita Bruta', valor: kpis.receitaBruta, cor: 'text-white' },
                { label: 'Receita Líquida', valor: kpis.receitaLiquida, cor: 'text-gray-300' },
                { label: 'Lucro Bruto', valor: kpis.lucroBruto, cor: kpis.lucroBruto >= 0 ? 'text-green-400' : 'text-red-400', pct: kpis.margemBruta },
                { label: 'EBITDA', valor: kpis.ebitda, cor: kpis.ebitda >= 0 ? 'text-amber-300' : 'text-red-400', pct: kpis.margemEbitda },
                { label: 'Resultado Líquido', valor: kpis.resultadoLiquido, cor: kpis.resultadoLiquido >= 0 ? 'text-green-300' : 'text-red-400', pct: kpis.margemLiquida },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500">{item.label}</p>
                    {item.pct !== undefined && (
                      <p className="text-[10px] text-gray-600">{fmtPct(item.pct)} margem</p>
                    )}
                  </div>
                  <p className={`text-sm font-semibold font-mono ${item.cor}`}>{fmt(item.valor)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Benchmarks SST */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Benchmarks — SST</h3>
            <div className="space-y-2 text-xs">
              {[
                { label: 'Margem Bruta', ref: '50–70%', atual: kpis.margemBruta },
                { label: 'Margem EBITDA', ref: '15–25%', atual: kpis.margemEbitda },
                { label: 'Margem Líquida', ref: '8–18%', atual: kpis.margemLiquida },
              ].map((b, i) => {
                const ok = b.atual >= parseFloat(b.ref.split('–')[0])
                return (
                  <div key={i} className="flex items-center justify-between py-1 border-b border-gray-800 last:border-0">
                    <span className="text-gray-400">{b.label}</span>
                    <div className="text-right">
                      <p className={`font-semibold ${ok ? 'text-green-400' : 'text-red-400'}`}>{fmtPct(b.atual)}</p>
                      <p className="text-gray-600 text-[10px]">ref: {b.ref}</p>
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="text-[10px] text-gray-600 mt-2">Referência: empresas SST Brasil 2024</p>
          </div>

          {/* Aviso D&A */}
          <div className="bg-amber-950/20 rounded-xl border border-amber-900/30 p-3">
            <p className="text-xs text-amber-400 font-medium mb-1">⚠ Sobre o EBITDA</p>
            <p className="text-[11px] text-amber-700">
              D&A (depreciação e amortização) não está disponível no Conta Azul.
              O EBITDA mostrado = Lucro Bruto − Despesas Operacionais, sem deduzir D&A.
              Para D&A real, integrar com controle de ativos fixos.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
