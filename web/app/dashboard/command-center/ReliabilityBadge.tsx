// Selo de confiabilidade — obrigatório em todo indicador.
import type { Selo } from '@/lib/command-center/types'

const CONFIG: Record<Selo, { label: string; cls: string }> = {
  REAL:        { label: 'REAL',         cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  ESTIMADO:    { label: 'ESTIMADO',     cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  INDISPONIVEL:{ label: 'INDISPONÍVEL', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
  BLOQUEADO:   { label: 'BLOQUEADO',    cls: 'bg-red-50 text-red-700 border-red-200' },
}

export default function ReliabilityBadge({ nivel }: { nivel: Selo }) {
  const c = CONFIG[nivel]
  return (
    <span className={`inline-block text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${c.cls}`}>
      {c.label}
    </span>
  )
}
