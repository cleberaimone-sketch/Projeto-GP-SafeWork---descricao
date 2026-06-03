import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

const MODULOS = [
  {
    id: 'core',
    nome: 'GP OS Core',
    descricao: 'Fonte única da verdade: cadastros, eventos, permissões e auditoria de todo o ecossistema.',
    status: 'design' as const,
    cor: 'border-violet-400',
    destaque: true,
    icone: '⬡',
  },
  {
    id: 'command',
    nome: 'GP Command Center',
    descricao: 'Portal Executivo: dashboards, agentes gestores, war room, briefing diário e alertas.',
    status: 'ativo' as const,
    cor: 'border-emerald-400',
    icone: '◈',
  },
  {
    id: 'sales',
    nome: 'GP Sales IA',
    descricao: 'Máquina comercial autônoma: leads, scoring, propostas, contratos, follow-up e checkout.',
    status: 'dev' as const,
    cor: 'border-blue-400',
    icone: '◉',
  },
  {
    id: 'erp',
    nome: 'GP ERP Core',
    descricao: 'Financeiro próprio: DRE, fluxo de caixa, notas fiscais e gestão fiscal da holding.',
    status: 'planejado' as const,
    cor: 'border-slate-500',
    icone: '◫',
  },
  {
    id: 'sst',
    nome: 'GP SST Core',
    descricao: 'Operações SST: ASOs, treinamentos NR, PCMSO, PGR, LTCAT e eSocial.',
    status: 'planejado' as const,
    cor: 'border-slate-500',
    icone: '◫',
  },
  {
    id: 'client',
    nome: 'GP Client Portal',
    descricao: 'Portal do cliente: acesso a documentos, histórico de atendimentos e agendamentos.',
    status: 'planejado' as const,
    cor: 'border-slate-500',
    icone: '◫',
  },
  {
    id: 'field',
    nome: 'GP Field App',
    descricao: 'App mobile para técnicos SST e trabalhadores: ASO digital, treinamentos e inspeções.',
    status: 'planejado' as const,
    cor: 'border-slate-500',
    icone: '◫',
  },
  {
    id: 'network',
    nome: 'GP Network',
    descricao: 'Gestão da rede credenciada Safe+: parceiros, credenciamento e repasses.',
    status: 'planejado' as const,
    cor: 'border-slate-500',
    icone: '◫',
  },
  {
    id: 'agents',
    nome: 'GP AI Agents',
    descricao: 'Camada de agentes IA: LUI, Plata, Lari, Dieguito, Le, Luizito, Carlitos e Nina.',
    status: 'ativo' as const,
    cor: 'border-amber-400',
    icone: '◈',
  },
]

const ENTIDADES_CORE = [
  { grupo: 'Estrutura', itens: ['Empresas do grupo', 'Unidades', 'CNPJs'] },
  { grupo: 'Pessoas', itens: ['Usuários', 'Perfis de acesso', 'Clientes', 'Contatos', 'Trabalhadores'] },
  { grupo: 'Serviços', itens: ['Serviços', 'Contratos', 'Ordens de serviço'] },
  { grupo: 'Operação', itens: ['Eventos', 'Tarefas', 'Aprovações'] },
  { grupo: 'Auditoria', itens: ['Logs de auditoria'] },
  { grupo: 'IA', itens: ['Agentes', 'Memórias dos agentes'] },
]

const EVENTOS = [
  { tipo: 'lead_criado',              origem: 'GP Sales IA',    cor: 'text-blue-400' },
  { tipo: 'lead_qualificado',         origem: 'GP Sales IA',    cor: 'text-blue-400' },
  { tipo: 'proposta_gerada',          origem: 'GP Sales IA',    cor: 'text-blue-400' },
  { tipo: 'venda_fechada',            origem: 'GP Sales IA',    cor: 'text-emerald-400' },
  { tipo: 'pagamento_confirmado',     origem: 'GP ERP Core',    cor: 'text-emerald-400' },
  { tipo: 'cliente_criado',           origem: 'GP OS Core',     cor: 'text-violet-400' },
  { tipo: 'contrato_gerado',          origem: 'GP Sales IA / D4sign', cor: 'text-blue-400' },
  { tipo: 'contrato_assinado',        origem: 'D4sign',         cor: 'text-emerald-400' },
  { tipo: 'ordem_servico_aberta',     origem: 'GP SST Core',    cor: 'text-amber-400' },
  { tipo: 'exame_agendado',           origem: 'GP SST Core',    cor: 'text-amber-400' },
  { tipo: 'visita_tecnica_agendada',  origem: 'GP SST Core',    cor: 'text-amber-400' },
  { tipo: 'documento_entregue',       origem: 'GP SST Core / D4sign', cor: 'text-amber-400' },
  { tipo: 'fatura_gerada',            origem: 'GP ERP Core',    cor: 'text-slate-400' },
  { tipo: 'pagamento_recebido',       origem: 'GP ERP Core / Conta Azul', cor: 'text-emerald-400' },
  { tipo: 'alerta_critico',           origem: 'Qualquer módulo → LUI', cor: 'text-red-400' },
]

const AGENTES = [
  { nome: 'LUI',       papel: 'CEO Virtual · Integrador',           modelo: 'Opus 4.7',   status: 'ativo', acesso: 'Todos os KPIs, alertas, briefings' },
  { nome: 'Plata',     papel: 'CFO Digital',                        modelo: 'Sonnet 4.6', status: 'ativo', acesso: 'Lançamentos, saldos, DRE, metas' },
  { nome: 'Lari',      papel: 'Gerente Digital Medicina',           modelo: 'Sonnet 4.6', status: 'ativo', acesso: 'ASOs, atendimentos SOC, vencimentos' },
  { nome: 'Dieguito',  papel: 'Gerente Digital Engenharia SST',     modelo: 'Sonnet 4.6', status: 'ativo', acesso: 'Programas SST, NRs, inspeções' },
  { nome: 'Carlitos',  papel: 'Gerente Digital Processos',          modelo: 'Opus 4.7',   status: 'ativo', acesso: 'Relatórios estratégicos, processos' },
  { nome: 'Luizito',   papel: 'Gerente Digital Comercial',          modelo: 'Sonnet 4.6', status: 'ativo', acesso: 'Contratos, renovações, alertas D4sign' },
  { nome: 'Le',        papel: 'Gerente Digital RH',                 modelo: 'Sonnet 4.6', status: 'ativo', acesso: 'Headcount, folha, CTSE' },
  { nome: 'Nina',      papel: 'Secretária Digital',                 modelo: 'Sonnet 4.6', status: 'pendente', acesso: 'Agenda, tarefas, triagem WhatsApp' },
  { nome: 'SafeChat',  papel: 'Atendimento Externo a Clientes',     modelo: 'Sonnet 4.6', status: 'pendente', acesso: 'Base de conhecimento SST' },
]

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  ativo:     { label: '● Ativo',        cls: 'text-emerald-400 border-emerald-800' },
  dev:       { label: '◐ Em dev',       cls: 'text-blue-400 border-blue-800' },
  design:    { label: '◌ Em design',    cls: 'text-violet-400 border-violet-800' },
  planejado: { label: '○ Planejado',    cls: 'text-slate-500 border-slate-700' },
  pendente:  { label: '◌ Pendente',     cls: 'text-amber-400 border-amber-800' },
}

export default async function OSArquiteturaPage() {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) redirect('/login')

  return (
    <main className="min-h-screen" style={{ background: 'var(--paper)', color: 'var(--ink)' }}>

      {/* ── MASTHEAD ── */}
      <header style={{ borderTop: '4px solid var(--ink)' }}>
        <div className="max-w-screen-2xl mx-auto px-6 md:px-10 pt-5">
          <div className="flex items-end justify-between pb-4" style={{ borderBottom: '2px solid var(--ink)' }}>
            <div>
              <p className="eyebrow mb-2" style={{ color: 'var(--ink-3)' }}>
                GP SafeWork OS · Arquitetura do Ecossistema
              </p>
              <h1 className="font-display font-bold leading-none tracking-tight text-5xl md:text-7xl" style={{ color: 'var(--ink)' }}>
                GP SafeWork OS
              </h1>
            </div>
            <div className="text-right shrink-0 hidden md:block pb-1">
              <p className="eyebrow mb-1" style={{ color: 'var(--ink-3)' }}>Portal Executivo v1</p>
              <p className="font-mono text-sm font-medium" style={{ color: 'var(--ink-3)' }}>GP Command Center</p>
              <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold border border-emerald-600 text-emerald-700">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Módulo ativo
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex gap-6 py-3 overflow-x-auto text-sm font-medium" style={{ color: 'var(--ink-3)' }}>
            {[
              ['/', 'Centro de Comando'],
              ['/dashboard/financeiro', 'Financeiro'],
              ['/dashboard/medicina', 'Medicina'],
              ['/dashboard/engenharia', 'Engenharia'],
              ['/dashboard/rh', 'RH'],
              ['/dashboard/comercial', 'Comercial'],
              ['/dashboard/sistema', 'Sistemas'],
              ['/dashboard/os', 'GP OS'],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                className={`shrink-0 pb-2 hover:text-[var(--ink)] transition-colors ${href === '/dashboard/os' ? 'font-bold border-b-2 border-[var(--ink)] text-[var(--ink)]' : ''}`}
              >
                {label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <div className="max-w-screen-2xl mx-auto px-6 md:px-10 py-10 space-y-16">

        {/* ── VISÃO GERAL ── */}
        <section>
          <p className="eyebrow mb-3" style={{ color: 'var(--ink-3)' }}>Visão geral</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="p-5 rounded-xl border" style={{ borderColor: 'var(--rule)', background: 'var(--surface)' }}>
              <p className="eyebrow mb-1" style={{ color: 'var(--ink-4)' }}>Este módulo</p>
              <p className="font-display font-bold text-2xl" style={{ color: 'var(--ink)' }}>GP Command Center</p>
              <p className="text-sm mt-1" style={{ color: 'var(--ink-3)' }}>Portal Executivo do GP SafeWork OS</p>
            </div>
            <div className="p-5 rounded-xl border" style={{ borderColor: 'var(--rule)', background: 'var(--surface)' }}>
              <p className="eyebrow mb-1" style={{ color: 'var(--ink-4)' }}>Módulos totais</p>
              <p className="font-display font-bold text-2xl" style={{ color: 'var(--ink)' }}>9 módulos</p>
              <p className="text-sm mt-1" style={{ color: 'var(--ink-3)' }}>2 ativos · 1 em dev · 6 planejados</p>
            </div>
            <div className="p-5 rounded-xl border" style={{ borderColor: 'var(--rule)', background: 'var(--surface)' }}>
              <p className="eyebrow mb-1" style={{ color: 'var(--ink-4)' }}>Agentes IA</p>
              <p className="font-display font-bold text-2xl" style={{ color: 'var(--ink)' }}>9 agentes</p>
              <p className="text-sm mt-1" style={{ color: 'var(--ink-3)' }}>7 ativos · 2 pendentes de instância</p>
            </div>
          </div>
        </section>

        {/* ── MÓDULOS DO ECOSSISTEMA ── */}
        <section>
          <p className="eyebrow mb-1" style={{ color: 'var(--ink-3)' }}>Módulos do ecossistema</p>
          <h2 className="font-display font-bold text-3xl mb-6" style={{ color: 'var(--ink)' }}>Arquitetura GP SafeWork OS</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {MODULOS.map((m) => {
              const s = STATUS_LABELS[m.status]
              return (
                <div
                  key={m.id}
                  className={`p-5 rounded-xl border-2 ${m.cor} ${m.destaque ? 'lg:col-span-3' : ''}`}
                  style={{ background: 'var(--surface)' }}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-2xl" style={{ color: 'var(--ink-3)' }}>{m.icone}</span>
                      <h3 className="font-semibold text-base" style={{ color: 'var(--ink)' }}>{m.nome}</h3>
                    </div>
                    <span className={`text-[11px] font-mono px-2 py-0.5 rounded border shrink-0 ${s.cls}`}>
                      {s.label}
                    </span>
                  </div>
                  <p className="text-sm" style={{ color: 'var(--ink-3)' }}>{m.descricao}</p>
                  {m.destaque && (
                    <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--rule)' }}>
                      <p className="text-xs font-semibold mb-1" style={{ color: 'var(--ink-4)' }}>Próximo passo</p>
                      <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
                        Criar schema <code className="font-mono text-violet-400">os_eventos</code> + campos <code className="font-mono text-violet-400">os_global_id</code> nas tabelas core — sem breaking changes.
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* ── GP OS CORE — ENTIDADES ── */}
        <section>
          <p className="eyebrow mb-1" style={{ color: 'var(--ink-3)' }}>GP OS Core</p>
          <h2 className="font-display font-bold text-3xl mb-2" style={{ color: 'var(--ink)' }}>Fonte única da verdade</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--ink-3)' }}>
            O Core centralizará todos os cadastros do ecossistema. Os módulos mapeiam seus IDs locais via <code className="font-mono">os_global_id</code> — sem migração forçada.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {ENTIDADES_CORE.map((grupo) => (
              <div key={grupo.grupo} className="p-4 rounded-xl border" style={{ borderColor: 'var(--rule)', background: 'var(--surface)' }}>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--ink-4)' }}>
                  {grupo.grupo}
                </p>
                <ul className="space-y-1">
                  {grupo.itens.map((item) => (
                    <li key={item} className="text-xs" style={{ color: 'var(--ink-3)' }}>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* ── EVENTOS DO ECOSSISTEMA ── */}
        <section>
          <p className="eyebrow mb-1" style={{ color: 'var(--ink-3)' }}>Barramento de eventos</p>
          <h2 className="font-display font-bold text-3xl mb-6" style={{ color: 'var(--ink)' }}>Eventos do ecossistema</h2>

          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--rule)' }}>
            <div className="grid grid-cols-3 px-4 py-2 text-[11px] font-bold uppercase tracking-widest" style={{ background: 'var(--surface)', color: 'var(--ink-4)', borderBottom: '1px solid var(--rule)' }}>
              <span>Evento</span>
              <span>Origem</span>
              <span className="hidden md:block">Consumidor principal</span>
            </div>
            {EVENTOS.map((ev, i) => (
              <div
                key={ev.tipo}
                className="grid grid-cols-3 px-4 py-2.5 text-xs"
                style={{ borderBottom: i < EVENTOS.length - 1 ? '1px solid var(--rule)' : 'none', background: i % 2 === 0 ? 'transparent' : 'var(--surface)' }}
              >
                <code className={`font-mono font-medium ${ev.cor}`}>{ev.tipo}</code>
                <span style={{ color: 'var(--ink-3)' }}>{ev.origem}</span>
                <span className="hidden md:block" style={{ color: 'var(--ink-4)' }}>
                  {ev.tipo === 'alerta_critico' ? 'LUI → Centro de Comando' : 'GP Command Center'}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ── AGENTES GESTORES ── */}
        <section>
          <p className="eyebrow mb-1" style={{ color: 'var(--ink-3)' }}>Governança de IA</p>
          <h2 className="font-display font-bold text-3xl mb-2" style={{ color: 'var(--ink)' }}>Agentes gestores</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--ink-3)' }}>
            Agentes não operam soltos. Cada ação usa dados reais, memória operacional, permissões, logs e aprovação humana quando necessário.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {AGENTES.map((ag) => {
              const s = STATUS_LABELS[ag.status]
              return (
                <div key={ag.nome} className="p-4 rounded-xl border" style={{ borderColor: 'var(--rule)', background: 'var(--surface)' }}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="font-bold text-base" style={{ color: 'var(--ink)' }}>{ag.nome}</p>
                      <p className="text-xs" style={{ color: 'var(--ink-3)' }}>{ag.papel}</p>
                    </div>
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0 ${s.cls}`}>
                      {s.label}
                    </span>
                  </div>
                  <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--rule)' }}>
                    <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--ink-4)' }}>Dados que acessa</p>
                    <p className="text-xs" style={{ color: 'var(--ink-3)' }}>{ag.acesso}</p>
                  </div>
                  <p className="mt-2 text-[10px] font-mono" style={{ color: 'var(--ink-4)' }}>{ag.modelo}</p>
                </div>
              )
            })}
          </div>

          {/* Princípios de governança */}
          <div className="mt-6 p-5 rounded-xl border" style={{ borderColor: 'var(--rule)', background: 'var(--surface)' }}>
            <p className="eyebrow mb-3" style={{ color: 'var(--ink-3)' }}>Princípios de governança dos agentes</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                ['Dados reais', 'Contexto carregado do Supabase em cada sessão'],
                ['Memória operacional', 'memorias_agentes persistida entre conversas'],
                ['Auditoria', 'Toda ação registrada em os_eventos + logs'],
                ['Aprovação humana', 'Ações críticas aguardam confirmação do Cleber'],
              ].map(([titulo, desc]) => (
                <div key={titulo}>
                  <p className="text-xs font-semibold mb-0.5" style={{ color: 'var(--ink)' }}>{titulo}</p>
                  <p className="text-xs" style={{ color: 'var(--ink-4)' }}>{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── ROADMAP DE MÓDULOS ── */}
        <section>
          <p className="eyebrow mb-1" style={{ color: 'var(--ink-3)' }}>Roadmap</p>
          <h2 className="font-display font-bold text-3xl mb-6" style={{ color: 'var(--ink)' }}>Próximos passos</h2>

          <div className="space-y-3">
            {[
              {
                fase: 'Imediato',
                cor: 'border-l-emerald-500',
                itens: [
                  'Aplicar migration mensagens_wpp_mirror (Supabase SQL Editor)',
                  'Configurar webhook WhatsApp Mirror (linha 45999099009)',
                  'Configurar D4SIGN_TOKEN_API no Vercel',
                ],
              },
              {
                fase: 'Curto prazo',
                cor: 'border-l-blue-500',
                itens: [
                  'Pluggy produção → reconectar contas bancárias quando e-mail chegar',
                  'SafeChat com instância Z-API/Evolution dedicada',
                  'Migration os_eventos + os_global_id (sem breaking changes)',
                ],
              },
              {
                fase: 'Médio prazo',
                cor: 'border-l-amber-500',
                itens: [
                  'API POST /api/os/eventos para receber eventos do GP Sales IA',
                  'Painel de KPIs do Sales IA no Portal Executivo',
                  'Feed de eventos do ecossistema no Centro de Comando',
                ],
              },
              {
                fase: 'Longo prazo',
                cor: 'border-l-violet-500',
                itens: [
                  'GP OS Core em pé → sincronizar os_global_id',
                  'RBAC unificado cross-módulo',
                  'GP ERP Core substituindo Conta Azul / Unisyst',
                ],
              },
            ].map((fase) => (
              <div key={fase.fase} className={`pl-4 border-l-4 ${fase.cor} py-2`}>
                <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--ink-3)' }}>{fase.fase}</p>
                <ul className="space-y-1">
                  {fase.itens.map((item) => (
                    <li key={item} className="text-sm flex gap-2" style={{ color: 'var(--ink)' }}>
                      <span style={{ color: 'var(--ink-4)' }}>—</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* ── FOOTER ── */}
        <footer className="pt-6" style={{ borderTop: '1px solid var(--rule)' }}>
          <p className="text-xs" style={{ color: 'var(--ink-4)' }}>
            GP SafeWork OS · Centro de Comando v2.0 · Portal Executivo · Documentação completa em{' '}
            <code className="font-mono">PLANO_PORTAL_EXECUTIVO_GP_OS.md</code> e{' '}
            <code className="font-mono">GP_OS_CORE_ADAPTATION_PLAN.md</code>
          </p>
        </footer>

      </div>
    </main>
  )
}
