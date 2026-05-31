import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { createClient as sb } from '@supabase/supabase-js'

function Badge({ status }: { status: 'ativo' | 'pendente' | 'planejado' | 'encerrando' }) {
  const styles = {
    ativo:      'bg-emerald-100 text-emerald-800 border border-green-800',
    pendente:   'bg-amber-100 text-amber-800 border border-yellow-800',
    planejado:  'bg-slate-100 text-slate-500 border border-slate-300',
    encerrando: 'bg-red-900/30 text-red-700 border border-red-900',
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
    <div className={`bg-white rounded-xl border ${color} flex flex-col`}>
      {/* Header */}
      <div className="p-4 border-b border-slate-200">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">{icon}</span>
            <h3 className="font-semibold text-slate-900">{title}</h3>
          </div>
          <Badge status={status} />
        </div>
        <p className="text-xs text-slate-500">Gerente: <span className="text-slate-800">{gerente}</span></p>
        <div className="flex flex-wrap gap-1 mt-2">
          {equipe.map(p => (
            <span key={p} className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{p}</span>
          ))}
        </div>
      </div>

      {/* Integração */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="text-slate-500">Sistema fonte</span>
          <span className={`font-medium ${status === 'ativo' ? 'text-emerald-700' : 'text-amber-700'}`}>{sistema}</span>
        </div>
        <p className="text-xs text-slate-500">{integracao}</p>
      </div>

      {/* Métricas */}
      <div className="px-4 py-3 grid grid-cols-2 gap-2 border-t border-slate-200/50">
        {metricas.map((m, i) => (
          <div key={i} className="bg-slate-100 rounded-lg p-2">
            <p className="text-xs text-slate-500">{m.label}</p>
            <p className="text-sm font-semibold text-slate-900 mt-0.5">{m.valor}</p>
            {m.obs && <p className="text-xs text-slate-500">{m.obs}</p>}
          </div>
        ))}
      </div>

      {/* LUI */}
      <div className="px-4 py-3 border-t border-slate-200/50 mt-auto">
        <p className="text-xs text-blue-700 font-medium mb-1.5">🤖 LUI neste módulo</p>
        <ul className="space-y-1">
          {lui.map((item, i) => (
            <li key={i} className="text-xs text-slate-500 flex gap-1.5">
              <span className="text-slate-500 shrink-0">→</span>
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
    <main className="min-h-screen bg-slate-50 text-slate-800">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white">
        <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6">
          <a href="/dashboard" className="text-blue-200/80 text-sm hover:text-white inline-block mb-2">← Centro de Comando</a>
          <h1 className="text-2xl font-bold tracking-tight">Visão do Sistema — GP SafeWork</h1>
          <p className="text-blue-100/90 text-sm">Todos os módulos, integrações e como o LUI atua em cada área</p>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6 md:py-8">

      {/* LUI — Centro */}
      <div className="bg-gradient-to-r from-blue-50 to-white rounded-xl border border-blue-800 p-5 mb-8">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-900 flex items-center justify-center text-xl font-bold shrink-0">L</div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-lg">LUI — Orquestrador CEO</h2>
              <span className="flex items-center gap-1 text-xs text-emerald-700"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />Ativo</span>
            </div>
            <p className="text-slate-500 text-sm">Agente principal que comanda e coordena todos os outros. Especialista com visão de CFO+COO do grupo.</p>
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
            <div key={item.label} className="bg-blue-50 rounded-lg p-3 text-center">
              <p className="text-lg mb-1">{item.icon}</p>
              <p className="text-sm font-semibold text-blue-100">{item.val}</p>
              <p className="text-xs text-blue-700">{item.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Agentes Especializados — títulos */}
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Módulos e Agentes Especializados</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 mb-8">

        {/* FINANCEIRO */}
        <ModuleCard
          icon="💰" title="Financeiro — Agente Plata" gerente="Evelyn Lavyne (supervisora)"
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
          icon="🏥" title="Medicina — Agente Lari" gerente="Larissa Vargas"
          equipe={['Clínica Medianeira', 'Clínica Foz', 'Clínica Santa Helena', 'Clínica Londrina', 'New Life (parceira)', 'Agendamentos Safe+']}
          sistema="SOC" status="ativo"
          integracao="SOC integrado via ExportaDados. ASOs, exames, consultas e histórico de atendimentos sincronizados em tempo real. +33.000 atendimentos/ano processados."
          metricas={[
            { label: 'Clínicas próprias', valor: '4', obs: 'Medianeira, Foz, SH, Londrina' },
            { label: 'Atendimentos 2025', valor: '31.483', obs: 'Jan–Dez · SOC' },
            { label: 'Atendimentos 2026', valor: '12.382+', obs: 'Jan–Abr parcial' },
            { label: 'Tipos de ASO', valor: '5', obs: 'Adm/Per/Dem/Ret/MF' },
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
          icon="⚙️" title="Engenharia — Agente Dieguito" gerente="Diego Chies"
          equipe={['Jhonatan Almeida (Safe+)', 'Carla de Lima (adm)', 'Tiago (TST Foz)', 'Eduardo (TST Londrina)', 'Hillyard (TST)', 'Dani (TRES Foz)', 'Bruna Amarante (e-Social)']}
          sistema="SOC" status="ativo"
          integracao="SOC integrado. GHEs com insalubridade/periculosidade/aposentadoria especial, EPIs, laudos técnicos e documentos vencendo acessíveis via ExportaDados."
          metricas={[
            { label: 'GHEs monitorados', valor: 'SOC live', obs: 'riscos por empresa' },
            { label: 'EPIs cadastrados', valor: 'SOC live', obs: 'entregas + CA' },
            { label: 'Docs vencendo 60d', valor: 'SOC live', obs: 'PGR, LTCAT, PCMSO' },
            { label: 'Conformidade NR', valor: 'SOC live', obs: 'NR-10, NR-35, NR-33' },
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
          icon="📈" title="Comercial — Agente Luizito" gerente="Luis Rabelo"
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

        {/* ESTRATÉGIA */}
        <ModuleCard
          icon="🎯" title="Estratégia — Agente Nina" gerente="Cleber (CEO)"
          equipe={['Análise autônoma da carteira', 'Relatório toda segunda-feira 7h']}
          sistema="SOC + Supabase" status="ativo"
          integracao="Nina analisa automaticamente toda a carteira de clientes SOC. Identifica oportunidades de upsell, churn risk, ticket baixo e serviços ausentes. Relatório semanal via WhatsApp + dashboard /comercial."
          metricas={[
            { label: 'Frequência', valor: '2ª-feira', obs: 'cron 07h BRT' },
            { label: 'Empresas analisadas', valor: 'até 200', obs: 'vidas > 3' },
            { label: 'Top oportunidades', valor: '10/semana', obs: 'por receita potencial' },
            { label: 'Canal de entrega', valor: 'WhatsApp', obs: '+ /dashboard/comercial' },
          ]}
          lui={[
            'Segunda-feira: bloco 🎯 Nina no briefing com top oportunidade da semana',
            'Receita potencial identificada na carteira atual',
            'Empresas com churn risk (sem exame em 90 dias)',
            'GHEs com insalubridade sem audiometria (NHO-01)',
            'Empresas com ticket muito abaixo do potencial',
          ]}
          color="border-purple-900"
        />

        {/* RH */}
        <ModuleCard
          icon="👥" title="RH & Pessoas — Agente Le" gerente="Leticia Perico"
          equipe={['Eduarda Colussi (supervisora)', 'Leticia Rosso (lib. exames)', 'Lucia Ap (limpeza)', 'Luis Oliveira (TI)']}
          sistema="Conta Azul + planilha RH" status="ativo"
          integracao="Custo real de pessoal via Conta Azul (folha CLT/PJ/estágio/encargos) + planilha RH consolidada com headcount, turnover, CTSE e custo por unidade/vínculo."
          metricas={[
            { label: 'Colaboradores', valor: '68', obs: 'planilha Nov/2025' },
            { label: 'Turnover acum.', valor: '59,6%', obs: 'vs 118% em 2024' },
            { label: 'CTSE 2025', valor: 'R$ 1,96M', obs: 'Jan-Nov · planilha' },
            { label: 'PJ vs CLT', valor: '79%/14%', obs: 'modelo majoritário PJ' },
          ]}
          lui={[
            'Análise de custo por unidade (GP matriz concentra 41%)',
            'Comparativo YoY de CTSE e movimentação',
            'Alerta de turnover elevado por área',
            'Custo médio por colaborador / por vínculo',
            'Tempo de contratação vs meta (atual 53d, meta 30d)',
          ]}
          color="border-teal-900"
        />

        {/* PROCESSOS / SAFEHELP */}
        <ModuleCard
          icon="🔧" title="Processos — Agente Carlitos" gerente="Carlos Eduardo"
          equipe={['Lucas Alamini', 'Huender de Lima', 'Rafael Vieira', 'Herick', 'Kiria']}
          sistema="Interno (ClickUp planejado)" status="ativo"
          integracao="Agente Carlitos ativo com chat dedicado e briefing diário. Acompanha SafeHelp (SafeChat/SafeDocs/SafeApp), processos transversais (onboarding, renovações, migração Unisyst) e o time de 5 estagiários. Indicadores quantitativos pendem da integração ClickUp."
          metricas={[
            { label: 'Produtos SafeHelp', valor: '3', obs: 'planejados' },
            { label: 'Processos monitorados', valor: '5', obs: '2 em atenção' },
            { label: 'Estagiários', valor: '5', obs: 'front/back/QA' },
            { label: 'ClickUp', valor: '—', obs: 'pendente integração' },
          ]}
          lui={[
            'Gargalo do onboarding (53d vs meta 30d)',
            'Status da migração Conta Azul → Unisyst',
            'Roadmap SafeHelp (SafeChat, SafeDocs, SafeApp)',
            'Saúde do time de tech (carga, releases)',
            'Quando ClickUp integrar: tarefas atrasadas + automações',
          ]}
          color="border-indigo-900"
        />
      </div>

      {/* Empresas */}
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Empresas do Grupo</h2>
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
          <div key={e.nome} className="bg-white rounded-lg p-3 border border-slate-200">
            <div className="flex justify-between items-start mb-1">
              <p className="text-sm font-medium text-slate-900 leading-tight">{e.nome}</p>
              <span className="text-sm ml-1">{e.ca}</span>
            </div>
            <p className="text-xs text-slate-500">{e.tipo}</p>
            <div className="mt-2"><Badge status={e.status} /></div>
          </div>
        ))}
      </div>

      {/* Integrações */}
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Status das Integrações</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {[
          { nome: 'Conta Azul', modulo: 'Financeiro', status: '✅ Ativo', detalhe: 'GP SafeWork (master)' },
          { nome: 'Z-API / WhatsApp', modulo: 'LUI', status: '✅ Ativo', detalhe: 'LUI ↔ Cleber' },
          { nome: 'Claude API', modulo: 'Todos agentes', status: '✅ Ativo', detalhe: 'Sonnet 4.6' },
          { nome: 'Supabase', modulo: 'Banco de dados', status: '✅ Ativo', detalhe: '25+ tabelas' },
          { nome: 'Pluggy / Open Finance', modulo: 'Saldos bancários', status: '⏳ Aguardando credenciais', detalhe: 'Infraestrutura pronta' },
          { nome: 'SOC', modulo: 'Medicina + Eng.', status: '✅ Ativo', detalhe: 'ExportaDados configurado' },
          { nome: 'D4sign', modulo: 'Contratos', status: '⏳ Pendente', detalhe: 'Próxima fase' },
          { nome: 'RD Station', modulo: 'Comercial / CRM', status: '⏳ Pendente', detalhe: 'Próxima fase' },
          { nome: 'ClickUp', modulo: 'Processos', status: '○ Planejado', detalhe: 'Fase 2' },
        ].map(i => (
          <div key={i.nome} className="bg-white rounded-lg p-3 border border-slate-200">
            <p className="text-sm font-medium text-slate-900">{i.nome}</p>
            <p className="text-xs text-slate-500 mt-0.5">{i.modulo}</p>
            <p className="text-xs font-medium mt-2">{i.status}</p>
            <p className="text-xs text-slate-500">{i.detalhe}</p>
          </div>
        ))}
      </div>

      {/* Roadmap */}
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Roadmap</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { fase: 'Fase 1 — Fundação', status: '✅ Concluída', cor: 'border-green-800', itens: ['Schema Supabase (25+ tabelas)', 'Conta Azul Mais integrado', 'SOC integrado (ExportaDados)', 'LUI ativo (WhatsApp + Web)', 'Agentes: Plata, Lari, Dieguito, Luizito, Le, Carlitos, Nina'] },
          { fase: 'Fase 2 — Dados Completos', status: '🟡 Em andamento', cor: 'border-yellow-800', itens: ['7 empresas no Conta Azul', 'Pluggy / Open Finance (credenciais)', 'D4sign → Contratos', 'RD Station → CRM', 'ClickUp → Processos / Carlitos'] },
          { fase: 'Fase 3 — SafeHelp', status: '○ Planejado', cor: 'border-slate-300', itens: ['SafeChat (atendimento SST)', 'SafeDocs (documentos IA)', 'SafeApp (app cliente)', 'Agente Secretária (WhatsApp clientes)', 'Dashboard por empresa'] },
          { fase: 'Fase 4 — Expansão', status: '○ Futuro', cor: 'border-slate-300', itens: ['Unisyst ERP nativo', 'SafeBank consolidado', 'SafeLicita + SafeCarbon', 'ERP próprio GP SafeWork', 'Multi-tenant por empresa'] },
        ].map(f => (
          <div key={f.fase} className={`bg-white rounded-xl p-4 border ${f.cor}`}>
            <p className="text-xs font-semibold text-slate-700 mb-1">{f.fase}</p>
            <p className="text-xs mb-3">{f.status}</p>
            <ul className="space-y-1.5">
              {f.itens.map((item, i) => (
                <li key={i} className="text-xs text-slate-500 flex gap-1.5">
                  <span className="text-slate-500 shrink-0">·</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      </div>
    </main>
  )
}
