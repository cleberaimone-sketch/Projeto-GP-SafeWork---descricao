// Mapa de Empresas — visão consolidada por unidade do grupo
// Mostra receita/despesa/margem do mês e saldo bancário com semáforo.
// Ordena empresas com problema primeiro (status vermelho > amarelo > verde).

export interface MapaEmpresaItem {
  empresa_id: string
  empresa: string
  receita_mes: number
  despesa_mes: number
  margem_mes: number          // % sobre receita
  saldo_positivo: number
  saldo_negativo: number       // absoluto
  saldo_liquido: number
  status: 'verde' | 'amarelo' | 'vermelho'
}

function fmt(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

const STATUS_CONFIG = {
  verde:    { dot: 'bg-emerald-500', label: 'Saudável',    color: 'text-emerald-400' },
  amarelo:  { dot: 'bg-amber-500',   label: 'Atenção',     color: 'text-amber-400'   },
  vermelho: { dot: 'bg-red-500',     label: 'Crítico',     color: 'text-red-400'     },
}

export default function MapaEmpresas({ empresas }: { empresas: MapaEmpresaItem[] }) {
  if (empresas.length === 0) return null

  const totalReceita    = empresas.reduce((s, e) => s + e.receita_mes, 0)
  const totalDespesa    = empresas.reduce((s, e) => s + e.despesa_mes, 0)
  const totalLiquido    = empresas.reduce((s, e) => s + e.saldo_liquido, 0)
  const margemConsol    = totalReceita > 0 ? ((totalReceita - totalDespesa) / totalReceita) * 100 : 0
  const qtdCritica      = empresas.filter(e => e.status === 'vermelho').length

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 mb-6">

      <div className="p-5 pb-3 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Mapa de Empresas — Mês atual
          </h3>
          <p className="text-[10px] text-slate-600 mt-0.5">
            Status financeiro por unidade · ordenado por urgência
          </p>
        </div>
        {qtdCritica > 0 && (
          <span className="px-3 py-1 bg-red-950/50 border border-red-900/50 rounded-full text-[10px] text-red-300 font-medium">
            {qtdCritica} {qtdCritica === 1 ? 'empresa crítica' : 'empresas críticas'}
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-y border-slate-800 bg-slate-950/50">
              <th className="text-left  px-5 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Empresa</th>
              <th className="text-right px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Receita</th>
              <th className="text-right px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Despesa</th>
              <th className="text-right px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Margem</th>
              <th className="text-right px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Saldo +</th>
              <th className="text-right px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Dívida</th>
              <th className="text-right px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Líquido</th>
              <th className="text-right px-5 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Status</th>
            </tr>
          </thead>
          <tbody>
            {empresas.map(e => {
              const cfg = STATUS_CONFIG[e.status]
              const margemCor = e.margem_mes >= 15 ? 'text-emerald-400'
                              : e.margem_mes >= 0  ? 'text-amber-400'
                                                   : 'text-red-400'
              const liqCor    = e.saldo_liquido >= 0 ? 'text-emerald-400' : 'text-red-400'
              return (
                <tr key={e.empresa_id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                  <td className="px-5 py-3">
                    <span className="text-slate-200 font-medium">{e.empresa}</span>
                  </td>
                  <td className="px-3 py-3 text-right text-slate-300 tabular-nums">
                    {e.receita_mes > 0 ? fmt(e.receita_mes) : '—'}
                  </td>
                  <td className="px-3 py-3 text-right text-slate-300 tabular-nums">
                    {e.despesa_mes > 0 ? fmt(e.despesa_mes) : '—'}
                  </td>
                  <td className={`px-3 py-3 text-right font-medium tabular-nums ${margemCor}`}>
                    {e.receita_mes > 0 ? `${e.margem_mes.toFixed(1)}%` : '—'}
                  </td>
                  <td className="px-3 py-3 text-right text-emerald-400/70 tabular-nums">
                    {e.saldo_positivo > 0 ? fmt(e.saldo_positivo) : '—'}
                  </td>
                  <td className="px-3 py-3 text-right text-red-400/70 tabular-nums">
                    {e.saldo_negativo > 0 ? `-${fmt(e.saldo_negativo)}` : '—'}
                  </td>
                  <td className={`px-3 py-3 text-right font-medium tabular-nums ${liqCor}`}>
                    {fmt(e.saldo_liquido)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                      <span className={`text-[10px] ${cfg.color}`}>{cfg.label}</span>
                    </div>
                  </td>
                </tr>
              )
            })}

            {/* Linha de total consolidado */}
            <tr className="border-t-2 border-slate-700 bg-slate-950/30">
              <td className="px-5 py-3">
                <span className="text-xs font-bold text-white uppercase tracking-wider">Consolidado</span>
              </td>
              <td className="px-3 py-3 text-right text-white font-bold tabular-nums">{fmt(totalReceita)}</td>
              <td className="px-3 py-3 text-right text-white font-bold tabular-nums">{fmt(totalDespesa)}</td>
              <td className={`px-3 py-3 text-right font-bold tabular-nums ${margemConsol >= 15 ? 'text-emerald-400' : margemConsol >= 0 ? 'text-amber-400' : 'text-red-400'}`}>
                {totalReceita > 0 ? `${margemConsol.toFixed(1)}%` : '—'}
              </td>
              <td colSpan={2}></td>
              <td className={`px-3 py-3 text-right font-bold tabular-nums ${totalLiquido >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {fmt(totalLiquido)}
              </td>
              <td className="px-5 py-3"></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Legenda do semáforo */}
      <div className="px-5 py-3 border-t border-slate-800 flex items-center gap-4 text-[10px] text-slate-500 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span>Saudável: margem ≥ 15% e saldo positivo</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          <span>Atenção: situação intermediária</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          <span>Crítico: margem negativa ou dívida &gt; receita</span>
        </div>
      </div>

    </div>
  )
}
