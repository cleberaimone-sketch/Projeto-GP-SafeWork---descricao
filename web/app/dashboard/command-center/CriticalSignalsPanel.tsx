// Faixa de sinais críticos no topo. Ordena por severidade (Crítico/Bloqueado primeiro).
import type { Sinal, StatusNivel } from '@/lib/command-center/types'
import SignalBadge from './SignalBadge'

const ORDEM: Record<StatusNivel, number> = {
  CRITICO: 0, BLOQUEADO: 1, ATENCAO: 2, PAUSADO: 3, FUNDACAO: 4, OK: 5,
}

export default function CriticalSignalsPanel({ sinais }: { sinais: Sinal[] }) {
  if (!sinais.length) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <p className="text-xs text-slate-500">Sem sinais críticos.</p>
      </div>
    )
  }
  const ordenados = [...sinais].sort((a, b) => ORDEM[a.nivel] - ORDEM[b.nivel])
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Sinais Críticos</h2>
      <ul className="space-y-2">
        {ordenados.map((s, i) => (
          <li key={i} className="flex items-center gap-3">
            <SignalBadge nivel={s.nivel} />
            <span className="text-xs text-slate-700">{s.rotulo}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
