import { createClient as sb } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { socConfigurado } from '@/lib/soc/client'

function fmt(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
}
function fmtK(v: number) {
  if (Math.abs(v) >= 1_000_000) return `R$${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000)     return `R$${(v / 1_000).toFixed(0)}k`
  return fmt(v)
}
function hoje() { return new Date().toISOString().split('T')[0] }
function diasAFrente(n: number) { return new Date(Date.now() + n * 86_400_000).toISOString().split('T')[0] }
function diasAtras(n: number)   { return new Date(Date.now() - n * 86_400_000).toISOString().split('T')[0] }
function relTime(iso: string | null) {
  if (!iso) return 'Nunca'
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (diff < 1)   return 'agora há pouco'
  if (diff < 60)  return `há ${diff}min`
  if (diff < 1440) return `há ${Math.floor(diff / 60)}h`
  return `há ${Math.floor(diff / 1440)}d`
}

export default async function DashboardPage() {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) redirect('/login')

  const supabase = sb(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const hojeISO = hoje()
  const socOk = socConfigurado()

  const [
    { data: empresas },
    { data: saldosRaw },
    { data: lancamentos },
    { data: syncLogs },
    { data: briefingHoje },
    { data: ultimoBriefing },
    { data: conversaLui },
  ] = await Promise.all([
    supabase.from('empresas').select('id, nome_curto, status').order('nome_curto'),
    supabase.from('saldos_bancarios').select('banco, saldo, data_referencia').order('data_referencia', { ascending: false }),
    supabase.from('lancamentos_financeiros')
      .select('tipo, valor, status, data_vencimento')
      .neq('status', 'cancelado')
      .gte('data_vencimento', diasAtras(30))
      .lte('data_vencimento', diasAFrente(30)),
    supabase.from('sync_log')
      .select('fonte, status, finalizado_em, registros_processados')
      .order('finalizado_em', { ascending: false })
      .limit(10),
    supabase.from('briefings_diarios')
      .select('conteudo, enviado, created_at')
      .eq('data_briefing', hojeISO)
      .maybeSingle(),
    supabase.from('briefings_diarios')
      .select('data_briefing, resumo, enviado, enviado_em')
      .order('data_briefing', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('conversas_ia')
      .select('updated_at')
      .eq('agente', 'LUI')
      .eq('canal', 'whatsapp')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  // ── Saldos ────────────────────────────────────────────────────────────────
  const saldoMap: Record<string, number> = {}
  for (const s of saldosRaw ?? []) if (!saldoMap[s.banco]) saldoMap[s.banco] = s.saldo ?? 0
  const totalCaixa = Object.values(saldoMap).reduce((s, v) => s + v, 0)

  // ── Financeiro ────────────────────────────────────────────────────────────
  const all = lancamentos ?? []
  const recVencidas  = all.filter(l => l.tipo === 'receita' && l.status === 'vencido')
  const despVencidas = all.filter(l => l.tipo === 'despesa' && l.status === 'vencido')
  const aPagar7d     = all.filter(l => l.tipo === 'despesa' && l.status === 'pendente' && l.data_vencimento >= hojeISO && l.data_vencimento <= diasAFrente(7))
  const totalInadimplencia = recVencidas.reduce((s, l) => s + (l.valor ?? 0), 0)
  const totalDespVencidas  = despVencidas.reduce((s, l) => s + (l.valor ?? 0), 0)
  const totalAPagar7d      = aPagar7d.reduce((s, l) => s + (l.valor ?? 0), 0)

  const receitasTotal = all.filter(l => l.tipo === 'receita').reduce((s, l) => s + (l.valor ?? 0), 0)
  const inadPct = receitasTotal > 0 ? (totalInadimplencia / receitasTotal) * 100 : 0

  // Resultado do mês atual
  const mesAtual = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
  const recMes  = all.filter(l => l.tipo === 'receita' && (l.data_vencimento ?? '').startsWith(mesAtual)).reduce((s, l) => s + (l.valor ?? 0), 0)
  const despMes = all.filter(l => l.tipo === 'despesa' && (l.data_vencimento ?? '').startsWith(mesAtual)).reduce((s, l) => s + (l.valor ?? 0), 0)
  const resultadoMes = recMes - despMes

  // ── Sync status ────────────────────────────────────────────────────────────
  const syncMap: Record<string, { status: string; finalizado_em: string | null; registros: number }> = {}
  for (const s of syncLogs ?? []) {
    if (!syncMap[s.fonte]) syncMap[s.fonte] = { status: s.status, finalizado_em: s.finalizado_em, registros: s.registros_processados ?? 0 }
  }
  const syncContaAzul = syncMap['conta_azul'] ?? null
  const ultimoSyncCA = syncContaAzul?.finalizado_em
    ? new Date(syncContaAzul.finalizado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : 'Nunca'

  // ── LUI / Briefing ────────────────────────────────────────────────────────
  const ultimaInteracaoLUI = conversaLui?.updated_at ?? null
  const briefingExisteHoje = !!briefingHoje

  // ── Alertas consolidados ──────────────────────────────────────────────────
  type Alerta = { nivel: 'critico' | 'atencao'; area: string; msg: string; href: string }
  const alertas: Alerta[] = []

  if (totalDespVencidas > 0)
    alertas.push({ nivel: 'critico', area: 'Financeiro', msg: `${despVencidas.length} despesa${despVencidas.length > 1 ? 's' : ''} vencida${despVencidas.length > 1 ? 's' : ''} — ${fmtK(totalDespVencidas)}`, href: '/dashboard/financeiro/contas?status=vencido&tipo=despesa' })
  if (inadPct > 10)
    alertas.push({ nivel: 'critico', area: 'Financeiro', msg: `Inadimplência crítica: ${inadPct.toFixed(1)}% — ${fmtK(totalInadimplencia)}`, href: '/dashboard/financeiro/inadimplentes' })
  else if (inadPct > 5)
    alertas.push({ nivel: 'atencao', area: 'Financeiro', msg: `Inadimplência elevada: ${inadPct.toFixed(1)}% — ${fmtK(totalInadimplencia)}`, href: '/dashboard/financeiro/inadimplentes' })
  if (totalAPagar7d > 0)
    alertas.push({ nivel: 'atencao', area: 'Financeiro', msg: `${aPagar7d.length} pagamento${aPagar7d.length > 1 ? 's' : ''} nos próximos 7 dias — ${fmtK(totalAPagar7d)}`, href: '/dashboard/financeiro/contas' })
  if (!socOk)
    alertas.push({ nivel: 'atencao', area: 'SOC', msg: 'SOC não configurado — Lari e Dieguito sem dados reais', href: '/dashboard/medicina' })
  if (syncContaAzul?.status === 'erro')
    alertas.push({ nivel: 'critico', area: 'Integração', msg: 'Erro no último sync do Conta Azul', href: '/dashboard/financeiro' })

  const horaAtual = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const dataAtual = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
  const empresasAtivas = (empresas ?? []).filter(e => e.status === 'ativa')

  return (
    <main className="min-h-screen bg-gray-950 text-white p-6 md:p-8">

      {/* Header */}
      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Centro de Comando</h1>
          <p className="text-gray-400 mt-1">GP SafeWork · Holding · {dataAtual} · {horaAtual}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${
            alertas.some(a => a.nivel === 'critico')
              ? 'bg-red-950/50 border-red-800/50 text-red-300'
              : alertas.length > 0
              ? 'bg-yellow-950/50 border-yellow-800/50 text-yellow-300'
              : 'bg-green-950/50 border-green-800/50 text-green-300'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${
              alertas.some(a => a.nivel === 'critico') ? 'bg-red-400'
              : alertas.length > 0 ? 'bg-yellow-400'
              : 'bg-green-400'
            }`} />
            {alertas.some(a => a.nivel === 'critico') ? 'Ação urgente necessária'
              : alertas.length > 0 ? `${alertas.length} atenção`
              : 'Tudo operacional'}
          </div>
        </div>
      </div>

      {/* Alertas críticos — só mostra se tiver */}
      {alertas.length > 0 && (
        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-2">
          {alertas.map((a, i) => (
            <a key={i} href={a.href} className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border text-sm transition-colors ${
              a.nivel === 'critico'
                ? 'bg-red-950/40 border-red-900/50 hover:bg-red-950/60'
                : 'bg-yellow-950/30 border-yellow-900/40 hover:bg-yellow-950/50'
            }`}>
              <span>{a.nivel === 'critico' ? '🔴' : '⚠️'}</span>
              <span className="text-[11px] text-gray-500 shrink-0 font-mono">{a.area}</span>
              <span className="text-gray-200 text-xs flex-1">{a.msg}</span>
              <span className="text-gray-600 text-xs shrink-0">→</span>
            </a>
          ))}
        </div>
      )}

      {/* KPIs financeiros — linha 1 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <a href="/dashboard/financeiro" className={`rounded-xl p-4 border group transition-colors hover:border-amber-600/50 ${
          totalCaixa < 0 ? 'bg-red-950/30 border-red-900/50' : 'bg-gray-900 border-gray-800'
        }`}>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Caixa</p>
          <p className={`text-2xl font-bold ${totalCaixa < 0 ? 'text-red-400' : 'text-white'}`}>{fmtK(totalCaixa)}</p>
          <p className="text-[10px] text-gray-600 mt-1">{Object.keys(saldoMap).length} conta{Object.keys(saldoMap).length !== 1 ? 's' : ''}</p>
        </a>
        <a href="/dashboard/financeiro/inadimplentes" className={`rounded-xl p-4 border group transition-colors ${
          inadPct > 10 ? 'bg-red-950/30 border-red-900/50 hover:border-red-700' : inadPct > 5 ? 'bg-yellow-950/20 border-yellow-900/40 hover:border-yellow-700' : 'bg-gray-900 border-gray-800 hover:border-amber-600/50'
        }`}>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Inadimplência</p>
          <p className={`text-2xl font-bold ${inadPct > 10 ? 'text-red-400' : inadPct > 5 ? 'text-yellow-400' : 'text-white'}`}>
            {fmtK(totalInadimplencia)}
          </p>
          <p className={`text-[10px] mt-1 ${inadPct > 5 ? 'text-yellow-500' : 'text-gray-600'}`}>{inadPct.toFixed(1)}% da receita</p>
        </a>
        <a href="/dashboard/financeiro/contas" className={`rounded-xl p-4 border group transition-colors ${
          totalDespVencidas > 0 ? 'bg-red-950/30 border-red-900/50 hover:border-red-700' : 'bg-gray-900 border-gray-800 hover:border-amber-600/50'
        }`}>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">A pagar (7d)</p>
          <p className={`text-2xl font-bold ${totalDespVencidas > 0 ? 'text-red-400' : 'text-white'}`}>
            {fmtK(totalAPagar7d + totalDespVencidas)}
          </p>
          {totalDespVencidas > 0
            ? <p className="text-[10px] text-red-500 mt-1">{despVencidas.length} vencido{despVencidas.length > 1 ? 's' : ''}</p>
            : <p className="text-[10px] text-gray-600 mt-1">{aPagar7d.length} títulos</p>}
        </a>
        <a href="/dashboard/financeiro/dre" className={`rounded-xl p-4 border group transition-colors hover:border-amber-600/50 ${
          resultadoMes < 0 ? 'bg-red-950/20 border-red-900/40' : 'bg-gray-900 border-gray-800'
        }`}>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Resultado mês</p>
          <p className={`text-2xl font-bold ${resultadoMes < 0 ? 'text-red-400' : resultadoMes > 0 ? 'text-green-400' : 'text-white'}`}>
            {fmtK(resultadoMes)}
          </p>
          <p className="text-[10px] text-gray-600 mt-1">{new Date().toLocaleDateString('pt-BR', { month: 'long' })}</p>
        </a>
      </div>

      {/* Módulos — linha 2 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">

        {/* LUI */}
        <a href="/dashboard/lui" className="bg-gradient-to-br from-blue-950/80 to-gray-900 rounded-xl p-5 border border-blue-900/50 hover:border-blue-600 transition-colors group">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-900/60 flex items-center justify-center text-sm font-bold">L</div>
              <span className="font-semibold">LUI</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[10px] text-green-400">Ativo</span>
            </div>
          </div>
          <p className="text-xs text-gray-400 mb-3">Agente estratégico · CEO IA · WhatsApp + Web</p>
          <div className="space-y-1.5 text-[11px]">
            <div className="flex justify-between text-gray-500">
              <span>Última interação</span>
              <span className="text-gray-300">{relTime(ultimaInteracaoLUI)}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Briefing hoje</span>
              <span className={briefingExisteHoje ? 'text-green-400' : 'text-gray-500'}>
                {briefingExisteHoje ? '✓ Gerado' : 'Não gerado'}
              </span>
            </div>
            {ultimoBriefing?.data_briefing && (
              <div className="flex justify-between text-gray-500">
                <span>Último briefing</span>
                <span className="text-gray-300">{ultimoBriefing.data_briefing}</span>
              </div>
            )}
          </div>
        </a>

        {/* Financeiro */}
        <a href="/dashboard/financeiro" className="bg-gradient-to-br from-amber-950/50 to-gray-900 rounded-xl p-5 border border-amber-800/40 hover:border-amber-600 transition-colors group">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-amber-900/60 flex items-center justify-center text-sm font-bold">Pl</div>
              <span className="font-semibold">Financeiro</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${syncContaAzul?.status === 'sucesso' ? 'bg-green-400' : syncContaAzul?.status === 'erro' ? 'bg-red-400' : 'bg-gray-500'}`} />
              <span className={`text-[10px] ${syncContaAzul?.status === 'sucesso' ? 'text-green-400' : syncContaAzul?.status === 'erro' ? 'text-red-400' : 'text-gray-500'}`}>
                {syncContaAzul?.status ?? 'Sem sync'}
              </span>
            </div>
          </div>
          <p className="text-xs text-gray-400 mb-3">Plata · Conta Azul · DRE · Fluxo de Caixa</p>
          <div className="space-y-1.5 text-[11px]">
            <div className="flex justify-between text-gray-500">
              <span>Última sinc.</span>
              <span className="text-gray-300">{ultimoSyncCA}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Lançamentos (30d)</span>
              <span className="text-gray-300">{all.length}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Inadimplência</span>
              <span className={inadPct > 5 ? 'text-yellow-400' : 'text-gray-300'}>{fmtK(totalInadimplencia)}</span>
            </div>
          </div>
        </a>

        {/* SOC — Medicina + Engenharia */}
        <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <span className="font-semibold">SOC — Medicina & Eng.</span>
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${socOk ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'}`} />
              <span className={`text-[10px] ${socOk ? 'text-green-400' : 'text-yellow-400'}`}>
                {socOk ? 'Conectado' : 'Não configurado'}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <a href="/dashboard/medicina" className="bg-gray-800/60 rounded-lg p-3 hover:bg-emerald-950/40 hover:border-emerald-800/40 border border-transparent transition-colors">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-5 h-5 rounded-full bg-emerald-900/60 flex items-center justify-center text-[10px] font-bold">La</div>
                <span className="text-xs font-medium">Lari</span>
              </div>
              <p className="text-[10px] text-gray-500">Medicina · ASOs · PCMSO</p>
            </a>
            <a href="/dashboard/engenharia" className="bg-gray-800/60 rounded-lg p-3 hover:bg-orange-950/40 hover:border-orange-800/40 border border-transparent transition-colors">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-5 h-5 rounded-full bg-orange-900/60 flex items-center justify-center text-[10px] font-bold">Di</div>
                <span className="text-xs font-medium">Dieguito</span>
              </div>
              <p className="text-[10px] text-gray-500">Engenharia · EPI · PGR</p>
            </a>
          </div>
          {!socOk && (
            <p className="text-[10px] text-yellow-500/70 mt-3">
              Configure SOC_MASK_* no Vercel para ativar dados reais
            </p>
          )}
        </div>
      </div>

      {/* Row 3 — Empresas + Briefing + Links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Empresas ativas */}
        <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
            Grupo GP SafeWork — {empresasAtivas.length} empresas ativas
          </h3>
          <div className="space-y-2">
            {empresasAtivas.map(e => (
              <div key={e.id} className="flex items-center justify-between">
                <span className="text-xs text-gray-300">{e.nome_curto}</span>
                <span className="text-[10px] bg-green-950/50 text-green-400 px-1.5 py-0.5 rounded-full border border-green-900/40">
                  ativa
                </span>
              </div>
            ))}
            {(empresas ?? []).filter(e => e.status !== 'ativa').map(e => (
              <div key={e.id} className="flex items-center justify-between opacity-50">
                <span className="text-xs text-gray-500">{e.nome_curto}</span>
                <span className="text-[10px] bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded-full">{e.status}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Briefing do dia */}
        <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Briefing de Hoje</h3>
            {briefingExisteHoje && (
              <span className="text-[10px] text-green-400 bg-green-950/40 px-2 py-0.5 rounded-full border border-green-900/30">✓ Gerado</span>
            )}
          </div>
          {briefingHoje ? (
            <div>
              <p className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed line-clamp-8">
                {briefingHoje.conteudo}
              </p>
              <a href="/dashboard/lui" className="inline-block mt-3 text-[11px] text-blue-400 hover:underline">
                Ver histórico completo →
              </a>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-32 text-center">
              <p className="text-xs text-gray-500">Briefing ainda não gerado hoje</p>
              <p className="text-[10px] text-gray-600 mt-1">Automático às 7h · ou gere manualmente</p>
              <a
                href="/dashboard/lui"
                className="mt-3 text-xs bg-blue-900/50 hover:bg-blue-800/60 text-blue-300 px-3 py-1.5 rounded-lg transition-colors"
              >
                Ir para LUI →
              </a>
            </div>
          )}
        </div>

        {/* Acesso rápido + Integrações */}
        <div className="space-y-3">
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Acesso Rápido</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Plata IA',       href: '/dashboard/financeiro/plata',    color: 'text-amber-400',   bg: 'bg-amber-950/30 border-amber-900/30' },
                { label: 'DRE',            href: '/dashboard/financeiro/dre',      color: 'text-amber-300',   bg: 'bg-amber-950/20 border-amber-900/20' },
                { label: 'Inadimplentes',  href: '/dashboard/financeiro/inadimplentes', color: 'text-red-400', bg: 'bg-red-950/20 border-red-900/20' },
                { label: 'Contas',         href: '/dashboard/financeiro/contas',   color: 'text-gray-300',    bg: 'bg-gray-800/60 border-gray-700/50' },
                { label: 'Medicina',       href: '/dashboard/medicina',            color: 'text-emerald-400', bg: 'bg-emerald-950/20 border-emerald-900/20' },
                { label: 'Engenharia',     href: '/dashboard/engenharia',          color: 'text-orange-400',  bg: 'bg-orange-950/20 border-orange-900/20' },
              ].map(link => (
                <a key={link.href} href={link.href} className={`text-xs ${link.color} ${link.bg} border px-2.5 py-2 rounded-lg hover:opacity-80 transition-opacity text-center`}>
                  {link.label}
                </a>
              ))}
            </div>
          </div>

          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Integrações</h3>
            <div className="space-y-2">
              {[
                {
                  nome: 'Conta Azul',
                  status: syncContaAzul?.status ?? 'sem sync',
                  detalhe: syncContaAzul ? relTime(syncContaAzul.finalizado_em) : 'Nunca sincronizado',
                },
                {
                  nome: 'SOC',
                  status: socOk ? 'conectado' : 'pendente',
                  detalhe: socOk ? 'Máscaras configuradas' : 'SOC_MASK_* não definidas',
                },
                {
                  nome: 'WhatsApp (Z-API)',
                  status: 'ativo',
                  detalhe: relTime(ultimaInteracaoLUI),
                },
              ].map(integ => (
                <div key={integ.nome} className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-300">{integ.nome}</p>
                    <p className="text-[10px] text-gray-600">{integ.detalhe}</p>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    integ.status === 'sucesso' || integ.status === 'conectado' || integ.status === 'ativo'
                      ? 'bg-green-950/50 text-green-400'
                      : integ.status === 'erro'
                      ? 'bg-red-950/50 text-red-400'
                      : 'bg-yellow-950/50 text-yellow-400'
                  }`}>
                    {integ.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
