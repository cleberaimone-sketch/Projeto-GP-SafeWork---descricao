// Semáforo de status/sinal — cor + rótulo textual (acessível).
import type { StatusNivel } from '@/lib/command-center/types'

const CONFIG: Record<StatusNivel, { label: string; dot: string; cls: string }> = {
  OK:        { label: 'OK',          dot: 'bg-emerald-500', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  ATENCAO:   { label: 'Atenção',     dot: 'bg-amber-500',   cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  CRITICO:   { label: 'Crítico',     dot: 'bg-red-500',     cls: 'bg-red-50 text-red-700 border-red-200' },
  PAUSADO:   { label: 'Pausado',     dot: 'bg-slate-400',   cls: 'bg-slate-100 text-slate-500 border-slate-200' },
  BLOQUEADO: { label: 'Bloqueado',   dot: 'bg-red-700',     cls: 'bg-red-100 text-red-800 border-red-300' },
  FUNDACAO:  { label: 'Fundação',    dot: 'bg-blue-500',    cls: 'bg-blue-50 text-blue-700 border-blue-200' },
}

export default function SignalBadge({ nivel }: { nivel: StatusNivel }) {
  const c = CONFIG[nivel]
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border ${c.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} aria-hidden="true" />
      {c.label}
    </span>
  )
}
