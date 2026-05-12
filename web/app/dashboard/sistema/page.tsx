import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { createClient as sb } from '@supabase/supabase-js'

function Badge({ status }: { status: 'ativo' | 'pendente' | 'planejado' | 'encerrando' }) {
  const styles = {
    ativo:      'bg-green-900/50 text-green-300 border border-green-800',
    pendente:   'bg-yellow-900/50 text-yellow-300 border border-yellow-800',
    planejado:  'bg-gray-800 text-gray-400 border border-gray-700',
    encerrando: 'bg-red-900/30 text-red-400 border border-red-900',
  }
  const labels = { ativo: '● Ativo', pendente: '◐ Pendente', planejado: '○ Planejado', encerrando: '✕ Encerrando' }
  return <span className={`text-xs px-2 py-0.5 rounded-full ${styles[status]}`}>{labels[status]}</span>
}

function ModuleCard({
  icon, title, gerente, equipe, integracao, sistema, status, metricas, lui, color
}: {
  icon: string
  title: string
  gerente: string
  equipe: string[]
  integracao: string
  sistema: string
  status: 'ativo' | 'pendente' | 'planejado' | 'encerrando'
  metricas: { label: string; valor: string; obs?: string }[]
  lui: string[]
  color: string
}) {
  return (
    <div className={`bg-gray-900 rounded-xl border ${color} flex flex-col`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">{icon}</span>
            <h3 className="font-semibold text-white">{title}</h3>
          </div>
          <Badge status={status} />
        </div>
        <p className="text-xs text-gray-400">Gerente: <span className="text-gray-200">{gerente}</span></p>
        <div className="flex flex-wrap gap-1 mt-2">
          {equipe.map(p => (
            <span key={p} className="text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">{p}</span>
          ))}
        </div>
      </div>

      {/* Integração */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="text-gray-500">Sistema fonte</span>
          <span className={`font-medium ${status === 'ativo' ? 'text-green-400' : 'text-yellow-400'}`}>{sistema}</span>
        </div>
        <p className="text-xs text-gray-500">{integracao}</p>
      </div>

      {/* Métricas */}
      <div className="px-4 py-3 grid grid-cols-2 gap-2 border-t border-gray-800/50">
        {metricas.map((m, i) => (
          <div key={i} className="bg-gray-800/50 rounded-lg p-2">
            <p className="text-xs text-gray-500">{m.label}</p>
            <p className="text-sm font-semibold text-gray-100 mt-0.5">{m.valor}</p>
            {m.obs && <p className="text-xs text-gray-600">{m.obs}</p>}
          </div>
        ))}
      </div>

      {/* LUI */}
      <div className="px-4 py-3 border-t border-gray-800/50 mt-auto">
        <p className="text-xs text-blue-400 font-medium mb-1.5">🤖 LUI neste módulo</p>
        <ul className="space-y-1">
          {lui.map((item, i) => (
            <li key={i} className="text-xs text-gray-400 flex gap-1.5">
              <span className="text-gray-600 shrink-0">→</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export default async function SistemaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = sb(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const [{ data: lancamentos }, { data: saldos }, { data: syncLogs }] = await Promise.all([
    service.from('lancamentos_financeiros').select('tipo, status, valor', { count: 'exact' }),
    service.from('saldos_bancarios').select('banco, saldo, data_referencia').order('data_referencia', { ascending: false }),
    service.from('sync_log').select('fonte, status, finalizado_em').order('finalizado_em', { ascending: false }).limit(10),
  ])

  const totalRec = (lancamentos ?? []).filter(l => l.tipo === 'receita').reduce((s, l) => s + Number(l.valor), 0)
  const totalDesp = (lancamentos ?? []).filter(l => l.tipo === 'despesa').reduce((s, l) => s + Number(l.valor), 0)
  const vencidos = (lancamentos ?? []).filter(l => l.status === 'vencido').length

  // Saldo mais recente por banco (sem duplicatas)
  const saldoMap: Record<string, number> = {}
  for (const s of saldos ?? []) {
    if (!(s.banco in saldoMap)) saldoMap[s.banco] = s.saldo ?? 0
  }
  const saldoTotal = Object.values(saldoMap).reduce((a, b) => a + b, 0)

  const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 }).format(v)

  const ultimoSync = syncLogs?.find(s => s.fonte === 'conta_azul')?.finalizado_em
  const ultimoSyncFmt = ultimoSync ? new Date(ultimoSync).toLocaleString('pt-BR', { day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit' }) : '—'

  return (
    <main className="min-h-screen bg-gray-950 text-white p-6 md:p-8">
      {/* Header */}
      <div className="mb-8">
        <a href="/dashboard" className="text-gray-500 text-sm hover:text-gray-300">← Centro de Comando</a>
        <h1 className="text-2xl font-bold mt-1">Visão do Sistema — GP SafeWork</h1>
        <p className="text-gray-400 text-sm">Todos os módulos, integrações e como o LUI atua em cada área</p>
      </div>

      {/* LUI — Centro */}
      <div className="bg-gradient-to-r from-blue-950 to-gray-900 rounded-xl border border-blue-800 p-5 mb-8">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-900 flex items-center justify-center text-xl font-bold shrink-0">L</div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-lg">LUI — Agente CEO</h2>
              <span className="flex items-center gap-1 text-xs text-green-400"><span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />Ativo</span>
            </div>
            <p className="text-gray-400 text-sm">Agente principal que comanda e coordena todos os outros. Especialista com visão de CFO+COO do grupo.</p>
          </div>
          <a href="/dashboard/lui" className="ml-auto text-xs bg-blue-700 hover:bg-blue-600 px-3 py-1.5 rounded-lg transition-colors shrink-0">Abrir chat</a>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Briefing diário', val: '07:00h', icon: '🌅' },
            { label: 'Canal principal', val: 'WhatsApp', icon: '📱' },
            { label: 'Modelo IA', val: 'Claude Sonnet', icon: '🧠' },
            { label: 'Memória', val: 'Contínua', icon: '💾' },
          ].map(item => (
            <div key={item.label} className="bg-blue-950/50 rounded-lg p-3 text-center">
              <p className="text-lg mb-1">{item.icon}</p>
              <p className="text-sm font-semibold text-blue-100">{item.val}</p>
              <p className="text-xs text-blue-400">{item.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Agentes Especializados — títulos */}
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Módulos e Agentes Especializados</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 mb-8">

        {/* FINANCEIRO */}
        <ModuleCard
          icon="💰" title="Financeiro — SafeBank" gerente="Evelyn Lavyne (supervisora)"
          equipe={['Maria Leticia', 'Murilo Gonçalves', 'Gabriele Teles', 'Giovanna (BI)']}
          sistema="Conta Azul" status="ativo"
          integracao={`Integrado via Conta Azul Mais (master). ${(lancamentos ?? []).length} lançamentos sincronizados. Último sync: ${ultimoSyncFmt}`}
          metricas={[
            { label: 'Receitas históricas', valor: fmt(totalRec) },
            { label: 'Despesas históricas', valor: fmt(totalDesp) },
            { label: 'Saldo bancário', valor: fmt(saldoTotal), obs: '6 contas' },
            { label: 'Lançamentos vencidos', valor: String(vencidos), obs: 'precisam de ação' },
          ]}
          lui={[
            'Alerta diário de inadimplência e títulos vencidos',
            'Fluxo de caixa e DRE consolidado via Conta Azul',
            'Previsão de recebimentos dos próximos 30 dias',
            'Análise de contratos por empresa e por cliente',
            'Recomendação de prioridade de pagamento',
          ]}
          color="border-green-900"
        />

        {/* MEDICINA */}
        <ModuleCard
          icon="🏥" title="Medicina Ocupacional" gerente="Larissa Vargas"
          equipe={['Clínica Medianeira', 'Clínica Foz', 'Clínica Santa Helena', 'Clínica Londrina', 'New Life (parceira)', 'Agendamentos Safe+']}
          sistema="SOC" status="pendente"
          integracao="Integração SOC em desenvolvimento. Dados de ASOs, consultas, PCMSO e laudos médicos serão puxados automaticamente."
          metricas={[
            { label: 'Clínicas próprias', valor: '4', obs: 'Medianeira, Foz, SH, Londrina' },
            { label: 'ASOs / mês', valor: '—', obs: 'aguarda SOC' },
            { label: 'Consultas ontem', valor: '—', obs: 'aguarda SOC' },
            { label: 'ASOs vencendo 30d', valor: '—', obs: 'aguarda SOC' },
          ]}
          lui={[
            'Alerta de ASOs vencendo nos próximos 30/60 dias',
            'Ranking de clientes com maior volume de exames',
            'Comparativo de produção entre clínicas',
            'Alerta de laudos médicos pendentes',
            'Relatório de agendamentos x realizado por clínica',
          ]}
          color="border-teal-900"
        />

        {/* ENGENHARIA */}
        <ModuleCard
          icon="⚙️" title="Engenharia de Segurança" gerente="Diego Chies"
          equipe={['Jhonatan Almeida (Safe+)', 'Carla de Lima (adm)', 'Tiago (TST Foz)', 'Eduardo (TST Londrina)', 'Hillyard (TST)', 'Dani (TRES Foz)', 'Bruna Amarante (e-Social)']}
          sistema="SOC" status="pendente"
          integracao="Integração SOC em desenvolvimento. Dados de laudos técnicos, PGR, LTCAT e conformidade NR serão sincronizados."
          metricas={[
            { label: 'Laudos ativos', valor: '—', obs: 'aguarda SOC' },
            { label: 'PGRs em vigor', valor: '—', obs: 'aguarda SOC' },
            { label: 'Vencendo 60 dias', valor: '—', obs: 'aguarda SOC' },
            { label: 'e-Social pendentes', valor: '—', obs: 'aguarda SOC' },
          ]}
          lui={[
            'Alerta de laudos e PGRs vencendo por cliente',
            'Relatório de conformidade NR por empresa',
            'Pendências de e-Social por unidade',
            'Visão de carga de trabalho dos TSTs por região',
            'Análise de risco e priorização de visitas técnicas',
          ]}
          color="border-orange-900"
        />

        {/* COMERCIAL */}
        <ModuleCard
          icon="📈" title="Comercial" gerente="Luis Rabelo"
          equipe={['Nathielli Vargas (supervisora)', 'Lucas Botelho', 'Douglas Andrade', 'Greicy Furtado', 'Juan de Lima (cred.)', 'Weidiane (adm)', 'Luccas Facundo (marketing)']}
          sistema="RD Station" status="planejado"
          integracao="Integração com RD Station (CRM) planejada. Dados de pipeline, funil de vendas e contratos D4sign serão integrados."
          metricas={[
            { label: 'Pipeline ativo', valor: '—', obs: 'aguarda RD Station' },
            { label: 'Contratos D4sign', valor: '—', obs: 'aguarda integração' },
            { label: 'Propostas abertas', valor: '—', obs: 'aguarda RD Station' },
            { label: 'Credenciados Safe+', valor: '—', obs: 'aguarda cadastro' },
          ]}
          lui={[
            'Acompanhamento diário do funil de vendas',
            'Alerta de propostas abertas sem follow-up há 7+ dias',
            'Análise de conversão por vendedor e por região',
            'Contratos próximos do vencimento (D4sign)',
            'Relatório de performance comercial por empresa',
          ]}
          color="border-purple-900"
        />

        {/* RH */}
        <ModuleCard
          icon="👥" title="RH & Pessoas" gerente="Leticia Perico"
          equipe={['Eduarda Colussi (supervisora)', 'Leticia Rosso (lib. exames)', 'Lucia Ap (limpeza)', 'Luis Oliveira (TI)']}
          sistema="Interno / Agilize" status="planejado"
          integracao="Integração com folha e ponto planejada. Dados de colaboradores, admissões, demissões e férias virão da contabilidade Agilize."
          metricas={[
            { label: 'Colaboradores', valor: '~50', obs: 'estimativa do quadro' },
            { label: 'Admissões/mês', valor: '—', obs: 'aguarda integração' },
            { label: 'Férias vencendo', valor: '—', obs: 'aguarda integração' },
            { label: 'Estagiários ativos', valor: '6+', obs: 'SafeHelp + outros' },
          ]}
          lui={[
            'Alerta de férias vencidas ou a vencer por colaborador',
            'Relatório de aniversários e datas comemorativas',
            'Controle de estagiários e validade de contratos',
            'Análise de turnover por área e empresa',
            'Indicadores de clima e satisfação (futuro)',
          ]}
          color="border-pink-900"
        />

        {/* PROCESSOS / SAFEHELP */}
        <ModuleCard
          icon="🔧" title="SafeHelp & Processos" gerente="Carlos Eduardo"
          equipe={['Lucas Alamini', 'Huender de Lima', 'Rafael Vieira', 'Herick', 'Kiria']}
          sistema="ClickUp + Interno" status="planejado"
          integracao="Integração com ClickUp planejada. Visibilidade de projetos, tarefas e automações em desenvolvimento pelo time de processos."
          metricas={[
            { label: 'Projetos ClickUp', valor: '20+', obs: 'em gestão' },
            { label: 'Automações ativas', valor: '—', obs: 'N8N / Make' },
            { label: 'SafeChat', valor: 'Dev', obs: 'em construção' },
            { label: 'SafeDocs', valor: 'Dev', obs: 'em construção' },
          ]}
          lui={[
            'Status dos projetos críticos em andamento',
            'Alertas de tarefas atrasadas no ClickUp',
            'Relatório de automações com falha nas últimas 24h',
            'Acompanhamento de entregáveis dos estagiários',
            'Visão do roadmap SafeHelp (SafeChat, SafeDocs, SafeApp)',
          ]}
          color="border-cyan-900"
        />
      </div>

      {/* Empresas */}
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Empresas do Grupo</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {[
          { nome: 'GP SafeWork', tipo: 'Holding', status: 'ativo' as const, ca: '✅' },
          { nome: 'SW Medianeira', tipo: 'SST Regional', status: 'pendente' as const, ca: '⏳' },
          { nome: 'SW Foz do Iguaçu', tipo: 'SST Regional', status: 'pendente' as const, ca: '⏳' },
          { nome: 'SW Santa Helena', tipo: 'SST Regional', status: 'pendente' as const, ca: '⏳' },
          { nome: 'SW Londrina', tipo: 'SST Regional', status: 'pendente' as const, ca: '⏳' },
          { nome: 'Safe+', tipo: 'Rede Credenciada', status: 'pendente' as const, ca: '⏳' },
          { nome: 'SafeT', tipo: 'Treinamentos', status: 'pendente' as const, ca: '⏳' },
          { nome: 'SafeR&S', tipo: 'NR-01 + R&S', status: 'pendente' as const, ca: '⏳' },
          { nome: 'SafeHelp', tipo: 'Produtos Digitais', status: 'planejado' as const, ca: '—' },
          { nome: 'SW Meio Ambiente', tipo: 'Em encerramento', status: 'encerrando' as const, ca: '⚠️' },
          { nome: 'SW Soluções', tipo: 'Em encerramento', status: 'encerrando' as const, ca: '⚠️' },
        ].map(e => (
          <div key={e.nome} className="bg-gray-900 rounded-lg p-3 border border-gray-800">
            <div className="flex justify-between items-start mb-1">
              <p className="text-sm font-medium text-gray-100 leading-tight">{e.nome}</p>
              <span className="text-sm ml-1">{e.ca}</span>
            </div>
            <p className="text-xs text-gray-500">{e.tipo}</p>
            <div className="mt-2"><Badge status={e.status} /></div>
          </div>
        ))}
      </div>

      {/* Integrações */}
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Status das Integrações</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {[
          { nome: 'Conta Azul', modulo: 'Financeiro', status: '✅ Ativo', detalhe: 'GP SafeWork (master)' },
          { nome: 'Z-API / WhatsApp', modulo: 'LUI', status: '✅ Ativo', detalhe: 'LUI ↔ Cleber' },
          { nome: 'Claude API', modulo: 'Todos agentes', status: '✅ Ativo', detalhe: 'Sonnet 4.6' },
          { nome: 'Supabase', modulo: 'Banco de dados', status: '✅ Ativo', detalhe: '24 tabelas' },
          { nome: 'SOC', modulo: 'Medicina + Eng.', status: '⏳ Pendente', detalhe: 'Próxima fase' },
          { nome: 'D4sign', modulo: 'Contratos', status: '⏳ Pendente', detalhe: 'Próxima fase' },
          { nome: 'RD Station', modulo: 'Comercial / CRM', status: '⏳ Pendente', detalhe: 'Próxima fase' },
          { nome: 'ClickUp', modulo: 'Processos', status: '○ Planejado', detalhe: 'Fase 2' },
        ].map(i => (
          <div key={i.nome} className="bg-gray-900 rounded-lg p-3 border border-gray-800">
            <p className="text-sm font-medium text-gray-100">{i.nome}</p>
            <p className="text-xs text-gray-500 mt-0.5">{i.modulo}</p>
            <p className="text-xs font-medium mt-2">{i.status}</p>
            <p className="text-xs text-gray-600">{i.detalhe}</p>
          </div>
        ))}
      </div>

      {/* Roadmap */}
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Roadmap</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { fase: 'Fase 1 — Fundação', status: '✅ Em execução', cor: 'border-green-800', itens: ['Schema Supabase (24 tabelas)', 'Conta Azul Mais integrado', 'LUI ativo (WhatsApp + Web)', 'Dashboard Financeiro', 'Login + Centro de Comando'] },
          { fase: 'Fase 2 — Dados Completos', status: '⏳ Próxima', cor: 'border-yellow-800', itens: ['7 empresas no Conta Azul', 'SOC → Medicina + Engenharia', 'D4sign → Contratos', 'RD Station → CRM', 'Agentes especializados por área'] },
          { fase: 'Fase 3 — SafeHelp', status: '○ Planejado', cor: 'border-gray-700', itens: ['SafeChat (atendimento SST)', 'SafeDocs (documentos IA)', 'SafeApp (app cliente)', 'Agente Secretária (WhatsApp clientes)', 'Dashboard por empresa'] },
          { fase: 'Fase 4 — Expansão', status: '○ Futuro', cor: 'border-gray-700', itens: ['Pluggy → Open Finance', 'Unisyst ERP nativo', 'SafeBank consolidado', 'SafeLicita + SafeCarbon', 'ERP próprio GP SafeWork'] },
        ].map(f => (
          <div key={f.fase} className={`bg-gray-900 rounded-xl p-4 border ${f.cor}`}>
            <p className="text-xs font-semibold text-gray-300 mb-1">{f.fase}</p>
            <p className="text-xs mb-3">{f.status}</p>
            <ul className="space-y-1.5">
              {f.itens.map((item, i) => (
                <li key={i} className="text-xs text-gray-400 flex gap-1.5">
                  <span className="text-gray-600 shrink-0">·</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </main>
  )
}
