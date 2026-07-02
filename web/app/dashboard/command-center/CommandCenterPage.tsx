// Composição da tela V0 (estática, read-only). Recebe o snapshot e monta os blocos.
import type { CommandCenterSnapshot } from '@/lib/command-center/types'
import ExecutiveHeader from './ExecutiveHeader'
import DataReconciliationBanner from './DataReconciliationBanner'
import CriticalSignalsPanel from './CriticalSignalsPanel'
import IndicatorCard from './IndicatorCard'
import IntegrationsStatusGrid from './IntegrationsStatusGrid'
import IncidentCard from './IncidentCard'
import DataHealthTable from './DataHealthTable'

export default function CommandCenterPage({ snapshot }: { snapshot: CommandCenterSnapshot }) {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6 md:py-8 space-y-6">

        <ExecutiveHeader
          leituraEm={snapshot.geradoEm}
          ambiente={snapshot.ambiente}
          statusGeral={snapshot.statusGeral}
        />

        <DataReconciliationBanner />

        <CriticalSignalsPanel sinais={snapshot.sinaisCriticos} />

        {/* Visão Geral */}
        <section>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Visão Geral</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {snapshot.visaoGeral.map((ind, i) => <IndicatorCard key={i} indicador={ind} />)}
          </div>
        </section>

        {/* Integrações */}
        <section>
          <IntegrationsStatusGrid integracoes={snapshot.integracoes} />
        </section>

        {/* Incidentes */}
        <section>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Incidentes</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {snapshot.incidentes.map((inc, i) => <IncidentCard key={i} incidente={inc} />)}
          </div>
        </section>

        {/* Saúde dos Dados */}
        <section>
          <DataHealthTable verificacoes={snapshot.saudeDados} />
        </section>

        <p className="text-[10px] text-slate-400 text-center pt-2">
          GP Command Center · V0 read-only · snapshot estático de diagnóstico · sem dados ao vivo
        </p>
      </div>
    </main>
  )
}
