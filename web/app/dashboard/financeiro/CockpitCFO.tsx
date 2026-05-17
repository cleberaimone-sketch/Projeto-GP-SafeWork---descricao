// Cockpit do CFO — KPIs principais para tomada de decisão diária.
// Responde às preocupações do CEO:
//   Linha 1: Receita, Despesa, Lucro e Margem do mês
//   Linha 2: Contas Atrasadas (a pagar + a receber) e Empréstimos em aberto

export interface CockpitData {
  // Linha 1 — Resultado do mês
  receitaMesAtual: number
  receitaMesAnt: number
  receitaDelta: number          // %
  despesaMesAtual: number
  despesaMesAnt: number
  despesaDelta: number          // %
  lucroMesAtual: number
  lucroMesAnt: number
  lucroDelta: number            // % (relativo, considerando sinal)
  margemMesAtual: number        // % do mês atual
  margemMesAnt: number          // % do mês anterior

  // Linha 2 — Riscos e dívidas
  contasPagarAtrasadas: number
  qtdPagarAtrasadas: number
  contasReceberAtrasadas: number
  qtdReceberAtrasadas: number

  emprestimosAReceber: number   // entradas pendentes
  emprestimosAPagar: number     // saídas pendentes
  emprestimosPagosMes: number   // pago neste mês
}

function fmt(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function fmtSign(v: number): string {
  if (!isFinite(v)) return '—'
  return (v >= 0 ? '+' : '') + v.toFixed(1) + '%'
}

function corDelta(v: number, inverso = false): string {
  if (!isFinite(v) || v === 0) return 'text-slate-500'
  const positivo = inverso ? v < 0 : v > 0
  return positivo ? 'text-emerald-700' : 'text-red-700'
}

export default function CockpitCFO({ data }: { data: CockpitData }) {
  const lucroCor    = data.lucroMesAtual >= 0 ? 'text-emerald-700' : 'text-red-700'
  const lucroBg     = data.lucroMesAtual >= 0 ? 'from-emerald-50 to-white' : 'from-red-50 to-white'
  const lucroBorder = data.lucroMesAtual >= 0 ? 'border-emerald-200' : 'border-red-200'

  const margemCor   = data.margemMesAtual >= 15 ? 'text-emerald-700'
                    : data.margemMesAtual >= 0  ? 'text-amber-700'
                                                : 'text-red-700'

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Cockpit do CFO</span>
        <span className="text-[10px] text-slate-400">Resultado do mês · contas atrasadas · empréstimos</span>
      </div>

      {/* Linha 1 — Resultado do mês */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">

        {/* RECEITA DO MÊS */}
        <div className="bg-white rounded-xl p-5 border border-slate-200">
          <div className="flex items-start justify-between mb-2">
            <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Receita do Mês</h3>
            <span className="text-xl">📈</span>
          </div>
          <p className="text-2xl font-bold text-emerald-700 tabular-nums">{fmt(data.receitaMesAtual)}</p>
          <div className="mt-2 flex items-center gap-2 text-[11px]">
            <span className={corDelta(data.receitaDelta)}>{fmtSign(data.receitaDelta)}</span>
            <span className="text-slate-400">vs anterior ({fmt(data.receitaMesAnt)})</span>
          </div>
        </div>

        {/* DESPESA DO MÊS */}
        <div className="bg-white rounded-xl p-5 border border-slate-200">
          <div className="flex items-start justify-between mb-2">
            <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Despesa do Mês</h3>
            <span className="text-xl">📉</span>
          </div>
          <p className="text-2xl font-bold text-amber-700 tabular-nums">{fmt(data.despesaMesAtual)}</p>
          <div className="mt-2 flex items-center gap-2 text-[11px]">
            <span className={corDelta(data.despesaDelta, true)}>{fmtSign(data.despesaDelta)}</span>
            <span className="text-slate-400">vs anterior ({fmt(data.despesaMesAnt)})</span>
          </div>
        </div>

        {/* LUCRO DO MÊS */}
        <div className={`bg-gradient-to-br ${lucroBg} rounded-xl p-5 border ${lucroBorder}`}>
          <div className="flex items-start justify-between mb-2">
            <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Lucro do Mês</h3>
            <span className="text-xl">{data.lucroMesAtual >= 0 ? '💰' : '⚠️'}</span>
          </div>
          <p className={`text-2xl font-bold ${lucroCor} tabular-nums`}>{fmt(data.lucroMesAtual)}</p>
          <div className="mt-2 flex items-center gap-2 text-[11px]">
            <span className={corDelta(data.lucroDelta)}>{fmtSign(data.lucroDelta)}</span>
            <span className="text-slate-400">vs anterior ({fmt(data.lucroMesAnt)})</span>
          </div>
        </div>

        {/* MARGEM */}
        <div className="bg-white rounded-xl p-5 border border-slate-200">
          <div className="flex items-start justify-between mb-2">
            <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Margem do Mês</h3>
            <span className="text-xl">🎯</span>
          </div>
          <p className={`text-2xl font-bold ${margemCor} tabular-nums`}>{data.margemMesAtual.toFixed(1)}%</p>
          <div className="mt-2 flex items-center gap-2 text-[11px]">
            <span className="text-slate-400">mês anterior: {data.margemMesAnt.toFixed(1)}%</span>
          </div>
        </div>

      </div>

      {/* Linha 2 — Contas Atrasadas + Empréstimos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

        {/* CONTAS ATRASADAS */}
        <div className="bg-white rounded-xl p-5 border border-slate-200">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Contas Atrasadas</h3>
              <p className="text-[9px] text-slate-400 mt-0.5">Vencidas e ainda não pagas/recebidas</p>
            </div>
            <span className="text-xl">⏰</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="border-r border-slate-200 pr-4">
              <p className="text-[10px] text-red-700/70 uppercase tracking-wider font-medium">A Pagar (você deve)</p>
              <p className="text-xl font-bold text-red-700 tabular-nums mt-1">{fmt(data.contasPagarAtrasadas)}</p>
              <p className="text-[10px] text-slate-500 mt-1">{data.qtdPagarAtrasadas} {data.qtdPagarAtrasadas === 1 ? 'conta' : 'contas'} vencida{data.qtdPagarAtrasadas === 1 ? '' : 's'}</p>
            </div>
            <div>
              <p className="text-[10px] text-amber-700/70 uppercase tracking-wider font-medium">A Receber (devem a você)</p>
              <p className="text-xl font-bold text-amber-700 tabular-nums mt-1">{fmt(data.contasReceberAtrasadas)}</p>
              <p className="text-[10px] text-slate-500 mt-1">{data.qtdReceberAtrasadas} {data.qtdReceberAtrasadas === 1 ? 'cliente' : 'clientes'} inadimplente{data.qtdReceberAtrasadas === 1 ? '' : 's'}</p>
            </div>
          </div>
        </div>

        {/* EMPRÉSTIMOS */}
        <div className="bg-white rounded-xl p-5 border border-slate-200">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Empréstimos & Parcelamentos</h3>
              <p className="text-[9px] text-slate-400 mt-0.5">Posição em aberto · sócios, bancos, parcelas antigas</p>
            </div>
            <span className="text-xl">🏦</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="border-r border-slate-200 pr-3">
              <p className="text-[10px] text-red-700/70 uppercase tracking-wider font-medium">A Pagar</p>
              <p className="text-lg font-bold text-red-700 tabular-nums mt-1">{fmt(data.emprestimosAPagar)}</p>
            </div>
            <div className="border-r border-slate-200 pr-3">
              <p className="text-[10px] text-emerald-700/70 uppercase tracking-wider font-medium">A Receber</p>
              <p className="text-lg font-bold text-emerald-700 tabular-nums mt-1">{fmt(data.emprestimosAReceber)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Pago no Mês</p>
              <p className="text-lg font-bold text-slate-700 tabular-nums mt-1">{fmt(data.emprestimosPagosMes)}</p>
            </div>
          </div>
        </div>

      </div>

    </div>
  )
}
