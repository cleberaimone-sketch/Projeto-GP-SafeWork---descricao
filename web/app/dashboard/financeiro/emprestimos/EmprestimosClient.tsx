'use client'

import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type TipoEmprestimo =
  | 'socios'
  | 'bancos'
  | 'terceiros'
  | 'mutuo_grupo'
  | 'parcelamento'
  | 'juros_parcelamento'
  | 'outros'

export interface EmprestimoLanc {
  id: string
  empresa_id: string | null
  empresa_nome: string
  tipo: 'receita' | 'despesa'
  tipoEmp: TipoEmprestimo
  tipoEmpLabel: string
  descricao: string
  categoria: string
  valor: number
  data_vencimento: string | null
  data_pagamento: string | null
  status: string
}

export interface KpisEmprestimos {
  saldoAberto: number          // principal a pagar pendente/vencido
  qtdAberto: number
  jurosAberto: number          // juros pendentes/vencidos
  aReceber: number             // empréstimos que devem ao grupo
  qtdAReceber: number
  pagoNoMes: number
  pagoNoAno: number
  proximos30: number           // vencimentos próximos 30 dias
  qtdProximos30: number
  totalPagoHistorico: number   // tudo pago de principal
  totalRecebidoHist: number    // tudo recebido (entradas de empréstimo)
  jurosPagosAno: number
}

export interface ResumoPorTipo {
  tipo: TipoEmprestimo
  label: string
  aberto: number
  pago: number
  qtdAberto: number
}

export interface ResumoPorEmpresa {
  nome: string
  aberto: number
  pago: number
  qtdAberto: number
}

export interface MesCronograma {
  mesKey: string
  nomeMes: string
  principal: number
  juros: number
  qtd: number
  total: number
}

export interface MesHistorico {
  mesKey: string
  nomeMes: string
  entradas: number
  saidas: number
  juros: number
  saldoLiquido: number
}

interface Props {
  kpis: KpisEmprestimos
  resumoPorTipo: ResumoPorTipo[]
  resumoPorEmpresa: ResumoPorEmpresa[]
  cronograma: MesCronograma[]
  historico: MesHistorico[]
  lancamentos: EmprestimoLanc[]
  empresas: { id: string; nome_curto: string }[]
  empresaSelecionada: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

const COR_TIPO: Record<TipoEmprestimo, string> = {
  socios:              '#a78bfa',  // violet
  bancos:              '#60a5fa',  // blue
  terceiros:           '#fbbf24',  // amber
  mutuo_grupo:         '#94a3b8',  // slate
  parcelamento:        '#f87171',  // red light
  juros_parcelamento:  '#dc2626',  // red dark
  outros:              '#64748b',  // slate dark
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function EmprestimosClient({
  kpis, resumoPorTipo, resumoPorEmpresa, cronograma, historico, lancamentos, empresas, empresaSelecionada,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [aba, setAba] = useState<'posicao' | 'cronograma' | 'historico' | 'lancamentos'>('posicao')

  function setEmpresa(empresaId: string) {
    const p = new URLSearchParams(searchParams.toString())
    if (empresaId) p.set('empresa', empresaId)
    else p.delete('empresa')
    router.push(`/dashboard/financeiro/emprestimos?${p.toString()}`)
  }

  return (
    <>

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

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card label="Saldo em Aberto"        valor={fmt(kpis.saldoAberto)}    cor="red"     sub={`${kpis.qtdAberto} parcelas pendentes`} />
        <Card label="Próximos 30 dias"       valor={fmt(kpis.proximos30)}     cor="amber"   sub={`${kpis.qtdProximos30} ${kpis.qtdProximos30 === 1 ? 'parcela' : 'parcelas'} vencendo`} />
        <Card label="Pago no Ano"            valor={fmt(kpis.pagoNoAno)}      cor="slate"   sub={`Mês atual: ${fmt(kpis.pagoNoMes)}`} />
        <Card label="Juros no Ano"           valor={fmt(kpis.jurosPagosAno)}  cor="red"     sub={`Em aberto: ${fmt(kpis.jurosAberto)}`} />
      </div>

      {/* Abas */}
      <div className="flex items-center gap-2 mb-4 border-b border-slate-800 overflow-x-auto">
        {[
          { id: 'posicao',     label: '📊 Posição por Tipo'    },
          { id: 'cronograma',  label: '📅 Cronograma 12 meses' },
          { id: 'historico',   label: '📈 Histórico 12 meses'  },
          { id: 'lancamentos', label: '📋 Lançamentos'         },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setAba(t.id as typeof aba)}
            className={`px-4 py-2 text-xs font-medium transition-colors border-b-2 whitespace-nowrap ${
              aba === t.id
                ? 'text-white border-violet-500'
                : 'text-slate-500 border-transparent hover:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {aba === 'posicao'      && <AbaPosicao   tipos={resumoPorTipo} empresas={resumoPorEmpresa} kpis={kpis} />}
      {aba === 'cronograma'   && <AbaCronograma meses={cronograma} />}
      {aba === 'historico'    && <AbaHistorico  meses={historico} />}
      {aba === 'lancamentos'  && <AbaLancamentos lancamentos={lancamentos} />}

    </>
  )
}

// ─── Card ────────────────────────────────────────────────────────────────────

function Card({ label, valor, cor, sub }: {
  label: string; valor: string; cor: 'red' | 'amber' | 'slate' | 'violet'; sub: string
}) {
  const c = { red: 'text-red-400', amber: 'text-amber-400', slate: 'text-slate-200', violet: 'text-violet-400' }[cor]
  return (
    <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
      <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">{label}</h3>
      <p className={`text-xl font-bold tabular-nums ${c}`}>{valor}</p>
      <p className="text-[10px] text-slate-600 mt-1">{sub}</p>
    </div>
  )
}

// ─── Aba Posição ─────────────────────────────────────────────────────────────

function AbaPosicao({
  tipos, empresas, kpis,
}: { tipos: ResumoPorTipo[]; empresas: ResumoPorEmpresa[]; kpis: KpisEmprestimos }) {
  const totalAberto = tipos.reduce((s, t) => s + t.aberto, 0)
  const totalEmpresa = empresas.reduce((s, e) => s + e.aberto, 0)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

      {/* Por Tipo */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        <div className="p-4 border-b border-slate-800">
          <h3 className="text-sm font-semibold text-white">Posição por Tipo</h3>
          <p className="text-[10px] text-slate-500 mt-0.5">Composição da dívida em aberto · {fmt(totalAberto)} total</p>
        </div>
        <div className="p-4 space-y-3">
          {tipos.map(t => {
            const pct = totalAberto > 0 ? (t.aberto / totalAberto) * 100 : 0
            return (
              <div key={t.tipo}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COR_TIPO[t.tipo] }} />
                    <span className="text-xs text-slate-200">{t.label}</span>
                    {t.qtdAberto > 0 && <span className="text-[10px] text-slate-600">({t.qtdAberto})</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-100 tabular-nums">{fmt(t.aberto)}</span>
                    <span className="text-[10px] text-slate-600 w-10 text-right">{pct.toFixed(0)}%</span>
                  </div>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, backgroundColor: COR_TIPO[t.tipo] }}
                  />
                </div>
                {t.pago > 0 && (
                  <p className="text-[10px] text-slate-600 mt-1">Já pago histórico: <span className="text-slate-400 tabular-nums">{fmt(t.pago)}</span></p>
                )}
              </div>
            )
          })}
        </div>

        {/* Totalizações importantes */}
        <div className="border-t border-slate-800 p-4 grid grid-cols-2 gap-3 text-[10px]">
          <div>
            <p className="text-slate-500 uppercase tracking-wider mb-1">Histórico</p>
            <div className="flex justify-between"><span className="text-slate-500">Total recebido:</span><span className="text-emerald-400 tabular-nums">{fmt(kpis.totalRecebidoHist)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Total pago:</span><span className="text-red-400 tabular-nums">{fmt(kpis.totalPagoHistorico)}</span></div>
            <div className="flex justify-between font-bold border-t border-slate-800 mt-1 pt-1">
              <span className="text-slate-400">Saldo histórico:</span>
              <span className={`tabular-nums ${(kpis.totalRecebidoHist - kpis.totalPagoHistorico) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {fmt(kpis.totalRecebidoHist - kpis.totalPagoHistorico)}
              </span>
            </div>
          </div>
          <div>
            <p className="text-slate-500 uppercase tracking-wider mb-1">Em Aberto</p>
            <div className="flex justify-between"><span className="text-slate-500">A pagar:</span><span className="text-red-400 tabular-nums">{fmt(kpis.saldoAberto)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">A receber:</span><span className="text-emerald-400 tabular-nums">{fmt(kpis.aReceber)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Juros:</span><span className="text-red-400/70 tabular-nums">{fmt(kpis.jurosAberto)}</span></div>
          </div>
        </div>
      </div>

      {/* Por Empresa */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        <div className="p-4 border-b border-slate-800">
          <h3 className="text-sm font-semibold text-white">Posição por Empresa</h3>
          <p className="text-[10px] text-slate-500 mt-0.5">Empresas com empréstimos/parcelamentos em aberto</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-950/50">
              <tr>
                <th className="text-left  px-4 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Empresa</th>
                <th className="text-right px-2 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Em Aberto</th>
                <th className="text-right px-2 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Qtd</th>
                <th className="text-right px-4 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Pago Hist.</th>
              </tr>
            </thead>
            <tbody>
              {empresas.map((e, i) => {
                const pct = totalEmpresa > 0 ? (e.aberto / totalEmpresa) * 100 : 0
                return (
                  <tr key={i} className="border-t border-slate-800/60 hover:bg-slate-800/30">
                    <td className="px-4 py-2 text-slate-200">{e.nome}</td>
                    <td className="px-2 py-2 text-right text-red-400 tabular-nums font-medium">
                      {fmt(e.aberto)}<span className="text-[9px] text-slate-600 ml-1">{pct.toFixed(0)}%</span>
                    </td>
                    <td className="px-2 py-2 text-right text-slate-500 tabular-nums">{e.qtdAberto}</td>
                    <td className="px-4 py-2 text-right text-slate-500 tabular-nums">{fmt(e.pago)}</td>
                  </tr>
                )
              })}
              {empresas.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-600">Nenhuma empresa com empréstimos em aberto</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}

// ─── Aba Cronograma ──────────────────────────────────────────────────────────

function AbaCronograma({ meses }: { meses: MesCronograma[] }) {
  const maxTotal = Math.max(1, ...meses.map(m => m.total))
  const totalProximos12 = meses.reduce((s, m) => s + m.total, 0)
  const maiorMes = meses.reduce((max, m) => m.total > max.total ? m : max, meses[0] ?? { nomeMes: '', total: 0 })

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
      <div className="p-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Cronograma — Próximos 12 meses</h3>
          <p className="text-[10px] text-slate-500 mt-0.5">
            Total a pagar: <span className="text-red-400 font-medium">{fmt(totalProximos12)}</span> · Mês mais pesado: <span className="text-amber-400 font-medium">{maiorMes.nomeMes} ({fmt(maiorMes.total)})</span>
          </p>
        </div>
      </div>
      <div className="p-4 space-y-3">
        {meses.map(m => {
          const pct = (m.total / maxTotal) * 100
          return (
            <div key={m.mesKey}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-300 capitalize w-16">{m.nomeMes}</span>
                  {m.qtd > 0 && <span className="text-[10px] text-slate-600">({m.qtd} parc.)</span>}
                </div>
                <div className="flex items-center gap-3 text-xs tabular-nums">
                  {m.juros > 0 && <span className="text-red-400/70" title="Juros">+{fmt(m.juros)} j</span>}
                  <span className="text-red-400 font-medium">{fmt(m.total)}</span>
                </div>
              </div>
              <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden flex">
                <div
                  className="h-full bg-red-500 transition-all"
                  style={{ width: `${(m.principal / maxTotal) * 100}%` }}
                />
                {m.juros > 0 && (
                  <div
                    className="h-full bg-red-700 transition-all"
                    style={{ width: `${(m.juros / maxTotal) * 100}%` }}
                  />
                )}
              </div>
              {m.total > 0 && <div className="text-[9px] text-slate-600 mt-0.5">{pct.toFixed(0)}% do maior mês</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Aba Histórico ───────────────────────────────────────────────────────────

function AbaHistorico({ meses }: { meses: MesHistorico[] }) {
  const max = Math.max(1, ...meses.flatMap(m => [m.entradas, m.saidas + m.juros]))

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
      <div className="p-4 border-b border-slate-800">
        <h3 className="text-sm font-semibold text-white">Histórico 12 meses — Entradas vs Saídas</h3>
        <p className="text-[10px] text-slate-500 mt-0.5">
          <span className="text-emerald-400">Verde</span> = empréstimos recebidos ·
          <span className="text-red-400 ml-1">Vermelho</span> = principal pago ·
          <span className="text-red-300 ml-1">Vinho</span> = juros pagos
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-950/50">
            <tr>
              <th className="text-left  px-4 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Mês</th>
              <th className="text-right px-2 py-2 font-semibold text-emerald-600 uppercase tracking-wider text-[10px]">Entradas</th>
              <th className="text-right px-2 py-2 font-semibold text-red-600 uppercase tracking-wider text-[10px]">Saídas</th>
              <th className="text-right px-2 py-2 font-semibold text-red-700 uppercase tracking-wider text-[10px]">Juros</th>
              <th className="text-right px-4 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Líquido</th>
              <th className="text-left  px-4 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px] w-48">Visual</th>
            </tr>
          </thead>
          <tbody>
            {meses.map(m => {
              const totalSaida = m.saidas + m.juros
              return (
                <tr key={m.mesKey} className="border-t border-slate-800/60 hover:bg-slate-800/30">
                  <td className="px-4 py-2 text-slate-300 capitalize">{m.nomeMes}</td>
                  <td className="px-2 py-2 text-right text-emerald-400 tabular-nums">{m.entradas > 0 ? fmt(m.entradas) : '—'}</td>
                  <td className="px-2 py-2 text-right text-red-400 tabular-nums">{m.saidas > 0 ? fmt(m.saidas) : '—'}</td>
                  <td className="px-2 py-2 text-right text-red-300 tabular-nums">{m.juros > 0 ? fmt(m.juros) : '—'}</td>
                  <td className={`px-4 py-2 text-right tabular-nums font-medium ${m.saldoLiquido >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(m.saldoLiquido)}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1 h-3">
                      <div className="flex-1 flex justify-end">
                        {m.entradas > 0 && (
                          <div className="h-full bg-emerald-500" style={{ width: `${(m.entradas / max) * 100}%` }} />
                        )}
                      </div>
                      <div className="w-px h-full bg-slate-700"></div>
                      <div className="flex-1 flex">
                        {m.saidas > 0 && (
                          <div className="h-full bg-red-500" style={{ width: `${(m.saidas / max) * 100}%` }} />
                        )}
                        {m.juros > 0 && (
                          <div className="h-full bg-red-700" style={{ width: `${(m.juros / max) * 100}%` }} />
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Aba Lançamentos ─────────────────────────────────────────────────────────

function AbaLancamentos({ lancamentos }: { lancamentos: EmprestimoLanc[] }) {
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'aberto' | 'pago'>('aberto')

  const filtrados = useMemo(() => {
    let arr = lancamentos
    if (filtroStatus === 'aberto') arr = arr.filter(l => l.status === 'pendente' || l.status === 'vencido')
    else if (filtroStatus === 'pago') arr = arr.filter(l => l.status === 'pago' || l.status === 'parcial')

    if (busca.trim()) {
      const q = busca.toLowerCase()
      arr = arr.filter(l =>
        l.descricao.toLowerCase().includes(q) ||
        l.categoria.toLowerCase().includes(q) ||
        l.empresa_nome.toLowerCase().includes(q) ||
        l.tipoEmpLabel.toLowerCase().includes(q)
      )
    }
    return arr.sort((a, b) => (b.data_vencimento ?? '').localeCompare(a.data_vencimento ?? ''))
  }, [lancamentos, filtroStatus, busca])

  const totalFiltrado = filtrados.reduce((s, l) => s + l.valor, 0)

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
      <div className="p-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          {(['aberto', 'pago', 'todos'] as const).map(s => (
            <button
              key={s}
              onClick={() => setFiltroStatus(s)}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                filtroStatus === s ? 'bg-slate-700 text-white' : 'bg-slate-950 text-slate-500 hover:text-slate-300'
              }`}
            >
              {s === 'todos' ? 'Todos' : s === 'aberto' ? 'Em Aberto' : 'Pagos'}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Buscar…"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          className="flex-1 min-w-[200px] bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600"
        />
        <span className="text-[10px] text-slate-500">{filtrados.length} · {fmt(totalFiltrado)}</span>
      </div>

      <div className="overflow-x-auto max-h-[600px]">
        <table className="w-full text-xs">
          <thead className="bg-slate-950/80 sticky top-0">
            <tr>
              <th className="text-left  px-4 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Vencimento</th>
              <th className="text-left  px-2 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Tipo</th>
              <th className="text-left  px-2 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Empresa</th>
              <th className="text-left  px-2 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Descrição</th>
              <th className="text-left  px-2 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Status</th>
              <th className="text-right px-4 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Valor</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map(l => (
              <tr key={l.id} className="border-t border-slate-800/60 hover:bg-slate-800/30">
                <td className="px-4 py-2 text-slate-400 tabular-nums">
                  {l.data_vencimento ? new Date(l.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
                </td>
                <td className="px-2 py-2">
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: COR_TIPO[l.tipoEmp] }} />
                    <span className="text-[10px] text-slate-300">{l.tipoEmpLabel}</span>
                  </span>
                </td>
                <td className="px-2 py-2 text-slate-500 truncate max-w-[100px]">{l.empresa_nome}</td>
                <td className="px-2 py-2 text-slate-200 truncate max-w-[260px]">{l.descricao}</td>
                <td className="px-2 py-2">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-medium ${
                    l.status === 'pago'     ? 'bg-emerald-950/60 text-emerald-400' :
                    l.status === 'parcial'  ? 'bg-amber-950/60 text-amber-400'     :
                    l.status === 'vencido'  ? 'bg-red-950/60 text-red-400'         :
                                              'bg-slate-800 text-slate-400'
                  }`}>{l.status}</span>
                </td>
                <td className={`px-4 py-2 text-right tabular-nums font-medium ${l.tipo === 'receita' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {l.tipo === 'receita' ? '+' : '-'}{fmt(l.valor)}
                </td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-600">Nenhum lançamento encontrado</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
