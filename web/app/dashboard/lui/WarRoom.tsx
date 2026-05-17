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
  const lucroCor = data.lucroMes >= 0 ? 'text-emerald-700' : 'text-red-700'
  const lucroBorder = data.lucroMes >= 0 ? 'border-emerald-200' : 'border-red-200'
  const lucroIcoBg  = data.lucroMes >= 0 ? 'bg-emerald-50' : 'bg-red-50'

  const saldoCor = data.saldoAtivoTotal >= 0 ? 'text-blue-800' : 'text-red-700'
  const saldoBorder = data.saldoAtivoTotal >= 0 ? 'border-blue-200' : 'border-red-200'
  const saldoIcoBg  = data.saldoAtivoTotal >= 0 ? 'bg-blue-50' : 'bg-red-50'

  const asosCor = data.asosVencidos === 0 ? 'text-emerald-700'
                : data.asosVencidos > 30  ? 'text-red-700'
                                          : 'text-amber-700'
  const asosBorder = data.asosVencidos === 0 ? 'border-emerald-200'
                   : data.asosVencidos > 30  ? 'border-red-200'
                                             : 'border-amber-200'
  const asosIcoBg  = data.asosVencidos === 0 ? 'bg-emerald-50'
                   : data.asosVencidos > 30  ? 'bg-red-50'
                                             : 'bg-amber-50'

  const episCor = data.episVencidos === 0 ? 'text-emerald-700'
                : data.episVencidos > 20  ? 'text-red-700'
                                          : 'text-amber-700'
  const episBorder = data.episVencidos === 0 ? 'border-emerald-200'
                   : data.episVencidos > 20  ? 'border-red-200'
                                             : 'border-amber-200'
  const episIcoBg  = data.episVencidos === 0 ? 'bg-emerald-50'
                   : data.episVencidos > 20  ? 'bg-red-50'
                                             : 'bg-amber-50'

  const criticos = data.alertas.filter(a => a.nivel === 'critico')
  const atencao  = data.alertas.filter(a => a.nivel === 'atencao')

  return (
    <section className="mb-8">
      {/* Título do War Room */}
      <div className="flex items-end justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">War Room</h2>
          <p className="text-xs text-slate-500 mt-0.5">Saúde consolidada da holding · 4 agentes · tempo real</p>
        </div>
        <div className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
          {criticos.length + atencao.length} alerta{criticos.length + atencao.length === 1 ? '' : 's'}
        </div>
      </div>

      {/* 4 KPI Cards consolidados */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {/* 1 · Financeiro — Lucro do Mês */}
        <a href="/dashboard/financeiro" className={`rounded-xl bg-white border ${lucroBorder} shadow-sm p-4 hover:shadow-md hover:-translate-y-0.5 transition-all`}>
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-8 h-8 rounded-lg ${lucroIcoBg} flex items-center justify-center`}>
              <span className="text-base">💰</span>
            </div>
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Lucro do Mês</span>
          </div>
          <div className={`text-2xl font-bold tabular-nums ${lucroCor}`}>{fmtBRL(data.lucroMes)}</div>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-xs font-medium ${data.lucroDelta >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              {fmtPct(data.lucroDelta)} vs mês ant.
            </span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-500">
            Plata · CFO
          </div>
        </a>

        {/* 2 · Financeiro — Caixa Ativo */}
        <a href="/dashboard/financeiro/fluxo-caixa" className={`rounded-xl bg-white border ${saldoBorder} shadow-sm p-4 hover:shadow-md hover:-translate-y-0.5 transition-all`}>
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-8 h-8 rounded-lg ${saldoIcoBg} flex items-center justify-center`}>
              <span className="text-base">🏦</span>
            </div>
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Caixa Ativo</span>
          </div>
          <div className={`text-2xl font-bold tabular-nums ${saldoCor}`}>{fmtBRL(data.saldoAtivoTotal)}</div>
          <div className="text-xs text-slate-600 mt-1">
            <span className="font-medium">{data.contasAtrasadasQtd}</span> atrasadas · <span className="font-medium tabular-nums">{fmtBRL(data.contasAtrasadasValor)}</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-500">
            Bancos · Conta Azul
          </div>
        </a>

        {/* 3 · Medicina — ASOs Vencidos */}
        <a href="/dashboard/medicina" className={`rounded-xl bg-white border ${asosBorder} shadow-sm p-4 hover:shadow-md hover:-translate-y-0.5 transition-all`}>
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-8 h-8 rounded-lg ${asosIcoBg} flex items-center justify-center`}>
              <span className="text-base">🩺</span>
            </div>
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">ASOs Vencidos</span>
          </div>
          <div className={`text-2xl font-bold tabular-nums ${asosCor}`}>{fmtNum(data.asosVencidos)}</div>
          <div className="text-xs text-slate-600 mt-1">
            <span className="font-medium tabular-nums">{fmtNum(data.consultasMes)}</span> consultas este mês
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-500">
            Lari · Medicina Ocupacional
          </div>
        </a>

        {/* 4 · Engenharia — EPIs Vencidos */}
        <a href="/dashboard/engenharia" className={`rounded-xl bg-white border ${episBorder} shadow-sm p-4 hover:shadow-md hover:-translate-y-0.5 transition-all`}>
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-8 h-8 rounded-lg ${episIcoBg} flex items-center justify-center`}>
              <span className="text-base">🦺</span>
            </div>
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">EPIs Vencidos</span>
          </div>
          <div className={`text-2xl font-bold tabular-nums ${episCor}`}>{fmtNum(data.episVencidos)}</div>
          <div className="text-xs text-slate-600 mt-1">
            <span className="font-medium tabular-nums">{fmtNum(data.totalVidas)}</span> funcionários ativos
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-500">
            Dieguito · Engenharia
          </div>
        </a>
      </div>

      {/* Alertas críticos + atenção */}
      {(criticos.length > 0 || atencao.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
          {/* Críticos */}
          {criticos.length > 0 && (
            <div className="rounded-xl bg-red-50 border border-red-200 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <h3 className="text-xs font-bold text-red-800 uppercase tracking-wider">Críticos — ação imediata</h3>
                <span className="ml-auto text-[10px] text-red-700 font-bold bg-red-100 px-1.5 py-0.5 rounded-full">{criticos.length}</span>
              </div>
              <ul className="space-y-1.5">
                {criticos.map((a, i) => (
                  <li key={i}>
                    <a href={a.href} className="flex items-start gap-3 p-2 rounded-lg hover:bg-red-100 transition-colors">
                      <span className="text-base shrink-0 mt-0.5">{a.icone}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-red-900 font-semibold">{a.titulo}</p>
                        <p className="text-xs text-red-700/90 mt-0.5">{a.detalhe}</p>
                      </div>
                      <span className="text-red-600 text-xs shrink-0 self-center">→</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Atenção */}
          {atencao.length > 0 && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <h3 className="text-xs font-bold text-amber-800 uppercase tracking-wider">Atenção — esta semana</h3>
                <span className="ml-auto text-[10px] text-amber-700 font-bold bg-amber-100 px-1.5 py-0.5 rounded-full">{atencao.length}</span>
              </div>
              <ul className="space-y-1.5">
                {atencao.map((a, i) => (
                  <li key={i}>
                    <a href={a.href} className="flex items-start gap-3 p-2 rounded-lg hover:bg-amber-100 transition-colors">
                      <span className="text-base shrink-0 mt-0.5">{a.icone}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-amber-900 font-semibold">{a.titulo}</p>
                        <p className="text-xs text-amber-700/90 mt-0.5">{a.detalhe}</p>
                      </div>
                      <span className="text-amber-700 text-xs shrink-0 self-center">→</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Tudo OK */}
      {criticos.length === 0 && atencao.length === 0 && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 shadow-sm p-4 mb-4 flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <p className="text-sm text-emerald-800 font-medium">Nenhum alerta crítico no momento. Operação saudável.</p>
        </div>
      )}

      {/* Status integrações — barra fininha */}
      <div className="rounded-xl bg-white border border-slate-200 shadow-sm px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${data.contaAzulEmpresasAtivas === data.contaAzulEmpresasTotal ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          <span className="text-slate-500">Conta Azul</span>
          <span className="text-slate-900 font-medium tabular-nums">{data.contaAzulEmpresasAtivas}/{data.contaAzulEmpresasTotal} empresas</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${data.socAtivo ? 'bg-emerald-500' : 'bg-slate-400'}`} />
          <span className="text-slate-500">SOC</span>
          <span className="text-slate-900 font-medium">{data.socAtivo ? 'conectado' : 'não configurado'}</span>
        </div>
        {data.ultimoSyncContaAzul && (
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Último sync:</span>
            <span className="text-slate-900 font-medium">{data.ultimoSyncContaAzul}</span>
          </div>
        )}
        <a href="/dashboard/financeiro/sync" className="ml-auto text-blue-700 hover:text-blue-900 font-semibold">
          Sincronizar →
        </a>
      </div>
    </section>
  )
}
