import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LuiChat from './LuiChat'
import BriefingActions from './BriefingActions'
import MemoriasPanel from '../components/MemoriasPanel'
import WarRoom, { type WarRoomData, type AlertaCritico } from './WarRoom'
import {
  carregarCategoriasExcluidas,
  filtrarParaDRE,
  isTransferenciaInterna,
} from '@/lib/financeiro/regras'
import {
  getEntregasEpi,
  getExamesPeriodo,
  getTodosFuncionarios,
  getRiscos,
  getLicencasPeriodo,
  socConfigurado,
} from '@/lib/soc/client'

type Briefing = {
  id: string
  data_briefing: string
  conteudo: string
  resumo: string
  enviado: boolean
  enviado_em: string | null
  created_at: string
}

type Lancamento = {
  tipo: string
  status: string | null
  valor: number | null
  categoria: string | null
  data_vencimento: string | null
  data_pagamento: string | null
  empresa_id: string | null
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function ddmmAnoPg(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
}

function isConsultaOcupacional(nomeExame?: string): boolean {
  if (!nomeExame) return true
  const n = nomeExame.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  return n.includes('CONSULTA') || n.includes('CLINICO') || n.includes('ASO')
}

function parseDataSoc(str?: string): Date | null {
  if (!str) return null
  if (str.includes('/')) {
    const p = str.split('/')
    return new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]))
  }
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]))
  return null
}

export default async function LuiPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const sb = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // ── Referências de data ───────────────────────────────────────────────────
  const hoje = new Date()
  const hojeISO = hoje.toISOString().split('T')[0]
  const anoMesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
  const antMes = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
  const anoMesAnt = `${antMes.getFullYear()}-${String(antMes.getMonth() + 1).padStart(2, '0')}`
  const d30Atras = new Date(hoje); d30Atras.setDate(hoje.getDate() - 30)
  const d365Atras = new Date(hoje); d365Atras.setDate(hoje.getDate() - 365)

  // ── Queries paralelas — chat, financeiro, sistema ─────────────────────────
  const [
    { data: conversaDashboard },
    { data: syncRecente },
    { data: briefingsRaw },
    { data: conversaWhatsapp },
    { data: lancamentosRaw },
    { data: saldosAtivos },
    { data: tokensContaAzul },
    { data: empresasList },
    excluidas,
  ] = await Promise.all([
    sb.from('conversas_ia')
      .select('mensagens')
      .eq('agente', 'lui')
      .eq('canal', 'dashboard')
      .eq('contato_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1),
    sb.from('sync_log')
      .select('fonte, status, finalizado_em, registros_processados')
      .order('finalizado_em', { ascending: false })
      .limit(5),
    sb.from('briefings_diarios')
      .select('id, data_briefing, conteudo, resumo, enviado, enviado_em, created_at')
      .order('data_briefing', { ascending: false })
      .limit(7),
    sb.from('conversas_ia')
      .select('updated_at, tokens_usados')
      .eq('agente', 'LUI')
      .eq('canal', 'whatsapp')
      .order('updated_at', { ascending: false })
      .limit(1),
    // Lançamentos dos últimos 12 meses (suficiente pro War Room)
    sb.from('lancamentos_financeiros')
      .select('tipo, status, valor, categoria, data_vencimento, data_pagamento, empresa_id')
      .neq('status', 'cancelado')
      .gte('data_vencimento', `${antMes.getFullYear() - 1}-01-01`),
    sb.from('v_saldos_ativos').select('saldo, empresa_id, nome_exibicao'),
    sb.from('conta_azul_tokens').select('empresa_nome, empresa_id'),
    sb.from('empresas').select('id, nome_curto'),
    carregarCategoriasExcluidas(sb),
  ])

  // ── Dados SOC (opcionais) — best effort ────────────────────────────────────
  const socOk = socConfigurado()
  let funcionarios: Array<{ SITUACAO?: string; NOMEFUNCIONARIO?: string }> = []
  let examesAno: Array<{ NOMEFUNCIONARIO?: string; DATAFICHA?: string; NOMEEXAME?: string }> = []
  let examesMes: Array<{ DATAFICHA?: string; NOMEEXAME?: string }> = []
  let epis: Array<{ DATA_VENCIMENTO?: string; NOME_EPI?: string }> = []
  let ghes: Array<{ maiorAdicionalInsalubridade?: string; existePericulosidade?: string }> = []
  let licencasAtivas = 0

  if (socOk) {
    try {
      const [funcRes, examAnoRes, examMesRes, epiRes, gheRes, licRes] = await Promise.all([
        getTodosFuncionarios().catch(() => []),
        getExamesPeriodo(ddmmAnoPg(d365Atras), ddmmAnoPg(hoje)).catch(() => []),
        getExamesPeriodo(`01/${String(hoje.getMonth() + 1).padStart(2, '0')}/${hoje.getFullYear()}`, ddmmAnoPg(hoje)).catch(() => []),
        getEntregasEpi().catch(() => []),
        getRiscos().catch(() => []),
        getLicencasPeriodo(ddmmAnoPg(d30Atras), ddmmAnoPg(hoje)).catch(() => []),
      ])
      funcionarios = funcRes as typeof funcionarios
      examesAno = examAnoRes as typeof examesAno
      examesMes = examMesRes as typeof examesMes
      epis = epiRes as typeof epis
      ghes = gheRes as typeof ghes
      licencasAtivas = (licRes as unknown[]).length
    } catch {
      // SOC indisponível — mantém valores zero
    }
  }

  // ── Conversação / briefings ────────────────────────────────────────────────
  const initialMessages = ((conversaDashboard?.[0]?.mensagens ?? []) as { role: 'user' | 'assistant'; content: string }[]).slice(-30)
  const briefings = (briefingsRaw ?? []) as Briefing[]
  const ultimaInteracaoWpp = conversaWhatsapp?.[0]?.updated_at
    ? new Date(conversaWhatsapp[0].updated_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null
  const briefingHoje = briefings.find(b => b.data_briefing === hojeISO)

  // ── Cálculos do War Room ──────────────────────────────────────────────────
  const lancamentos = (lancamentosRaw ?? []) as Lancamento[]
  const lancDRE = filtrarParaDRE(lancamentos, excluidas)
  const empresaMap: Record<string, string> = {}
  for (const e of empresasList ?? []) empresaMap[e.id] = e.nome_curto

  // Lucro do mês atual vs anterior
  let recAtual = 0, recAnt = 0, despAtual = 0, despAnt = 0
  for (const l of lancDRE) {
    const m = l.data_vencimento?.slice(0, 7)
    if (m === anoMesAtual) {
      if (l.tipo === 'receita') recAtual += l.valor ?? 0
      else if (l.tipo === 'despesa') despAtual += l.valor ?? 0
    } else if (m === anoMesAnt) {
      if (l.tipo === 'receita') recAnt += l.valor ?? 0
      else if (l.tipo === 'despesa') despAnt += l.valor ?? 0
    }
  }
  const lucroMes = recAtual - despAtual
  const lucroAnt = recAnt - despAnt
  const lucroDelta = lucroAnt !== 0 ? ((lucroMes - lucroAnt) / Math.abs(lucroAnt)) * 100 : 0

  // Saldo ativo total
  const saldoAtivoTotal = (saldosAtivos ?? []).reduce((s, b) => s + (b.saldo ?? 0), 0)

  // Contas atrasadas (a pagar + a receber)
  let atrasadosValor = 0, atrasadosQtd = 0
  const atrasadasPorEmpresa: Record<string, { valor: number; qtd: number }> = {}
  for (const l of lancamentos) {
    if (isTransferenciaInterna(l.categoria, excluidas)) continue
    if (l.status === 'pago' || l.status === 'parcial') continue
    if (!l.data_vencimento || l.data_vencimento >= hojeISO) continue
    atrasadosValor += l.valor ?? 0
    atrasadosQtd += 1
    if (l.empresa_id) {
      if (!atrasadasPorEmpresa[l.empresa_id]) atrasadasPorEmpresa[l.empresa_id] = { valor: 0, qtd: 0 }
      atrasadasPorEmpresa[l.empresa_id].valor += l.valor ?? 0
      atrasadasPorEmpresa[l.empresa_id].qtd += 1
    }
  }

  // Empréstimos em aberto (saldo líquido devedor)
  const REGEX_EMPRESTIMO = /empr[eé]stimo|emprestimo|parcelamento|parcela/i
  let empPagarPend = 0, empReceberPend = 0
  for (const l of lancamentos) {
    if (!l.categoria || !REGEX_EMPRESTIMO.test(l.categoria)) continue
    if (l.status === 'pago' || l.status === 'parcial') continue
    if (l.tipo === 'despesa') empPagarPend += l.valor ?? 0
    else if (l.tipo === 'receita') empReceberPend += l.valor ?? 0
  }
  const emprestimosAbertos = empPagarPend - empReceberPend

  // ASOs vencidos (funcionários ativos cuja última consulta clínica foi >365d)
  let asosVencidos = 0
  if (socOk && funcionarios.length > 0) {
    const ultimaConsultaPorFunc: Record<string, Date> = {}
    for (const e of examesAno) {
      if (!isConsultaOcupacional(e.NOMEEXAME)) continue
      const dt = parseDataSoc(e.DATAFICHA)
      const nome = e.NOMEFUNCIONARIO
      if (!dt || !nome) continue
      if (!ultimaConsultaPorFunc[nome] || dt > ultimaConsultaPorFunc[nome]) {
        ultimaConsultaPorFunc[nome] = dt
      }
    }
    for (const f of funcionarios) {
      if (f.SITUACAO !== 'Ativo') continue
      const nome = f.NOMEFUNCIONARIO
      if (!nome) continue
      const ult = ultimaConsultaPorFunc[nome]
      if (!ult || ult < d365Atras) asosVencidos += 1
    }
  }

  // Consultas do mês
  const consultasMes = examesMes.filter(e => isConsultaOcupacional(e.NOMEEXAME)).length

  // EPIs com CA vencido
  const episVencidos = epis.filter(e => e.DATA_VENCIMENTO && e.DATA_VENCIMENTO < hojeISO).length

  // GHEs com insalubridade
  const ghesInsalubres = ghes.filter(g => g.maiorAdicionalInsalubridade && g.maiorAdicionalInsalubridade !== '0').length

  // Total de funcionários ativos
  const totalVidas = funcionarios.filter(f => f.SITUACAO === 'Ativo').length

  // Sistema
  const ultimoSyncContaAzul = syncRecente?.find(s => s.fonte === 'conta_azul')?.finalizado_em
    ? new Date(syncRecente.find(s => s.fonte === 'conta_azul')!.finalizado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null
  const contaAzulEmpresasAtivas = (tokensContaAzul ?? []).length
  const contaAzulEmpresasTotal = (empresasList ?? []).length

  // ── Alertas críticos (derivados) ───────────────────────────────────────────
  const alertas: AlertaCritico[] = []

  // CRÍTICO: empresa com mais atraso
  const empresaMaisAtrasada = Object.entries(atrasadasPorEmpresa)
    .sort((a, b) => b[1].valor - a[1].valor)[0]
  if (empresaMaisAtrasada && empresaMaisAtrasada[1].valor > 10_000) {
    const [empId, dados] = empresaMaisAtrasada
    alertas.push({
      nivel: 'critico',
      icone: '💸',
      titulo: `${empresaMap[empId] ?? 'Empresa'} — ${dados.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })} em atraso`,
      detalhe: `${dados.qtd} conta${dados.qtd > 1 ? 's' : ''} vencida${dados.qtd > 1 ? 's' : ''} sem pagamento`,
      href: `/dashboard/financeiro/atrasados?empresa=${empId}`,
    })
  }

  // CRÍTICO: ASOs vencidos (passivo eSocial)
  if (asosVencidos > 20) {
    alertas.push({
      nivel: 'critico',
      icone: '🩺',
      titulo: `${asosVencidos} ASOs vencidos`,
      detalhe: 'Funcionários ativos sem consulta há mais de 12 meses — passivo eSocial e trabalhista',
      href: '/dashboard/medicina',
    })
  } else if (asosVencidos > 0) {
    alertas.push({
      nivel: 'atencao',
      icone: '🩺',
      titulo: `${asosVencidos} ASOs vencidos`,
      detalhe: 'Agendar consulta ocupacional para regularizar',
      href: '/dashboard/medicina',
    })
  }

  // CRÍTICO: EPIs com CA vencido
  if (episVencidos > 10) {
    alertas.push({
      nivel: 'critico',
      icone: '🦺',
      titulo: `${episVencidos} EPIs com CA vencido`,
      detalhe: 'Uso irregular — passivo em caso de acidente',
      href: '/dashboard/engenharia',
    })
  } else if (episVencidos > 0) {
    alertas.push({
      nivel: 'atencao',
      icone: '🦺',
      titulo: `${episVencidos} EPIs com CA vencido`,
      detalhe: 'Renovar certificado de aprovação dos EPIs',
      href: '/dashboard/engenharia',
    })
  }

  // ATENÇÃO: saldo total negativo
  if (saldoAtivoTotal < 0) {
    alertas.push({
      nivel: 'critico',
      icone: '🏦',
      titulo: 'Caixa consolidado negativo',
      detalhe: 'Soma dos saldos das contas ativas está negativa — verificar contas a pagar',
      href: '/dashboard/financeiro/fluxo-caixa',
    })
  }

  // ATENÇÃO: empresas sem token Conta Azul
  if (contaAzulEmpresasAtivas < contaAzulEmpresasTotal) {
    alertas.push({
      nivel: 'atencao',
      icone: '🔌',
      titulo: `${contaAzulEmpresasTotal - contaAzulEmpresasAtivas} empresa(s) sem token Conta Azul`,
      detalhe: 'Re-autorizar conexão para sincronizar lançamentos financeiros',
      href: '/dashboard/financeiro/sync',
    })
  }

  // ATENÇÃO: lucro negativo
  if (lucroMes < 0) {
    alertas.push({
      nivel: 'atencao',
      icone: '📉',
      titulo: 'Lucro do mês negativo',
      detalhe: `Despesas (${despAtual.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}) superaram receitas (${recAtual.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })})`,
      href: '/dashboard/financeiro',
    })
  }

  const warRoomData: WarRoomData = {
    lucroMes,
    lucroDelta,
    saldoAtivoTotal,
    contasAtrasadasValor: atrasadosValor,
    contasAtrasadasQtd: atrasadosQtd,
    emprestimosAbertos,
    asosVencidos,
    consultasMes,
    licencasAtivas,
    episVencidos,
    ghesInsalubres,
    totalVidas,
    ultimoSyncContaAzul,
    socAtivo: socOk,
    contaAzulEmpresasAtivas,
    contaAzulEmpresasTotal,
    alertas,
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white p-6 md:p-8">
      {/* Header */}
      <div className="mb-8">
        <a href="/dashboard" className="text-gray-500 text-sm hover:text-gray-300">← Centro de Comando</a>
        <div className="flex items-center gap-4 mt-2">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-600 to-blue-900 flex items-center justify-center text-xl font-bold">L</div>
          <div>
            <h1 className="text-2xl font-bold">LUI — Agente Estratégico</h1>
            <p className="text-gray-400 text-sm">War Room · Briefing diário · WhatsApp + Web</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-green-400">Ativo</span>
          </div>
        </div>
      </div>

      {/* War Room — visão consolidada */}
      <WarRoom data={warRoomData} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Chat — 2/3 */}
        <div className="md:col-span-2 space-y-6">
          <div>
            <h2 className="text-sm font-semibold text-gray-400 mb-3">Chat com LUI</h2>
            <LuiChat initialMessages={initialMessages} />
            <p className="text-xs text-gray-600 mt-2">Também disponível via WhatsApp · Briefing diário às 7h</p>
          </div>

          {/* Histórico de briefings */}
          <div className="bg-gray-900 rounded-xl border border-gray-800">
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <div>
                <h3 className="text-sm font-semibold text-gray-200">Briefings Diários</h3>
                <p className="text-xs text-gray-500 mt-0.5">Últimos 7 dias</p>
              </div>
              {briefingHoje && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-900/40 text-green-400 border border-green-800/40">
                  ✓ Gerado hoje
                </span>
              )}
            </div>

            {briefings.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm text-gray-500">Nenhum briefing gerado ainda</p>
                <p className="text-xs text-gray-600 mt-1">Use o botão abaixo para gerar o primeiro</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-800">
                {briefings.map((b) => (
                  <details key={b.id} className="group">
                    <summary className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-800/50 transition-colors list-none">
                      <div className="flex items-center gap-3">
                        <div className="text-center min-w-[40px]">
                          <p className="text-lg font-bold text-white leading-none">
                            {new Date(b.data_briefing + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit' })}
                          </p>
                          <p className="text-[10px] text-gray-500">
                            {new Date(b.data_briefing + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short' })}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-300 line-clamp-2">{b.resumo || b.conteudo?.slice(0, 120)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${b.enviado ? 'bg-green-900/40 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
                          {b.enviado ? '✓ Enviado' : 'Local'}
                        </span>
                        <span className="text-gray-600 text-xs group-open:rotate-180 transition-transform">▾</span>
                      </div>
                    </summary>
                    <div className="px-4 pb-4">
                      <div className="bg-gray-800/60 rounded-xl p-4 text-xs text-gray-300 whitespace-pre-wrap leading-relaxed border border-gray-700/50">
                        {b.conteudo}
                      </div>
                      {b.enviado_em && (
                        <p className="text-[10px] text-gray-600 mt-2">
                          Enviado via WhatsApp em {new Date(b.enviado_em).toLocaleString('pt-BR')}
                        </p>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar — 1/3 */}
        <div className="space-y-4">
          {/* Briefing actions — disparo manual */}
          <BriefingActions briefingHojeExiste={!!briefingHoje} />

          {/* Memórias do LUI */}
          <MemoriasPanel agente="lui" />

          {/* Perfil */}
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Perfil</h3>
            <div className="space-y-2 text-xs">
              {[
                { label: 'Canal', val: 'WhatsApp + Web' },
                { label: 'Modelo', val: 'Claude Sonnet 4.6' },
                { label: 'Briefing', val: 'Diário 07:00h' },
                { label: 'Agentes', val: 'Plata · Lari · Dieguito' },
                { label: 'Última interação', val: ultimaInteracaoWpp ?? 'Nunca' },
              ].map(row => (
                <div key={row.label} className="flex justify-between">
                  <span className="text-gray-500">{row.label}</span>
                  <span className="text-gray-200">{row.val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Status integrações */}
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Integrações Recentes</h3>
            <div className="space-y-2">
              {(syncRecente ?? []).map((s, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-200">{s.fonte}</p>
                    <p className="text-xs text-gray-500">
                      {s.finalizado_em
                        ? new Date(s.finalizado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </p>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    s.status === 'sucesso'  ? 'bg-green-900/50 text-green-300' :
                    s.status === 'parcial'  ? 'bg-yellow-900/50 text-yellow-300' :
                                             'bg-red-900/50 text-red-300'
                  }`}>
                    {s.status}
                  </span>
                </div>
              ))}
              {(!syncRecente || syncRecente.length === 0) && (
                <p className="text-xs text-gray-500">Nenhum sync registrado</p>
              )}
            </div>
          </div>

          {/* Links rápidos */}
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Acesso Rápido</h3>
            <div className="space-y-2">
              {[
                { label: 'Dashboard Financeiro', href: '/dashboard/financeiro', color: 'text-amber-400' },
                { label: 'Plata — CFO IA', href: '/dashboard/financeiro/plata', color: 'text-amber-300' },
                { label: 'Lari — Medicina', href: '/dashboard/medicina', color: 'text-emerald-400' },
                { label: 'Dieguito — Engenharia', href: '/dashboard/engenharia', color: 'text-orange-400' },
                { label: 'Centro de Comando', href: '/dashboard', color: 'text-blue-400' },
              ].map(link => (
                <a key={link.href} href={link.href} className={`block text-xs ${link.color} hover:underline`}>
                  {link.label} →
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
