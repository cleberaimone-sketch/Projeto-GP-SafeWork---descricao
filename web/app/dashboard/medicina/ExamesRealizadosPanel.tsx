// Painel de todos os exames realizados, ordenados do maior para o menor

export interface ExameRealizadoItem {
  nome: string
  quantidade: number
  alterados: number
}

interface Props {
  exames: ExameRealizadoItem[]
  periodo: string
}

export default function ExamesRealizadosPanel({ exames, periodo }: Props) {
  if (exames.length === 0) {
    return (
      <div className="bg-white rounded-xl p-5 border border-slate-200 text-center">
        <p className="text-xs text-slate-500">Sem dados de exames para o período</p>
      </div>
    )
  }

  const max   = exames[0]?.quantidade ?? 1
  const total = exames.reduce((s, e) => s + e.quantidade, 0)

  return (
    <div className="bg-white rounded-xl p-5 border border-slate-200">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Exames Realizados — {periodo}
          </h3>
          <p className="text-[10px] text-slate-400 mt-0.5">
            Todos os tipos de exame, do mais ao menos frequente
          </p>
        </div>
        <span className="text-sm font-bold text-slate-900">{total.toLocaleString('pt-BR')}</span>
      </div>

      <div className="space-y-3">
        {exames.map((e, i) => {
          const pct    = (e.quantidade / total) * 100
          const barPct = (e.quantidade / max) * 100
          const temAlt = e.alterados > 0
          // Consulta/Clínico = ASO — destaca em verde escuro
          const isASO  = e.nome.toUpperCase().includes('CONSULTA') || e.nome.toUpperCase().includes('CLINICO') || e.nome.toUpperCase().includes('CLÍNICO')

          return (
            <div key={e.nome}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] text-slate-400 w-4 shrink-0 text-right">{i + 1}</span>
                <span className={`text-xs truncate flex-1 ${isASO ? 'text-emerald-800 font-medium' : 'text-slate-800'}`}>
                  {e.nome}
                  {isASO && <span className="ml-1 text-[9px] text-emerald-600 font-normal uppercase">ASO</span>}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  {temAlt && (
                    <span className="text-[10px] text-red-700 font-medium">{e.alterados} alt.</span>
                  )}
                  <span className="text-xs font-semibold text-slate-900 w-16 text-right">
                    {e.quantidade.toLocaleString('pt-BR')}
                  </span>
                  <span className="text-[10px] text-slate-400 w-8 text-right">
                    {pct.toFixed(1)}%
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 shrink-0" />
                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${barPct}%`,
                      backgroundColor: temAlt ? '#ef4444' : isASO ? '#10b981' : '#3b82f6',
                    }}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {exames.some(e => e.alterados > 0) && (
        <p className="text-[10px] text-red-700 mt-4 pt-3 border-t border-slate-200">
          Exames com "alt." = resultado clínico anormal — requer acompanhamento
        </p>
      )}
    </div>
  )
}
