// Cockpit do CFO — KPIs principais para tomada de decisão diária.
// Responde às 4 perguntas do CEO:
//   1. "Tem dinheiro pra pagar a folha?"
//   2. "Quanto custa pra rolar a dívida?"
//   3. "Quanto tempo o caixa cobre o burn?"
//   4. "Como ficou a receita do mês?"

export interface CockpitData {
  // Caixa
  caixaPositivo: number
  dividaCheque: number
  caixaLiquido: number
  // Folha
  folhaMensalMedia: number
  coberturaFolha: number | null   // em meses
  // Cheque especial
  taxaChequeEspecialAM: number    // ex 0.08 = 8% a.m.
  custoChequeEspecialMes: number
  // Burn / runway
  burnMensalMedio: number
  runwayLiquido: number | null    // meses
  // Receita do mês
  receitaMesAtual: number
  receitaMesAnt: number
  receitaDelta: number            // %
}

function fmt(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function fmtSign(v: number): string {
  return (v >= 0 ? '+' : '') + v.toFixed(1) + '%'
}

export default function CockpitCFO({ data }: { data: CockpitData }) {
  const liquidoCor    = data.caixaLiquido >= 0 ? 'text-emerald-400' : 'text-red-400'
  const liquidoBg     = data.caixaLiquido >= 0 ? 'from-emerald-950 to-slate-900' : 'from-red-950 to-slate-900'
  const liquidoBorder = data.caixaLiquido >= 0 ? 'border-emerald-800/50' : 'border-red-800/50'

  const coberturaCor = data.coberturaFolha == null
    ? 'text-slate-400'
    : data.coberturaFolha >= 1.5 ? 'text-emerald-400'
    : data.coberturaFolha >= 0.8 ? 'text-amber-400'
    : 'text-red-400'

  const deltaCor = data.receitaDelta >= 0 ? 'text-emerald-400' : 'text-red-400'

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Cockpit do CFO</span>
        <span className="text-[10px] text-slate-600">Indicadores de pilotagem · atualizados em tempo real</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">

        {/* KPI 1 — CAIXA LÍQUIDO REAL */}
        <div className={`bg-gradient-to-br ${liquidoBg} rounded-xl p-5 border ${liquidoBorder}`}>
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Caixa Líquido Real</h3>
              <p className="text-[9px] text-slate-600 mt-0.5">Saldo disponível menos cheque especial</p>
            </div>
            <span className={`text-2xl ${liquidoCor}`}>{data.caixaLiquido >= 0 ? '💰' : '⚠️'}</span>
          </div>
          <p className={`text-2xl font-bold ${liquidoCor} tabular-nums`}>{fmt(data.caixaLiquido)}</p>
          <div className="mt-3 pt-3 border-t border-slate-800 space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-500">Conta positiva:</span>
              <span className="text-emerald-400 tabular-nums">{fmt(data.caixaPositivo)}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-500">Cheque especial:</span>
              <span className="text-red-400 tabular-nums">-{fmt(data.dividaCheque)}</span>
            </div>
          </div>
        </div>

        {/* KPI 2 — COBERTURA DE FOLHA */}
        <div className="bg-slate-900 rounded-xl p-5 border border-slate-800">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Cobertura de Folha</h3>
              <p className="text-[9px] text-slate-600 mt-0.5">Caixa positivo ÷ folha mensal</p>
            </div>
            <span className="text-2xl">👥</span>
          </div>
          <p className={`text-2xl font-bold ${coberturaCor} tabular-nums`}>
            {data.coberturaFolha == null ? '—' : `${data.coberturaFolha.toFixed(1)} mês${data.coberturaFolha === 1 ? '' : 'es'}`}
          </p>
          <div className="mt-3 pt-3 border-t border-slate-800 space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-500">Folha mensal média:</span>
              <span className="text-slate-300 tabular-nums">{fmt(data.folhaMensalMedia)}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-500">Caixa positivo:</span>
              <span className="text-slate-300 tabular-nums">{fmt(data.caixaPositivo)}</span>
            </div>
          </div>
        </div>

        {/* KPI 3 — CUSTO CHEQUE ESPECIAL */}
        <div className="bg-gradient-to-br from-red-950/40 to-slate-900 rounded-xl p-5 border border-red-900/40">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Custo do Cheque Especial</h3>
              <p className="text-[9px] text-slate-600 mt-0.5">Juros estimados pagos por mês</p>
            </div>
            <span className="text-2xl">🩸</span>
          </div>
          <p className="text-2xl font-bold text-red-400 tabular-nums">{fmt(data.custoChequeEspecialMes)}/mês</p>
          <div className="mt-3 pt-3 border-t border-slate-800 space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-500">Dívida em cheque:</span>
              <span className="text-red-400 tabular-nums">{fmt(data.dividaCheque)}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-500">Taxa estimada:</span>
              <span className="text-slate-300 tabular-nums">{(data.taxaChequeEspecialAM * 100).toFixed(1)}% a.m.</span>
            </div>
          </div>
        </div>

        {/* KPI 4 — RECEITA DO MÊS */}
        <div className="bg-slate-900 rounded-xl p-5 border border-slate-800">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Receita do Mês</h3>
              <p className="text-[9px] text-slate-600 mt-0.5">Sem transferências internas</p>
            </div>
            <span className="text-2xl">📈</span>
          </div>
          <p className="text-2xl font-bold text-emerald-400 tabular-nums">{fmt(data.receitaMesAtual)}</p>
          <div className="mt-3 pt-3 border-t border-slate-800 space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-500">vs mês anterior:</span>
              <span className={`${deltaCor} tabular-nums`}>{fmtSign(data.receitaDelta)}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-500">Mês anterior:</span>
              <span className="text-slate-300 tabular-nums">{fmt(data.receitaMesAnt)}</span>
            </div>
          </div>
        </div>

      </div>

      {/* Mini-alerta de runway crítico */}
      {data.runwayLiquido !== null && data.runwayLiquido < 1 && data.caixaLiquido < 0 && (
        <div className="mt-3 bg-red-950/40 border border-red-900/40 rounded-lg px-4 py-3 flex items-center gap-3">
          <span className="text-2xl">🚨</span>
          <div>
            <p className="text-xs font-semibold text-red-300">Caixa líquido NEGATIVO — situação crítica</p>
            <p className="text-[11px] text-slate-400">
              Burn médio: {fmt(data.burnMensalMedio)}/mês.
              Cheque especial custando {fmt(data.custoChequeEspecialMes)}/mês em juros.
              Priorize: cobrança de inadimplentes, redução de despesa, ou injeção de capital.
            </p>
          </div>
        </div>
      )}

    </div>
  )
}
