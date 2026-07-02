// Cabeçalho executivo — título, leitura, ambiente, status geral.
import type { StatusNivel } from '@/lib/command-center/types'
import SignalBadge from './SignalBadge'

export default function ExecutiveHeader({
  leituraEm, ambiente, statusGeral,
}: { leituraEm: string; ambiente: string; statusGeral: StatusNivel }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center gap-3 mb-1 flex-wrap">
        <a href="/dashboard" className="text-[11px] text-slate-400 hover:text-slate-600">← Centro de Comando</a>
      </div>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">GP Command Center</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Leitura: {leituraEm} · ambiente: <span className="font-medium">{ambiente}</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Status geral</p>
          <SignalBadge nivel={statusGeral} />
        </div>
      </div>
    </div>
  )
}
