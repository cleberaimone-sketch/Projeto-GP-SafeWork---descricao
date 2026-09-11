'use client'

// A planilha de RH e o Conta Azul lado a lado. Ver lib/rh/conferencia.ts.

import type { Conferencia } from '@/lib/rh/conferencia'
import { DIVERGENCIA_ACEITAVEL_PCT } from '@/lib/rh/conferencia'

const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)

export default function ConferenciaFolha({ dados, ano }: { dados: Conferencia; ano: number }) {
  if (dados.meses.length === 0) return null
  const pct = dados.diferencaAcumuladaPct

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
        <h2 className="font-bold text-slate-800">Conferência — planilha do DP × Conta Azul</h2>
        <span className="text-[10px] text-slate-400">
          {ano} · {dados.meses.length} {dados.meses.length === 1 ? 'mês lançado' : 'meses lançados'} na planilha
        </span>
      </div>
      <p className="text-[11px] text-slate-500 mb-3">
        As duas medem a mesma folha: ela roda em outro ERP e entra no Conta Azul como pagamento.
        Precisam fechar no acumulado.
      </p>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Planilha do DP</p>
          <p className="text-xl font-bold text-slate-800 tabular-nums mt-1">{brl(dados.acumuladoPlanilha)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Conta Azul</p>
          <p className="text-xl font-bold text-slate-800 tabular-nums mt-1">{brl(dados.acumuladoContaAzul)}</p>
        </div>
        <div className={`rounded-lg border p-3 ${dados.divergente ? 'border-amber-300 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Diferença</p>
          <p className={`text-xl font-bold tabular-nums mt-1 ${dados.divergente ? 'text-amber-800' : 'text-emerald-800'}`}>
            {pct === null ? '—' : `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">
            {brl(dados.acumuladoContaAzul - dados.acumuladoPlanilha)}
          </p>
        </div>
      </div>

      {dados.divergente ? (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 mb-3">
          Acima de {DIVERGENCIA_ACEITAVEL_PCT}% no acumulado, a diferença deixa de ser calendário e vira
          escopo: alguma categoria entra num lado e não no outro. Vale conferir a classificação em
          <code className="mx-1 text-[10px]">lib/rh/custo-pessoal.ts</code>
          contra o que o DP soma na planilha.
        </p>
      ) : (
        <p className="text-[11px] text-emerald-800 mb-3">
          Dentro da folga esperada. A diferença de cada mês é calendário — a planilha fecha por
          competência, o Conta Azul entra por vencimento.
        </p>
      )}

      <table className="w-full text-xs">
        <thead>
          <tr className="text-slate-500 border-b border-slate-200">
            <th className="text-left font-medium py-1.5">Mês</th>
            <th className="text-right font-medium">Planilha</th>
            <th className="text-right font-medium">Conta Azul</th>
            <th className="text-right font-medium">Diferença</th>
          </tr>
        </thead>
        <tbody>
          {dados.meses.map(m => (
            <tr key={m.mes} className="border-b border-slate-100">
              <td className="py-1.5 text-slate-700">{m.mes}</td>
              <td className="text-right tabular-nums text-slate-600">{brl(m.planilha)}</td>
              <td className="text-right tabular-nums text-slate-600">{brl(m.contaAzul)}</td>
              <td className={`text-right tabular-nums font-medium ${
                Math.abs(m.diferencaPct ?? 0) > 15 ? 'text-amber-700' : 'text-slate-500'}`}>
                {m.diferencaPct === null ? '—'
                  : `${m.diferencaPct >= 0 ? '+' : ''}${m.diferencaPct.toFixed(1)}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
