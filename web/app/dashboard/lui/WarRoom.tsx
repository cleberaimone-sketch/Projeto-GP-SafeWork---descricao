// War Room da LUI — visão consolidada da saúde da holding.
// Server component: recebe dados já calculados na page e só renderiza.

export type AlertaCritico = {
  nivel: 'critico' | 'atencao'
  icone: string
  titulo: string
  detalhe: string
  href: string
}

export type WarRoomData = {
  // Financeiro
  lucroMes: number
  lucroDelta: number          // % vs mês anterior
  saldoAtivoTotal: number     // soma de v_saldos_ativos
  contasAtrasadasValor: number
  contasAtrasadasQtd: number
  emprestimosAbertos: number  // a pagar - a receber (saldo líquido devedor)

  // Medicina
  asosVencidos: number        // funcs ativos sem consulta há >365d
  consultasMes: number
  licencasAtivas: number

  // Engenharia
  episVencidos: number        // EPIs com CA vencido
  ghesInsalubres: number      // GHEs com insalubridade
  totalVidas: number          // funcionários ativos

  // Sistema
  ultimoSyncContaAzul: string | null
  socAtivo: boolean
  contaAzulEmpresasAtivas: number   // empresas com token válido
  contaAzulEmpresasTotal: number

  // Alertas derivados (já ordenados por prioridade)
  alertas: AlertaCritico[]
}

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function fmtNum(v: number): string {
  return v.toLocaleString('pt-BR')
}

function fmtPct(v: number): string {
  if (!isFinite(v)) return '—'
  return (v >= 0 ? '+' : '') + v.toFixed(1) + '%'
}

export default function WarRoom({ data }: { data: WarRoomData }) {
  const lucroCor = data.lucroMes >= 0 ? 'text-emerald-400' : 'text-red-400'
  const lucroBg  = data.lucroMes >= 0 ? 'from-emerald-950/40 to-slate-900' : 'from-red-950/40 to-slate-900'
  const lucroBorder = data.lucroMes >= 0 ? 'border-emerald-800/50' : 'border-red-800/50'

  const saldoCor = data.saldoAtivoTotal >= 0 ? 'text-blue-300' : 'text-red-400'
  const saldoBg  = data.saldoAtivoTotal >= 0 ? 'from-blue-950/40 to-slate-900' : 'from-red-950/40 to-slate-900'

  const asosCor = data.asosVencidos === 0 ? 'text-emerald-400'
                : data.asosVencidos > 30  ? 'text-red-400'
                                          : 'text-amber-400'
  const asosBg  = data.asosVencidos === 0 ? 'from-emerald-950/40 to-slate-900'
                : data.asosVencidos > 30  ? 'from-red-950/40 to-slate-900'
                                          : 'from-amber-950/40 to-slate-900'

  const episCor = data.episVencidos === 0 ? 'text-emerald-400'
                : data.episVencidos > 20  ? 'text-red-400'
                                          : 'text-amber-400'
  const episBg  = data.episVencidos === 0 ? 'from-emerald-950/40 to-slate-900'
                : data.episVencidos > 20  ? 'from-red-950/40 to-slate-900'
                                          : 'from-amber-950/40 to-slate-900'

  const criticos = data.alertas.filter(a => a.nivel === 'critico')
  const atencao  = data.alertas.filter(a => a.nivel === 'atencao')

  return (
    <section className="mb-8">
      {/* Título do War Room */}
      <div className="flex items-end justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-100 tracking-tight">War Room</h2>
          <p className="text-xs text-slate-500 mt-0.5">Saúde consolidada da holding · 4 agentes · atualizado em tempo real</p>
        </div>
        <div className="text-[10px] text-slate-600 uppercase tracking-wider">
          {criticos.length + atencao.length} alerta{criticos.length + atencao.length === 1 ? '' : 's'}
        </div>
      </div>

      {/* 4 KPI Cards consolidados */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {/* 1 · Financeiro — Lucro do Mês */}
        <a href="/dashboard/financeiro" className={`rounded-xl bg-gradient-to-br ${lucroBg} border ${lucroBorder} p-4 hover:scale-[1.02] transition-transform`}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-base">💰</span>
            <span className="text-[10px] uppercase tracking-wider text-slate-400">Lucro do Mês</span>
          </div>
          <div className={`text-2xl font-bold tabular-nums ${lucroCor}`}>{fmtBRL(data.lucroMes)}</div>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-xs ${data.lucroDelta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {fmtPct(data.lucroDelta)} vs mês ant.
            </span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-800/60 text-[11px] text-slate-500">
            Plata · CFO
          </div>
        </a>

        {/* 2 · Financeiro — Caixa Ativo */}
        <a href="/dashboard/financeiro/fluxo-caixa" className={`rounded-xl bg-gradient-to-br ${saldoBg} border border-slate-800 p-4 hover:scale-[1.02] transition-transform`}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-base">🏦</span>
            <span className="text-[10px] uppercase tracking-wider text-slate-400">Caixa Ativo</span>
          </div>
          <div className={`text-2xl font-bold tabular-nums ${saldoCor}`}>{fmtBRL(data.saldoAtivoTotal)}</div>
          <div className="text-xs text-slate-400 mt-1">
            {data.contasAtrasadasQtd} contas atrasadas · {fmtBRL(data.contasAtrasadasValor)}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-800/60 text-[11px] text-slate-500">
            Bancos · Conta Azul
          </div>
        </a>

        {/* 3 · Medicina — ASOs Vencidos */}
        <a href="/dashboard/medicina" className={`rounded-xl bg-gradient-to-br ${asosBg} border border-slate-800 p-4 hover:scale-[1.02] transition-transform`}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-base">🩺</span>
            <span className="text-[10px] uppercase tracking-wider text-slate-400">ASOs Vencidos</span>
          </div>
          <div className={`text-2xl font-bold tabular-nums ${asosCor}`}>{fmtNum(data.asosVencidos)}</div>
          <div className="text-xs text-slate-400 mt-1">
            {fmtNum(data.consultasMes)} consultas este mês
          </div>
          <div className="mt-3 pt-3 border-t border-slate-800/60 text-[11px] text-slate-500">
            Lari · Medicina Ocupacional
          </div>
        </a>

        {/* 4 · Engenharia — EPIs Vencidos */}
        <a href="/dashboard/engenharia" className={`rounded-xl bg-gradient-to-br ${episBg} border border-slate-800 p-4 hover:scale-[1.02] transition-transform`}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-base">🦺</span>
            <span className="text-[10px] uppercase tracking-wider text-slate-400">EPIs Vencidos</span>
          </div>
          <div className={`text-2xl font-bold tabular-nums ${episCor}`}>{fmtNum(data.episVencidos)}</div>
          <div className="text-xs text-slate-400 mt-1">
            {fmtNum(data.totalVidas)} funcionários ativos
          </div>
          <div className="mt-3 pt-3 border-t border-slate-800/60 text-[11px] text-slate-500">
            Dieguito · Engenharia
          </div>
        </a>
      </div>

      {/* Alertas críticos + atenção */}
      {(criticos.length > 0 || atencao.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
          {/* Críticos */}
          {criticos.length > 0 && (
            <div className="rounded-xl bg-red-950/20 border border-red-900/40 p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <h3 className="text-xs font-bold text-red-300 uppercase tracking-wider">Críticos — ação imediata</h3>
                <span className="ml-auto text-[10px] text-red-400/80">{criticos.length}</span>
              </div>
              <ul className="space-y-2">
                {criticos.map((a, i) => (
                  <li key={i}>
                    <a href={a.href} className="flex items-start gap-3 p-2 rounded-lg hover:bg-red-950/30 transition-colors">
                      <span className="text-base shrink-0 mt-0.5">{a.icone}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-red-200 font-medium">{a.titulo}</p>
                        <p className="text-xs text-red-300/70 mt-0.5">{a.detalhe}</p>
                      </div>
                      <span className="text-red-400/60 text-xs shrink-0">→</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Atenção */}
          {atencao.length > 0 && (
            <div className="rounded-xl bg-amber-950/20 border border-amber-900/40 p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <h3 className="text-xs font-bold text-amber-300 uppercase tracking-wider">Atenção — esta semana</h3>
                <span className="ml-auto text-[10px] text-amber-400/80">{atencao.length}</span>
              </div>
              <ul className="space-y-2">
                {atencao.map((a, i) => (
                  <li key={i}>
                    <a href={a.href} className="flex items-start gap-3 p-2 rounded-lg hover:bg-amber-950/30 transition-colors">
                      <span className="text-base shrink-0 mt-0.5">{a.icone}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-amber-200 font-medium">{a.titulo}</p>
                        <p className="text-xs text-amber-300/70 mt-0.5">{a.detalhe}</p>
                      </div>
                      <span className="text-amber-400/60 text-xs shrink-0">→</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Tudo OK — só aparece quando não há alertas */}
      {criticos.length === 0 && atencao.length === 0 && (
        <div className="rounded-xl bg-emerald-950/20 border border-emerald-900/40 p-4 mb-4 flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <p className="text-sm text-emerald-300">Nenhum alerta crítico no momento. Operação saudável.</p>
        </div>
      )}

      {/* Status integrações — barra fininha */}
      <div className="rounded-xl bg-slate-900/50 border border-slate-800/60 px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${data.contaAzulEmpresasAtivas === data.contaAzulEmpresasTotal ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          <span className="text-slate-500">Conta Azul</span>
          <span className="text-slate-300">{data.contaAzulEmpresasAtivas}/{data.contaAzulEmpresasTotal} empresas</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${data.socAtivo ? 'bg-emerald-500' : 'bg-slate-600'}`} />
          <span className="text-slate-500">SOC</span>
          <span className="text-slate-300">{data.socAtivo ? 'conectado' : 'não configurado'}</span>
        </div>
        {data.ultimoSyncContaAzul && (
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Último sync:</span>
            <span className="text-slate-300">{data.ultimoSyncContaAzul}</span>
          </div>
        )}
        <a href="/dashboard/financeiro/sync" className="ml-auto text-blue-400 hover:text-blue-300">
          Sincronizar →
        </a>
      </div>
    </section>
  )
}
