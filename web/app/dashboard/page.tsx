import { createClient as sb } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { socConfigurado } from '@/lib/soc/client'
import { carregarCategoriasExcluidas, filtrarParaDRE } from '@/lib/financeiro/regras'

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
    { data: lancamentosRaw },
    { data: syncLogs },
    { data: briefingHoje },
    { data: ultimoBriefing },
    { data: conversaLui },
    excluidas,
  ] = await Promise.all([
    supabase.from('empresas').select('id, nome_curto, status').order('nome_curto'),
    supabase.from('saldos_bancarios').select('banco, saldo, data_referencia').order('data_referencia', { ascending: false }),
    supabase.from('lancamentos_financeiros')
      .select('tipo, valor, status, categoria, data_vencimento')
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
    carregarCategoriasExcluidas(supabase),
  ])

  // ── Saldos ────────────────────────────────────────────────────────────────
  const saldoMap: Record<string, number> = {}
  for (const s of saldosRaw ?? []) if (!saldoMap[s.banco]) saldoMap[s.banco] = s.saldo ?? 0
  const totalCaixa = Object.values(saldoMap).reduce((s, v) => s + v, 0)

  // ── Financeiro — filtrado (sem transferências internas / conta atrasada) ──
  const all = filtrarParaDRE(lancamentosRaw ?? [], excluidas)
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
    <main className="min-h-screen bg-slate-50">
      {/* Header — banner azul corporativo */}
      <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white">
        <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6 md:py-8">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-blue-200/80 mb-1">GP SafeWork · Holding</p>
              <h1 className="text-3xl font-bold tracking-tight">Centro de Comando</h1>
              <p className="text-blue-100/90 text-sm mt-1 capitalize">{dataAtual} · {horaAtual}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border backdrop-blur-sm ${
                alertas.some(a => a.nivel === 'critico')
                  ? 'bg-red-500/20 border-red-300/40 text-red-100'
                  : alertas.length > 0
                  ? 'bg-amber-500/20 border-amber-300/40 text-amber-100'
                  : 'bg-emerald-500/20 border-emerald-300/40 text-emerald-100'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                  alertas.some(a => a.nivel === 'critico') ? 'bg-red-400'
                  : alertas.length > 0 ? 'bg-amber-400'
                  : 'bg-emerald-400'
                }`} />
                {alertas.some(a => a.nivel === 'critico') ? 'Ação urgente necessária'
                  : alertas.length > 0 ? `${alertas.length} ${alertas.length === 1 ? 'atenção' : 'atenções'}`
                  : 'Tudo operacional'}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6 md:py-8">
        {/* Alertas críticos */}
        {alertas.length > 0 && (
          <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-2">
            {alertas.map((a, i) => (
              <a key={i} href={a.href} className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border text-sm shadow-sm transition-colors ${
                a.nivel === 'critico'
                  ? 'bg-red-50 border-red-200 hover:bg-red-100'
                  : 'bg-amber-50 border-amber-200 hover:bg-amber-100'
              }`}>
                <span>{a.nivel === 'critico' ? '🔴' : '⚠️'}</span>
                <span className={`text-[11px] font-mono shrink-0 px-1.5 py-0.5 rounded ${
                  a.nivel === 'critico' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                }`}>{a.area}</span>
                <span className={`text-xs flex-1 ${a.nivel === 'critico' ? 'text-red-900' : 'text-amber-900'}`}>{a.msg}</span>
                <span className={`text-xs shrink-0 ${a.nivel === 'critico' ? 'text-red-600' : 'text-amber-700'}`}>→</span>
              </a>
            ))}
          </div>
        )}

        {/* KPIs financeiros — linha 1 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <a href="/dashboard/financeiro" className={`rounded-xl p-4 bg-white border shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all ${
            totalCaixa < 0 ? 'border-red-200' : 'border-slate-200'
          }`}>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 font-semibold">Caixa</p>
            <p className={`text-2xl font-bold tabular-nums ${totalCaixa < 0 ? 'text-red-700' : 'text-slate-900'}`}>{fmtK(totalCaixa)}</p>
            <p className="text-[10px] text-slate-500 mt-1">{Object.keys(saldoMap).length} conta{Object.keys(saldoMap).length !== 1 ? 's' : ''}</p>
          </a>
          <a href="/dashboard/financeiro/inadimplentes" className={`rounded-xl p-4 bg-white border shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all ${
            inadPct > 10 ? 'border-red-200' : inadPct > 5 ? 'border-amber-200' : 'border-slate-200'
          }`}>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 font-semibold">Inadimplência</p>
            <p className={`text-2xl font-bold tabular-nums ${inadPct > 10 ? 'text-red-700' : inadPct > 5 ? 'text-amber-700' : 'text-slate-900'}`}>
              {fmtK(totalInadimplencia)}
            </p>
            <p className={`text-[10px] mt-1 ${inadPct > 5 ? 'text-amber-700' : 'text-slate-500'}`}>{inadPct.toFixed(1)}% da receita</p>
          </a>
          <a href="/dashboard/financeiro/contas" className={`rounded-xl p-4 bg-white border shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all ${
            totalDespVencidas > 0 ? 'border-red-200' : 'border-slate-200'
          }`}>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 font-semibold">A pagar (7d)</p>
            <p className={`text-2xl font-bold tabular-nums ${totalDespVencidas > 0 ? 'text-red-700' : 'text-slate-900'}`}>
              {fmtK(totalAPagar7d + totalDespVencidas)}
            </p>
            {totalDespVencidas > 0
              ? <p className="text-[10px] text-red-700 mt-1">{despVencidas.length} vencido{despVencidas.length > 1 ? 's' : ''}</p>
              : <p className="text-[10px] text-slate-500 mt-1">{aPagar7d.length} títulos</p>}
          </a>
          <a href="/dashboard/financeiro/dre" className={`rounded-xl p-4 bg-white border shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all ${
            resultadoMes < 0 ? 'border-red-200' : resultadoMes > 0 ? 'border-emerald-200' : 'border-slate-200'
          }`}>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 font-semibold">Resultado mês</p>
            <p className={`text-2xl font-bold tabular-nums ${resultadoMes < 0 ? 'text-red-700' : resultadoMes > 0 ? 'text-emerald-700' : 'text-slate-900'}`}>
              {fmtK(resultadoMes)}
            </p>
            <p className="text-[10px] text-slate-500 mt-1 capitalize">{new Date().toLocaleDateString('pt-BR', { month: 'long' })}</p>
          </a>
        </div>

        {/* Módulos — linha 2 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">

          {/* LUI */}
          <a href="/dashboard/lui" className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all group">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-700 to-blue-900 text-white flex items-center justify-center text-sm font-bold shadow-sm">L</div>
                <span className="font-semibold text-slate-900">LUI</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] text-emerald-700 font-medium">Ativo</span>
              </div>
            </div>
            <p className="text-xs text-slate-600 mb-3">Agente estratégico · CEO IA · WhatsApp + Web</p>
            <div className="space-y-1.5 text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-500">Última interação</span>
                <span className="text-slate-700 font-medium">{relTime(ultimaInteracaoLUI)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Briefing hoje</span>
                <span className={briefingExisteHoje ? 'text-emerald-700 font-medium' : 'text-slate-500'}>
                  {briefingExisteHoje ? '✓ Gerado' : 'Não gerado'}
                </span>
              </div>
              {ultimoBriefing?.data_briefing && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Último briefing</span>
                  <span className="text-slate-700 font-medium">{ultimoBriefing.data_briefing}</span>
                </div>
              )}
            </div>
          </a>

          {/* Financeiro */}
          <a href="/dashboard/financeiro" className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all group">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-amber-700 text-white flex items-center justify-center text-sm font-bold shadow-sm">Pl</div>
                <span className="font-semibold text-slate-900">Financeiro</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${syncContaAzul?.status === 'sucesso' ? 'bg-emerald-500' : syncContaAzul?.status === 'erro' ? 'bg-red-500' : 'bg-slate-400'}`} />
                <span className={`text-[10px] font-medium ${syncContaAzul?.status === 'sucesso' ? 'text-emerald-700' : syncContaAzul?.status === 'erro' ? 'text-red-700' : 'text-slate-500'}`}>
                  {syncContaAzul?.status ?? 'Sem sync'}
                </span>
              </div>
            </div>
            <p className="text-xs text-slate-600 mb-3">Plata · Conta Azul · DRE · Fluxo de Caixa</p>
            <div className="space-y-1.5 text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-500">Última sinc.</span>
                <span className="text-slate-700 font-medium">{ultimoSyncCA}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Lançamentos (30d)</span>
                <span className="text-slate-700 font-medium tabular-nums">{all.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Inadimplência</span>
                <span className={`tabular-nums font-medium ${inadPct > 5 ? 'text-amber-700' : 'text-slate-700'}`}>{fmtK(totalInadimplencia)}</span>
              </div>
            </div>
          </a>

          {/* Comercial — Luizito */}
          <a href="/dashboard/comercial" className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm hover:shadow-md hover:border-purple-300 transition-all group">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-600 to-purple-900 text-white flex items-center justify-center text-sm font-bold shadow-sm">Lu</div>
                <span className="font-semibold text-slate-900">Comercial</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] text-emerald-700 font-medium">Ativo</span>
              </div>
            </div>
            <p className="text-xs text-slate-600 mb-3">Luizito · Carteira de clientes · Renovações</p>
            <div className="space-y-1.5 text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-500">Gerente</span>
                <span className="text-slate-700 font-medium">Luis Rabelo</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Pipeline</span>
                <span className="text-slate-500">RD Station (em breve)</span>
              </div>
            </div>
          </a>

          {/* SOC — Medicina + Engenharia */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="font-semibold text-slate-900">SOC — Medicina & Eng.</span>
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${socOk ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                <span className={`text-[10px] font-medium ${socOk ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {socOk ? 'Conectado' : 'Não configurado'}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <a href="/dashboard/medicina" className="bg-slate-50 hover:bg-emerald-50 rounded-lg p-3 border border-slate-200 hover:border-emerald-300 transition-colors">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 text-white flex items-center justify-center text-[10px] font-bold">La</div>
                  <span className="text-xs font-medium text-slate-900">Lari</span>
                </div>
                <p className="text-[10px] text-slate-500">Medicina · ASOs · PCMSO</p>
              </a>
              <a href="/dashboard/engenharia" className="bg-slate-50 hover:bg-orange-50 rounded-lg p-3 border border-slate-200 hover:border-orange-300 transition-colors">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-orange-500 to-orange-700 text-white flex items-center justify-center text-[10px] font-bold">Di</div>
                  <span className="text-xs font-medium text-slate-900">Dieguito</span>
                </div>
                <p className="text-[10px] text-slate-500">Engenharia · EPI · PGR</p>
              </a>
            </div>
            {!socOk && (
              <p className="text-[10px] text-amber-700 mt-3">
                Configure SOC_MASK_* no Vercel para ativar dados reais
              </p>
            )}
          </div>
        </div>

        {/* Row 3 — Empresas + Briefing + Links */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Empresas ativas */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4">
              Grupo GP SafeWork — {empresasAtivas.length} empresas ativas
            </h3>
            <div className="space-y-2">
              {empresasAtivas.map(e => (
                <div key={e.id} className="flex items-center justify-between">
                  <span className="text-xs text-slate-700">{e.nome_curto}</span>
                  <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full border border-emerald-200 font-medium">
                    ativa
                  </span>
                </div>
              ))}
              {(empresas ?? []).filter(e => e.status !== 'ativa').map(e => (
                <div key={e.id} className="flex items-center justify-between opacity-60">
                  <span className="text-xs text-slate-500">{e.nome_curto}</span>
                  <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full border border-slate-200">{e.status}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Briefing do dia */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Briefing de Hoje</h3>
              {briefingExisteHoje && (
                <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 font-medium">✓ Gerado</span>
              )}
            </div>
            {briefingHoje ? (
              <div>
                <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed line-clamp-8">
                  {briefingHoje.conteudo}
                </p>
                <a href="/dashboard/lui" className="inline-block mt-3 text-[11px] text-blue-700 hover:text-blue-900 font-medium hover:underline">
                  Ver histórico completo →
                </a>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-32 text-center">
                <p className="text-xs text-slate-500">Briefing ainda não gerado hoje</p>
                <p className="text-[10px] text-slate-400 mt-1">Automático às 7h · ou gere manualmente</p>
                <a
                  href="/dashboard/lui"
                  className="mt-3 text-xs bg-blue-700 hover:bg-blue-800 text-white px-3 py-1.5 rounded-lg font-medium transition-colors shadow-sm"
                >
                  Ir para LUI →
                </a>
              </div>
            )}
          </div>

          {/* Acesso rápido + Integrações */}
          <div className="space-y-3">
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">Acesso Rápido</h3>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Plata IA',       href: '/dashboard/financeiro/plata',         color: 'text-amber-800',   bg: 'bg-amber-50 border-amber-200 hover:bg-amber-100' },
                  { label: 'DRE',            href: '/dashboard/financeiro/dre',           color: 'text-amber-800',   bg: 'bg-amber-50 border-amber-200 hover:bg-amber-100' },
                  { label: 'Inadimplentes',  href: '/dashboard/financeiro/inadimplentes', color: 'text-red-800',     bg: 'bg-red-50 border-red-200 hover:bg-red-100' },
                  { label: 'Medicina',       href: '/dashboard/medicina',                 color: 'text-emerald-800', bg: 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100' },
                  { label: 'Engenharia',     href: '/dashboard/engenharia',               color: 'text-orange-800',  bg: 'bg-orange-50 border-orange-200 hover:bg-orange-100' },
                  { label: 'Comercial',      href: '/dashboard/comercial',               color: 'text-purple-800',  bg: 'bg-purple-50 border-purple-200 hover:bg-purple-100' },
                ].map(link => (
                  <a key={link.href} href={link.href} className={`text-xs font-medium ${link.color} ${link.bg} border px-2.5 py-2 rounded-lg transition-colors text-center`}>
                    {link.label}
                  </a>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">Integrações</h3>
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
                      <p className="text-xs text-slate-700 font-medium">{integ.nome}</p>
                      <p className="text-[10px] text-slate-500">{integ.detalhe}</p>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium border ${
                      integ.status === 'sucesso' || integ.status === 'conectado' || integ.status === 'ativo'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : integ.status === 'erro'
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {integ.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
