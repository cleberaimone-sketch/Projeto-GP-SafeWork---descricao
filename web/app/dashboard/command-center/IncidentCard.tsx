// Card de incidente operacional.
import type { Incidente } from '@/lib/command-center/types'
import SignalBadge from './SignalBadge'

export default function IncidentCard({ incidente }: { incidente: Incidente }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-sm font-semibold text-slate-900">{incidente.titulo}</h3>
        <SignalBadge nivel={incidente.severidade} />
      </div>
      <dl className="space-y-1 text-[11px]">
        <div className="flex gap-2"><dt className="text-slate-400 w-24 shrink-0">Impacto</dt><dd className="text-slate-700">{incidente.impacto}</dd></div>
        <div className="flex gap-2"><dt className="text-slate-400 w-24 shrink-0">Próximo passo</dt><dd className="text-slate-700">{incidente.proximoPasso}</dd></div>
        <div className="flex gap-2"><dt className="text-slate-400 w-24 shrink-0">Dono</dt><dd className="text-slate-700">{incidente.dono}</dd></div>
        <div className="flex gap-2"><dt className="text-slate-400 w-24 shrink-0">Fonte / status</dt><dd className="text-slate-700">{incidente.fonte} · {incidente.status}</dd></div>
      </dl>
    </div>
  )
}
