// Card de indicador da Visão Geral.
// Regra: nunca renderiza valor sem selo + fonte + data.
import type { Indicador } from '@/lib/command-center/types'
import ReliabilityBadge from './ReliabilityBadge'
import SourceTimestamp from './SourceTimestamp'
import RecommendedAction from './RecommendedAction'

const VALOR_CLS: Record<string, string> = {
  REAL: 'text-slate-900',
  ESTIMADO: 'text-amber-700',
  INDISPONIVEL: 'text-slate-400',
  BLOQUEADO: 'text-red-700',
}

export default function IndicatorCard({ indicador }: { indicador: Indicador }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{indicador.titulo}</h3>
        <ReliabilityBadge nivel={indicador.selo} />
      </div>
      <p className={`text-2xl font-bold tabular-nums ${VALOR_CLS[indicador.selo] ?? 'text-slate-900'}`}>
        {indicador.valor}
      </p>
      <p className="text-[10px] text-slate-500 mt-1">{indicador.explicacao}</p>
      <SourceTimestamp fonte={indicador.fonte} atualizadoEm={indicador.atualizadoEm} />
      {indicador.acao && <RecommendedAction texto={indicador.acao} />}
    </div>
  )
}
