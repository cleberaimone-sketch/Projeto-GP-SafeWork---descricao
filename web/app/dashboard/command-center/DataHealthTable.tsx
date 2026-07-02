// Tabela de saúde dos dados.
import type { VerificacaoSaude } from '@/lib/command-center/types'
import SignalBadge from './SignalBadge'

export default function DataHealthTable({ verificacoes }: { verificacoes: VerificacaoSaude[] }) {
  if (!verificacoes.length) {
    return <p className="text-xs text-slate-500">Sem verificações de saúde de dados.</p>
  }
  return (
    <div className="bg-white rounded-xl border border-slate-200">
      <div className="px-5 py-3 border-b border-slate-200">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Saúde dos Dados</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/50 text-left text-[10px] uppercase tracking-wider text-slate-500">
              <th className="px-5 py-2 font-semibold">Métrica</th>
              <th className="px-3 py-2 font-semibold">Valor</th>
              <th className="px-3 py-2 font-semibold">Severidade</th>
              <th className="px-5 py-2 font-semibold">Observação</th>
            </tr>
          </thead>
          <tbody>
            {verificacoes.map((v, i) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="px-5 py-2.5 font-medium text-slate-800">{v.metrica}</td>
                <td className="px-3 py-2.5 text-slate-700 tabular-nums">{v.valor}</td>
                <td className="px-3 py-2.5"><SignalBadge nivel={v.severidade} /></td>
                <td className="px-5 py-2.5 text-slate-500">{v.observacao}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
