'use client'

import { useMemo, useState } from 'react'
import type { TxConciliada, StatusConc, ResumoConc } from '@/lib/financeiro/conciliacao'

function fmt(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
}
function fmtData(iso: string): string {
  if (!iso) return '—'
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a.slice(2)}`
}

const STATUS_CFG: Record<StatusConc, { label: string; dot: string; text: string; bg: string }> = {
  conciliado:    { label: 'Conciliado',      dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
  transferencia: { label: 'Transferência',   dot: 'bg-blue-500',    text: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200' },
  sem_erp:       { label: 'Fora do ERP',     dot: 'bg-amber-500',   text: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200' },
}

interface Props {
  tabelaPronta: boolean
  transacoes: TxConciliada[]
  resumo: ResumoConc
  contaSelecionada: string
  statusSelecionado: string
}

export default function ConciliacaoClient({ tabelaPronta, transacoes, resumo }: Props) {
  const [filtro, setFiltro] = useState<'sem_erp' | 'transferencia' | 'conciliado' | 'todos'>('sem_erp')
  const [conta, setConta] = useState<string>('')

  const contas = useMemo(
    () => Array.from(new Set(transacoes.map(t => t.conta_nome))).sort(),
    [transacoes],
  )

  const lista = useMemo(() => {
    let arr = transacoes
    if (filtro !== 'todos') arr = arr.filter(t => t.status === filtro)
    if (conta) arr = arr.filter(t => t.conta_nome === conta)
    return arr.sort((a, b) => b.data.localeCompare(a.data))
  }, [transacoes, filtro, conta])

  // ── Estado vazio: migration não aplicada ──────────────────────────────────
  if (!tabelaPronta) {
    return (
      <div className="bg-white rounded-xl border border-amber-200 p-6">
        <h2 className="text-sm font-semibold text-amber-800 mb-2">⚠️ Falta ativar o extrato</h2>
        <p className="text-sm text-slate-600 mb-3">
          A tabela do extrato bancário (<code className="text-xs bg-slate-100 px-1 rounded">pluggy_transactions</code>) ainda não existe.
          Aplique a migration no <strong>SQL Editor</strong> do Supabase:
        </p>
        <p className="text-xs text-slate-500 mb-4">
          <code className="bg-slate-100 px-1 rounded">supabase/migrations/20260713120000_pluggy_transactions.sql</code>
        </p>
        <p className="text-sm text-slate-600">Depois rode o sync do Pluggy (na aba Sync) para puxar o extrato.</p>
      </div>
    )
  }

  // ── Estado vazio: sem transações ainda ────────────────────────────────────
  if (transacoes.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-slate-800 mb-2">Nenhuma transação no período</h2>
        <p className="text-sm text-slate-600">
          Rode o <strong>sync do Pluggy</strong> para puxar o extrato, ou conecte mais contas (Cora, Conta Azul) no widget.
          A conciliação fica muito mais completa com todas as contas conectadas.
        </p>
      </div>
    )
  }

  const chips: { id: typeof filtro; label: string; n: number }[] = [
    { id: 'sem_erp',       label: 'Fora do ERP',    n: resumo.qtdSemErp },
    { id: 'transferencia', label: 'Transferências', n: resumo.qtdTransfer },
    { id: 'conciliado',    label: 'Conciliados',    n: resumo.qtdConciliado },
    { id: 'todos',         label: 'Todos',          n: resumo.total },
  ]

  return (
    <>
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Movimentado</p>
          <p className="text-lg font-bold text-slate-800 tabular-nums mt-1">{fmt(resumo.entradas + resumo.saidas)}</p>
          <p className="text-[10px] text-slate-500 mt-1">
            <span className="text-emerald-700">+{fmt(resumo.entradas)}</span> · <span className="text-red-700">-{fmt(resumo.saidas)}</span>
          </p>
        </div>
        <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4">
          <p className="text-[10px] text-emerald-800 uppercase tracking-wider font-semibold">Conciliado</p>
          <p className="text-lg font-bold text-emerald-700 tabular-nums mt-1">{fmt(resumo.valorConciliado)}</p>
          <p className="text-[10px] text-slate-500 mt-1">{resumo.qtdConciliado} de {resumo.total} movimentos</p>
        </div>
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
          <p className="text-[10px] text-amber-800 uppercase tracking-wider font-semibold">Fora do ERP ⚠️</p>
          <p className="text-lg font-bold text-amber-700 tabular-nums mt-1">{fmt(resumo.valorSemErp)}</p>
          <p className="text-[10px] text-slate-500 mt-1">{resumo.qtdSemErp} movimentos sem registro</p>
        </div>
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
          <p className="text-[10px] text-blue-800 uppercase tracking-wider font-semibold">Transferências</p>
          <p className="text-lg font-bold text-blue-700 tabular-nums mt-1">{fmt(resumo.valorTransfer)}</p>
          <p className="text-[10px] text-slate-500 mt-1">{resumo.qtdTransfer} · pareiam com outra conta</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="inline-flex bg-white border border-slate-200 rounded-lg overflow-hidden">
          {chips.map(c => (
            <button
              key={c.id}
              onClick={() => setFiltro(c.id)}
              className={`px-3 py-1.5 text-xs ${filtro === c.id ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {c.label} <span className="opacity-70">({c.n})</span>
            </button>
          ))}
        </div>
        {contas.length > 1 && (
          <select
            value={conta}
            onChange={e => setConta(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800"
          >
            <option value="">Todas as contas</option>
            {contas.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <span className="text-[10px] text-slate-500">{lista.length} movimentos</span>
      </div>

      {/* Dica contextual do filtro Fora do ERP */}
      {filtro === 'sem_erp' && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
          Movimentos que entraram/saíram no banco mas <strong>não têm lançamento correspondente no Conta Azul</strong>.
          É aqui que aparece o dinheiro que some — transferências que chegaram a menos, tarifas não lançadas, empréstimos fora do ERP.
        </p>
      )}

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50/80">
              <tr>
                <th className="text-left  px-4 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Data</th>
                <th className="text-left  px-4 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Conta</th>
                <th className="text-left  px-4 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Descrição (banco)</th>
                <th className="text-right px-4 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Valor</th>
                <th className="text-left  px-4 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Lançamento no ERP</th>
                <th className="text-right px-4 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Status</th>
              </tr>
            </thead>
            <tbody>
              {lista.map(t => {
                const cfg = STATUS_CFG[t.status]
                return (
                  <tr key={t.id} className="border-t border-slate-200/70 hover:bg-slate-100/30">
                    <td className="px-4 py-2 text-slate-600 tabular-nums whitespace-nowrap">{fmtData(t.data)}</td>
                    <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{t.conta_nome}</td>
                    <td className="px-4 py-2 text-slate-800 max-w-[280px] truncate" title={t.descricao}>{t.descricao || '—'}</td>
                    <td className={`px-4 py-2 text-right font-medium tabular-nums whitespace-nowrap ${t.valor >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                      {t.valor >= 0 ? '+' : ''}{fmt(t.valor)}
                    </td>
                    <td className="px-4 py-2 text-slate-500 max-w-[240px] truncate" title={t.lancamento?.descricao ?? ''}>
                      {t.lancamento ? `${t.lancamento.categoria || t.lancamento.descricao}` : '—'}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] ${cfg.bg} ${cfg.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                        {cfg.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
              {lista.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Nenhum movimento neste filtro</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
