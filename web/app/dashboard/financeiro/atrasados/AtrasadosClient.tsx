'use client'

import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type AgingBucket = '1-30' | '31-60' | '61-90' | '90+'

export interface LancamentoAtrasado {
  id: string
  empresa_id: string | null
  empresa_nome: string
  tipo: 'receita' | 'despesa'
  descricao: string
  categoria: string
  valor: number
  data_vencimento: string
  dias_atraso: number
  bucket: AgingBucket
}

export interface ResumoEmpresa {
  nome: string
  total: number
  qtd: number
  maxAtraso: number
}

export interface KpisAtrasados {
  totalReceber: number
  qtdReceber: number
  totalPagar: number
  qtdPagar: number
  dsoReceber: number   // ponderado por valor
  dpoPagar: number
  saldoLiquido: number
  maisAntigoReceber: number
  maisAntigoPagar: number
}

interface Props {
  kpis: KpisAtrasados
  aReceber: LancamentoAtrasado[]
  aPagar:   LancamentoAtrasado[]
  resumoReceber: ResumoEmpresa[]
  resumoPagar:   ResumoEmpresa[]
  empresas: { id: string; nome_curto: string }[]
  empresaSelecionada: string
  ladoInicial: 'receber' | 'pagar'
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

const BUCKETS: AgingBucket[] = ['1-30', '31-60', '61-90', '90+']

const BUCKET_LABEL: Record<AgingBucket, string> = {
  '1-30':  '1 a 30 dias',
  '31-60': '31 a 60 dias',
  '61-90': '61 a 90 dias',
  '90+':   '90+ dias',
}

const BUCKET_COR_BORDA: Record<AgingBucket, string> = {
  '1-30':  'border-amber-700/40',
  '31-60': 'border-orange-700/50',
  '61-90': 'border-red-700/50',
  '90+':   'border-red-900',
}

const BUCKET_COR_FUNDO: Record<AgingBucket, string> = {
  '1-30':  'bg-amber-950/30',
  '31-60': 'bg-orange-950/40',
  '61-90': 'bg-red-950/40',
  '90+':   'bg-red-950/60',
}

const BUCKET_COR_TEXTO: Record<AgingBucket, string> = {
  '1-30':  'text-amber-400',
  '31-60': 'text-orange-400',
  '61-90': 'text-red-400',
  '90+':   'text-red-300',
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function AtrasadosClient({
  kpis, aReceber, aPagar, resumoReceber, resumoPagar, empresas, empresaSelecionada, ladoInicial,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [lado, setLado] = useState<'receber' | 'pagar'>(ladoInicial)
  const [bucketFiltro, setBucketFiltro] = useState<AgingBucket | 'todos'>('todos')
  const [busca, setBusca] = useState('')

  function setEmpresa(empresaId: string) {
    const p = new URLSearchParams(searchParams.toString())
    if (empresaId) p.set('empresa', empresaId)
    else p.delete('empresa')
    router.push(`/dashboard/financeiro/atrasados?${p.toString()}`)
  }

  const itensAtuais = lado === 'receber' ? aReceber : aPagar
  const resumoAtual = lado === 'receber' ? resumoReceber : resumoPagar

  // Filtrar e ordenar
  const filtrados = useMemo(() => {
    let arr = itensAtuais
    if (bucketFiltro !== 'todos') arr = arr.filter(l => l.bucket === bucketFiltro)
    if (busca.trim()) {
      const q = busca.toLowerCase()
      arr = arr.filter(l =>
        l.descricao.toLowerCase().includes(q) ||
        l.categoria.toLowerCase().includes(q) ||
        l.empresa_nome.toLowerCase().includes(q)
      )
    }
    return arr.sort((a, b) => b.dias_atraso - a.dias_atraso)
  }, [itensAtuais, bucketFiltro, busca])

  const totalFiltrado = filtrados.reduce((s, l) => s + l.valor, 0)

  // Aging para o lado atual
  const aging: Record<AgingBucket, { valor: number; qtd: number }> = {
    '1-30':  { valor: 0, qtd: 0 },
    '31-60': { valor: 0, qtd: 0 },
    '61-90': { valor: 0, qtd: 0 },
    '90+':   { valor: 0, qtd: 0 },
  }
  for (const l of itensAtuais) {
    aging[l.bucket].valor += l.valor
    aging[l.bucket].qtd   += 1
  }
  const totalLado = lado === 'receber' ? kpis.totalReceber : kpis.totalPagar
  const dsoLado   = lado === 'receber' ? kpis.dsoReceber   : kpis.dpoPagar
  const corLado   = lado === 'receber' ? 'amber'           : 'red'

  return (
    <>

      {/* KPIs principais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-amber-950/30 border border-amber-900/50 rounded-xl p-4">
          <h3 className="text-[10px] text-amber-300 uppercase tracking-wider font-semibold">A Receber Atrasado</h3>
          <p className="text-2xl text-amber-400 font-bold tabular-nums mt-2">{fmt(kpis.totalReceber)}</p>
          <p className="text-[10px] text-slate-500 mt-1">{kpis.qtdReceber} títulos · mais antigo {kpis.maisAntigoReceber}d</p>
        </div>
        <div className="bg-red-950/30 border border-red-900/50 rounded-xl p-4">
          <h3 className="text-[10px] text-red-300 uppercase tracking-wider font-semibold">A Pagar Atrasado</h3>
          <p className="text-2xl text-red-400 font-bold tabular-nums mt-2">{fmt(kpis.totalPagar)}</p>
          <p className="text-[10px] text-slate-500 mt-1">{kpis.qtdPagar} títulos · mais antigo {kpis.maisAntigoPagar}d</p>
        </div>
        <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
          <h3 className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">DSO / DPO Médio</h3>
          <p className="text-lg text-slate-100 font-bold tabular-nums mt-2">
            <span className="text-amber-400">{kpis.dsoReceber.toFixed(0)}d</span>
            <span className="text-slate-600 mx-2">/</span>
            <span className="text-red-400">{kpis.dpoPagar.toFixed(0)}d</span>
          </p>
          <p className="text-[10px] text-slate-500 mt-1">A receber / A pagar (ponderado)</p>
        </div>
        <div className={`bg-slate-900 rounded-xl p-4 border ${kpis.saldoLiquido >= 0 ? 'border-emerald-800/40' : 'border-red-800/40'}`}>
          <h3 className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Saldo Líquido</h3>
          <p className={`text-2xl font-bold tabular-nums mt-2 ${kpis.saldoLiquido >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(kpis.saldoLiquido)}</p>
          <p className="text-[10px] text-slate-500 mt-1">Receber − Pagar</p>
        </div>
      </div>

      {/* Filtro de empresa */}
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <label className="text-xs text-slate-400">Empresa:</label>
        <select
          value={empresaSelecionada}
          onChange={e => setEmpresa(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200"
        >
          <option value="">Todas (consolidado)</option>
          {empresas.map(e => <option key={e.id} value={e.id}>{e.nome_curto}</option>)}
        </select>
      </div>

      {/* Toggle A Receber / A Pagar */}
      <div className="inline-flex items-center bg-slate-900 rounded-xl border border-slate-800 mb-6 overflow-hidden">
        <button
          onClick={() => { setLado('receber'); setBucketFiltro('todos'); setBusca('') }}
          className={`px-5 py-2.5 text-xs font-medium transition-colors ${
            lado === 'receber'
              ? 'bg-amber-900/60 text-amber-100'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          📥 A Receber ({kpis.qtdReceber})
        </button>
        <button
          onClick={() => { setLado('pagar'); setBucketFiltro('todos'); setBusca('') }}
          className={`px-5 py-2.5 text-xs font-medium transition-colors ${
            lado === 'pagar'
              ? 'bg-red-900/60 text-red-100'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          📤 A Pagar ({kpis.qtdPagar})
        </button>
      </div>

      {/* Aging buckets */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {BUCKETS.map(b => {
          const v = aging[b]
          const pct = totalLado > 0 ? (v.valor / totalLado) * 100 : 0
          const ativo = bucketFiltro === b
          return (
            <button
              key={b}
              onClick={() => setBucketFiltro(ativo ? 'todos' : b)}
              className={`text-left ${BUCKET_COR_FUNDO[b]} border-2 ${ativo ? BUCKET_COR_BORDA[b].replace('/40', '').replace('/50', '') : BUCKET_COR_BORDA[b]} rounded-xl p-4 transition-all hover:scale-[1.01]`}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[10px] uppercase tracking-wider font-semibold text-slate-300">{BUCKET_LABEL[b]}</h3>
                <span className={`text-[10px] ${BUCKET_COR_TEXTO[b]} font-medium`}>{pct.toFixed(0)}%</span>
              </div>
              <p className={`text-xl font-bold tabular-nums ${BUCKET_COR_TEXTO[b]}`}>{fmt(v.valor)}</p>
              <p className="text-[10px] text-slate-500 mt-1">{v.qtd} {v.qtd === 1 ? 'título' : 'títulos'}</p>
              {ativo && <p className="text-[9px] text-slate-400 mt-2 uppercase">✓ filtrado</p>}
            </button>
          )
        })}
      </div>

      {/* Grid: Resumo por empresa + Insight Pareto */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-6">

        {/* Resumo por empresa (2 cols) */}
        <div className="lg:col-span-2 bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Por Empresa</h3>
            <span className="text-[10px] text-slate-500">{resumoAtual.length} empresas com atrasos</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-950/50">
                <tr>
                  <th className="text-left  px-4 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Empresa</th>
                  <th className="text-right px-2 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Valor</th>
                  <th className="text-right px-2 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Qtd</th>
                  <th className="text-right px-4 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Atraso Máx</th>
                </tr>
              </thead>
              <tbody>
                {resumoAtual.slice(0, 10).map((e, i) => (
                  <tr key={i} className="border-t border-slate-800/60 hover:bg-slate-800/30">
                    <td className="px-4 py-2 text-slate-200">{e.nome}</td>
                    <td className={`px-2 py-2 text-right font-medium tabular-nums ${corLado === 'amber' ? 'text-amber-400' : 'text-red-400'}`}>{fmt(e.total)}</td>
                    <td className="px-2 py-2 text-right text-slate-500 tabular-nums">{e.qtd}</td>
                    <td className={`px-4 py-2 text-right font-medium tabular-nums ${e.maxAtraso > 90 ? 'text-red-400' : e.maxAtraso > 60 ? 'text-orange-400' : 'text-amber-400'}`}>{e.maxAtraso}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Insight Pareto + Top 5 */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
          <h3 className="text-sm font-semibold text-white mb-2">Pareto — Concentração</h3>
          {(() => {
            const ordenados = [...itensAtuais].sort((a, b) => b.valor - a.valor)
            const top10qtd  = Math.min(10, ordenados.length)
            const top10vlr  = ordenados.slice(0, top10qtd).reduce((s, l) => s + l.valor, 0)
            const top10pct  = totalLado > 0 ? (top10vlr / totalLado) * 100 : 0
            return (
              <>
                <p className="text-[11px] text-slate-400 mb-3">
                  Top {top10qtd} representam <span className={`font-bold ${corLado === 'amber' ? 'text-amber-400' : 'text-red-400'}`}>{top10pct.toFixed(0)}%</span> do total.
                </p>
                <div className="space-y-2">
                  {ordenados.slice(0, 5).map((l) => {
                    const pct = totalLado > 0 ? (l.valor / totalLado) * 100 : 0
                    return (
                      <div key={l.id} className="text-[10px]">
                        <div className="flex items-center justify-between mb-1 gap-2">
                          <span className="text-slate-300 truncate flex-1">{l.descricao}</span>
                          <span className={`tabular-nums font-medium ${corLado === 'amber' ? 'text-amber-400' : 'text-red-400'}`}>{fmt(l.valor)}</span>
                        </div>
                        <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full transition-all"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: corLado === 'amber' ? '#f59e0b' : '#ef4444',
                            }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )
          })()}
        </div>

      </div>

      {/* Busca */}
      <div className="mb-3 flex items-center gap-2 flex-wrap">
        <input
          type="text"
          placeholder="Buscar por descrição, categoria ou empresa…"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          className="flex-1 min-w-[280px] bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600"
        />
        {(bucketFiltro !== 'todos' || busca) && (
          <button
            onClick={() => { setBucketFiltro('todos'); setBusca('') }}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs text-slate-300"
          >
            Limpar filtros
          </button>
        )}
        <span className="text-[10px] text-slate-500">
          {filtrados.length} de {itensAtuais.length} · {fmt(totalFiltrado)}
        </span>
      </div>

      {/* Lista detalhada */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        <div className="overflow-x-auto max-h-[600px]">
          <table className="w-full text-xs">
            <thead className="bg-slate-950/80 sticky top-0">
              <tr>
                <th className="text-left  px-4 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Vencimento</th>
                <th className="text-right px-2 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Dias</th>
                <th className="text-left  px-2 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Empresa</th>
                <th className="text-left  px-2 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Descrição</th>
                <th className="text-left  px-2 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Categoria</th>
                <th className="text-center px-2 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Aging</th>
                <th className="text-right px-4 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Valor</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map(l => (
                <tr key={l.id} className="border-t border-slate-800/60 hover:bg-slate-800/30">
                  <td className="px-4 py-2 text-slate-400 tabular-nums">
                    {new Date(l.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}
                  </td>
                  <td className={`px-2 py-2 text-right tabular-nums font-medium ${BUCKET_COR_TEXTO[l.bucket]}`}>
                    {l.dias_atraso}d
                  </td>
                  <td className="px-2 py-2 text-slate-500 truncate max-w-[120px]">{l.empresa_nome}</td>
                  <td className="px-2 py-2 text-slate-200 truncate max-w-[280px]">{l.descricao}</td>
                  <td className="px-2 py-2 text-slate-600 truncate max-w-[200px]">{l.categoria}</td>
                  <td className="px-2 py-2 text-center">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${BUCKET_COR_FUNDO[l.bucket]} ${BUCKET_COR_TEXTO[l.bucket]} font-medium uppercase`}>
                      {l.bucket}
                    </span>
                  </td>
                  <td className={`px-4 py-2 text-right tabular-nums font-medium ${l.tipo === 'receita' ? 'text-amber-400' : 'text-red-400'}`}>
                    {fmt(l.valor)}
                  </td>
                </tr>
              ))}
              {filtrados.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-600 text-xs">Nenhum lançamento encontrado com esses filtros</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </>
  )
}
