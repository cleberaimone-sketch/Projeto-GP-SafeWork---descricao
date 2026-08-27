import { createClient as sb } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { socConfigurado } from '@/lib/soc/client'
import { INDICADORES_DP, TOTAL_PESSOAS } from '@/lib/rh/dados'
import { pluggyConfigurado } from '@/lib/pluggy/client'
import { coreConfigurado } from '@/lib/os/core-client'
import { horaCurta, dataPorExtenso, dataHoraCurta, hojeISOBrasilia, mesAtualBrasilia } from '@/lib/formato/data'
import WhatsAppMirrorFeed, { type MensagemMirror } from './WhatsAppMirrorFeed'
import OSEventsFeed, { type OsEvento } from './OSEventsFeed'

function fmt(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
}
function fmtK(v: number) {
  if (Math.abs(v) >= 1_000_000) return `R$${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000)     return `R$${(v / 1_000).toFixed(0)}k`
  return fmt(v)
}
function hoje() { return hojeISOBrasilia() }
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

  // RH — resumo para o card do Centro de Comando
  const rhHeadcount = INDICADORES_DP.headcountFinal
  const rhTotalPessoas = TOTAL_PESSOAS

  const supabase = sb(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const hojeISO = hoje()
  const socOk = socConfigurado()
  const pluggyOk = pluggyConfigurado()
  const coreOk   = coreConfigurado()

  const [
    { data: empresas },
    { data: saldosRaw },
    { data: syncLogs },
    { data: briefingHoje },
    { data: ultimoBriefing },
    { data: conversaLui },
    { data: mensagensMirror },
    { data: osEventos },
    { data: salesEventos },
  ] = await Promise.all([
    supabase.from('empresas').select('id, nome_curto, status').order('nome_curto'),
    supabase.from('v_saldos_ativos').select('empresa_id, nome_exibicao, saldo'),
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
    supabase.from('mensagens_wpp_mirror')
      .select('id, contato_numero, contato_nome, mensagem, direcao, tipo, lida, created_at')
      .order('created_at', { ascending: false })
      .limit(30),
    supabase.from('os_eventos')
      .select('id, tipo, origem, payload, processado, created_at')
      .order('created_at', { ascending: false })
      .limit(20),
    supabase.from('os_eventos')
      .select('tipo, payload')
      .eq('origem', 'gp_sales_ia'),
  ])

  // ── KPIs financeiros do ANO ───────────────────────────────────────────────
  // Agregado no banco: o ano tem ~15 mil lançamentos e o PostgREST corta em
  // 1000, então ler e somar no Node exigiria 16 requisições por carregamento.
  // A RPC aplica as mesmas regras de lib/financeiro/regras.ts.
  //   receita/despesa/resultado e inadimplência → base DRE (só operacional)
  //   a pagar                                   → base FLUXO, porque empréstimo
  //                                               e parcelamento saem do caixa
  const anoAtual = Number(mesAtualBrasilia().slice(0, 4))
  const [{ data: kpisRaw }, { count: lancamentosNoAno }] = await Promise.all([
    supabase.rpc('fn_kpis_command_center', { p_ano: anoAtual }),
    supabase.from('lancamentos_financeiros')
      .select('id', { count: 'exact', head: true })
      .neq('status', 'cancelado')
      .gte('data_vencimento', `${anoAtual}-01-01`)
      .lte('data_vencimento', `${anoAtual}-12-31`),
  ])
  const k = (Array.isArray(kpisRaw) ? kpisRaw[0] : kpisRaw) ?? null

  const receitaAno         = Number(k?.receita_ano ?? 0)
  const despesaAno         = Number(k?.despesa_ano ?? 0)
  const resultadoAno       = Number(k?.resultado_ano ?? 0)
  const naoOperacional     = Number(k?.nao_operacional ?? 0)
  const geracaoCaixa       = Number(k?.geracao_caixa ?? 0)
  const totalInadimplencia = Number(k?.inadimplencia ?? 0)
  const qtdInadimplencia   = Number(k?.qtd_inadimplencia ?? 0)
  const totalAPagar        = Number(k?.a_pagar ?? 0)
  const qtdAPagar          = Number(k?.qtd_a_pagar ?? 0)
  const totalDespVencidas  = Number(k?.despesas_vencidas ?? 0)
  const qtdDespVencidas    = Number(k?.qtd_despesas_vencidas ?? 0)

  const inadPct = receitaAno > 0 ? (totalInadimplencia / receitaAno) * 100 : 0

  // ── Saldos ────────────────────────────────────────────────────────────────
  // v_saldos_ativos já entrega uma linha por conta ATIVA do grupo inteiro, com
  // o saldo mais recente e sem Conta Modelo. É estoque, não recorte de período:
  // o saldo de hoje é o acumulado de toda a história das contas.
  const contasAtivas = saldosRaw ?? []
  const totalCaixa = contasAtivas.reduce((s, c) => s + Number(c.saldo ?? 0), 0)
  const empresasComCaixa = new Set(contasAtivas.map(c => c.empresa_id)).size

  // ── Sync status ────────────────────────────────────────────────────────────
  const syncMap: Record<string, { status: string; finalizado_em: string | null; registros: number }> = {}
  for (const s of syncLogs ?? []) {
    if (!syncMap[s.fonte]) syncMap[s.fonte] = { status: s.status, finalizado_em: s.finalizado_em, registros: s.registros_processados ?? 0 }
  }
  const syncContaAzul = syncMap['conta_azul'] ?? null
  const ultimoSyncCA = syncContaAzul?.finalizado_em ? dataHoraCurta(syncContaAzul.finalizado_em) : 'Nunca'

  // ── LUI / Briefing ────────────────────────────────────────────────────────
  const ultimaInteracaoLUI = conversaLui?.updated_at ?? null
  const briefingExisteHoje = !!briefingHoje

  // ── Alertas consolidados ──────────────────────────────────────────────────
  type Alerta = { nivel: 'critico' | 'atencao'; area: string; msg: string; href: string }
  const alertas: Alerta[] = []

  if (totalDespVencidas > 0)
    alertas.push({ nivel: 'critico', area: 'Financeiro', msg: `${qtdDespVencidas} despesa${qtdDespVencidas > 1 ? 's' : ''} vencida${qtdDespVencidas > 1 ? 's' : ''} — ${fmtK(totalDespVencidas)}`, href: '/dashboard/financeiro/contas?status=vencido&tipo=despesa' })
  if (inadPct > 10)
    alertas.push({ nivel: 'critico', area: 'Financeiro', msg: `Inadimplência crítica: ${inadPct.toFixed(1)}% — ${fmtK(totalInadimplencia)}`, href: '/dashboard/financeiro/inadimplentes' })
  else if (inadPct > 5)
    alertas.push({ nivel: 'atencao', area: 'Financeiro', msg: `Inadimplência elevada: ${inadPct.toFixed(1)}% — ${fmtK(totalInadimplencia)}`, href: '/dashboard/financeiro/inadimplentes' })
  if (totalAPagar > 0)
    alertas.push({ nivel: 'atencao', area: 'Financeiro', msg: `${qtdAPagar} conta${qtdAPagar > 1 ? 's' : ''} em aberto em ${anoAtual} — ${fmtK(totalAPagar)}`, href: '/dashboard/financeiro/contas' })
  if (!socOk)
    alertas.push({ nivel: 'atencao', area: 'SOC', msg: 'SOC não configurado — Lari e Dieguito sem dados reais', href: '/dashboard/medicina' })
  if (syncContaAzul?.status === 'erro')
    alertas.push({ nivel: 'critico', area: 'Integração', msg: 'Erro no último sync do Conta Azul', href: '/dashboard/financeiro' })

  // ── Sales IA KPIs (via os_eventos) ───────────────────────────────────────
  type SalesEvento = { tipo: string; payload: Record<string, unknown> }
  const salesRows = (salesEventos ?? []) as SalesEvento[]
  const salesLeads   = salesRows.filter(e => e.tipo === 'lead_criado').length
  const salesVendas  = salesRows.filter(e => e.tipo === 'venda_fechada')
  const salesMRR     = salesVendas.reduce((s, e) => {
    const meta = e.payload?._meta as Record<string, unknown> | undefined
    const amount = meta?.amount ?? (e.payload?.valor_total as number | undefined)
    return s + (typeof amount === 'number' ? amount : 0)
  }, 0)
  const hasSalesData = coreOk && salesRows.length > 0

  const horaAtual = horaCurta()
  const dataAtual = dataPorExtenso()
  const empresasAtivas = (empresas ?? []).filter(e => e.status === 'ativa')

  return (
    <main className="min-h-screen" style={{ background: 'var(--paper)', color: 'var(--ink)' }}>

      {/* ── MASTHEAD ─────────────────────────────────────────────────────────── */}
      <header style={{ borderTop: '4px solid var(--ink)' }}>
        <div className="max-w-screen-2xl mx-auto px-6 md:px-10 pt-5">
          <div className="flex items-end justify-between pb-4" style={{ borderBottom: '2px solid var(--ink)' }}>
            <div>
              <p className="eyebrow mb-2" style={{ color: 'var(--ink-3)' }}>
                GP SafeWork · Holding SST · {empresasAtivas.length} empresas ativas
              </p>
              <h1 className="font-display font-bold leading-none tracking-tight text-5xl md:text-7xl" style={{ color: 'var(--ink)' }}>
                Centro de Comando
              </h1>
            </div>
            <div className="text-right shrink-0 hidden md:block pb-1">
              <p className="eyebrow capitalize mb-1" style={{ color: 'var(--ink-3)' }}>{dataAtual}</p>
              <p className="font-mono text-3xl font-semibold leading-none" style={{ color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{horaAtual}</p>
              <div className={`mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold border ${
                alertas.some(a => a.nivel === 'critico')
                  ? 'border-red-700 text-red-700'
                  : alertas.length > 0
                  ? 'border-amber-600 text-amber-700'
                  : 'border-emerald-600 text-emerald-700'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                  alertas.some(a => a.nivel === 'critico') ? 'bg-red-600'
                  : alertas.length > 0 ? 'bg-amber-500'
                  : 'bg-emerald-500'
                }`} />
                {alertas.some(a => a.nivel === 'critico') ? 'Ação urgente'
                  : alertas.length > 0 ? `${alertas.length} atenção`
                  : 'Operacional'}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-screen-2xl mx-auto px-6 md:px-10">

        {/* ── ALERTAS ────────────────────────────────────────────────────────── */}
        {alertas.length > 0 && (
          <div className="py-3" style={{ borderBottom: '1px solid var(--rule)' }}>
            {alertas.map((a, i) => (
              <a key={i} href={a.href}
                className="flex items-center gap-3 py-2 group hover:opacity-70 transition-opacity"
                style={{ borderLeft: `3px solid ${a.nivel === 'critico' ? 'var(--accent)' : '#D97706'}`, paddingLeft: '0.75rem' }}
              >
                <span className="eyebrow shrink-0" style={{ color: a.nivel === 'critico' ? 'var(--accent)' : '#B45309' }}>
                  {a.area}
                </span>
                <span className="text-sm font-medium" style={{ color: a.nivel === 'critico' ? 'var(--accent)' : 'var(--ink-2)' }}>
                  {a.msg}
                </span>
                <span className="ml-auto text-xs shrink-0" style={{ color: a.nivel === 'critico' ? 'var(--accent)' : '#B45309' }}>→</span>
              </a>
            ))}
          </div>
        )}

        {/* ── KPIs FINANCEIROS ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4" style={{ borderBottom: '1px solid var(--rule)' }}>
          {([
            {
              label: 'Caixa Total',
              href: '/dashboard/financeiro',
              value: fmtK(totalCaixa),
              sub: `${empresasComCaixa} empresas · ${contasAtivas.length} contas`,
              estado: totalCaixa < 0 ? 'neg' : 'ok',
            },
            {
              label: 'Inadimplência',
              href: '/dashboard/financeiro/inadimplentes',
              value: fmtK(totalInadimplencia),
              sub: `${qtdInadimplencia} títulos · ${inadPct.toFixed(1)}% da receita ${anoAtual}`,
              estado: inadPct > 10 ? 'neg' : inadPct > 5 ? 'warn' : 'ok',
            },
            {
              label: `A Pagar — ${anoAtual}`,
              href: '/dashboard/financeiro/contas',
              value: fmtK(totalAPagar),
              sub: totalDespVencidas > 0
                ? `${qtdAPagar} em aberto · ${qtdDespVencidas} vencidos`
                : `${qtdAPagar} títulos em aberto`,
              estado: totalDespVencidas > 0 ? 'neg' : 'ok',
            },
            {
              // Dois níveis: a operação dá lucro, e o que sobra depois do que
              // é conta patrimonial (investimento, empréstimo, parcelamento).
              // Antes só o primeiro aparecia e a diferença sumia da tela.
              label: `Resultado — ${anoAtual}`,
              href: '/dashboard/financeiro/dre',
              value: fmtK(resultadoAno),
              sub: naoOperacional > 0
                ? `caixa ${fmtK(geracaoCaixa)} após ${fmtK(naoOperacional)} fora da operação`
                : `${fmtK(receitaAno)} − ${fmtK(despesaAno)}`,
              estado: resultadoAno < 0 ? 'neg' : geracaoCaixa < 0 ? 'warn' : 'pos',
            },
          ] as { label: string; href: string; value: string; sub: string; estado: string }[]).map((kpi, i) => (
            <a
              key={i}
              href={kpi.href}
              className="py-6 px-5 group transition-colors hover-paper-2"
              style={{
                borderRight: i < 3 ? '1px solid var(--rule)' : undefined,
              }}
            >
              <p className="eyebrow mb-2" style={{ color: 'var(--ink-4)' }}>{kpi.label}</p>
              <p
                className="font-display font-bold leading-none text-4xl md:text-5xl"
                style={{
                  color: kpi.estado === 'neg' ? 'var(--accent)'
                    : kpi.estado === 'warn' ? '#B45309'
                    : kpi.estado === 'pos' ? '#166534'
                    : 'var(--ink)',
                  fontVariantNumeric: 'tabular-nums',
                  letterSpacing: '-0.03em',
                }}
              >
                {kpi.value}
              </p>
              <p className="text-xs mt-2" style={{
                color: kpi.estado === 'neg' ? 'var(--accent)' : kpi.estado === 'warn' ? '#B45309' : 'var(--ink-3)',
              }}>
                {kpi.sub}
              </p>
            </a>
          ))}
        </div>

        {/* ── SALES IA — KPIs (só aparece quando Core conectado e tem dados) ─── */}
        {hasSalesData && (
          <div className="py-5" style={{ borderBottom: '1px solid var(--rule)' }}>
            <div className="flex items-center justify-between mb-4">
              <p className="eyebrow" style={{ color: 'var(--ink-3)' }}>GP Sales IA — Pipeline</p>
              <a href="/dashboard/os" className="text-[11px] font-semibold hover:underline" style={{ color: 'var(--accent)' }}>
                Ver arquitetura →
              </a>
            </div>
            <div className="grid grid-cols-3 md:grid-cols-3 gap-0" style={{ borderTop: '1px solid var(--rule)' }}>
              {[
                { label: 'Leads criados',   value: String(salesLeads),  sub: 'acumulado' },
                { label: 'Vendas fechadas', value: String(salesVendas.length), sub: 'acumulado' },
                { label: 'Receita gerada',  value: fmtK(salesMRR), sub: 'valor total fechado' },
              ].map(kpi => (
                <div key={kpi.label} className="py-4 pr-6" style={{ borderRight: '1px solid var(--rule)' }}>
                  <p className="eyebrow mb-1" style={{ color: 'var(--ink-4)' }}>{kpi.label}</p>
                  <p className="font-display font-bold text-3xl leading-none" style={{ color: 'var(--ink)' }}>{kpi.value}</p>
                  <p className="text-[11px] mt-1" style={{ color: 'var(--ink-4)' }}>{kpi.sub}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── AGENTES IA ─────────────────────────────────────────────────────── */}
        <div className="py-6" style={{ borderBottom: '1px solid var(--rule)' }}>
          <p className="eyebrow mb-5" style={{ color: 'var(--ink-3)' }}>Agentes IA — Time de Gestão</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6" style={{ borderTop: '1px solid var(--rule)' }}>

            {([
              {
                href: '/dashboard/lui',
                sigla: 'L',
                cor: 'var(--ink)',
                corTexto: 'var(--paper)',
                area: 'CEO / IA',
                nome: 'LUI',
                status: 'ativo',
                info: [`Última: ${relTime(ultimaInteracaoLUI)}`, `Briefing: ${briefingExisteHoje ? '✓ gerado' : 'pendente'}`],
              },
              {
                href: '/dashboard/financeiro',
                sigla: 'Pl',
                cor: '#92400E',
                corTexto: '#FEF3C7',
                area: 'Financeiro',
                nome: 'Plata',
                status: syncContaAzul?.status === 'erro' ? 'erro' : syncContaAzul ? 'ativo' : 'pendente',
                info: [`Sync: ${ultimoSyncCA}`, `${(lancamentosNoAno ?? 0).toLocaleString('pt-BR')} lançamentos em ${anoAtual}`],
              },
              {
                href: '/dashboard/medicina',
                sigla: 'La',
                cor: '#166534',
                corTexto: '#D1FAE5',
                area: 'Medicina',
                nome: 'Lari',
                status: socOk ? 'ativo' : 'pendente',
                info: [`SOC: ${socOk ? 'Conectado' : 'Pendente'}`, 'ASOs · PCMSO'],
              },
              {
                href: '/dashboard/engenharia',
                sigla: 'Di',
                cor: '#7C2D12',
                corTexto: '#FFEDD5',
                area: 'Engenharia',
                nome: 'Dieguito',
                status: socOk ? 'ativo' : 'pendente',
                info: [`SOC: ${socOk ? 'Conectado' : 'Pendente'}`, 'PGR · NRs · EPI'],
              },
              {
                href: '/dashboard/rh',
                sigla: 'Le',
                cor: '#134E4A',
                corTexto: '#CCFBF1',
                area: 'RH & Pessoas',
                nome: 'Le',
                status: 'ativo',
                info: [`${rhHeadcount} func. DP`, `${rhTotalPessoas} organograma`],
              },
              {
                href: '/dashboard/processos',
                sigla: 'Ca',
                cor: '#312E81',
                corTexto: '#E0E7FF',
                area: 'Processos',
                nome: 'Carlitos',
                status: 'ativo',
                info: ['3 produtos SafeHelp', '5 estagiários'],
              },
            ] as { href: string; sigla: string; cor: string; corTexto: string; area: string; nome: string; status: string; info: string[] }[]).map((ag, i, arr) => (
              <a
                key={ag.href}
                href={ag.href}
                className="p-4 transition-colors group hover-paper-2"
                style={{
                  borderRight: i < arr.length - 1 ? '1px solid var(--rule)' : undefined,
                }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div
                    className="w-7 h-7 flex items-center justify-center text-xs font-bold"
                    style={{ background: ag.cor, color: ag.corTexto }}
                  >
                    {ag.sigla}
                  </div>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    ag.status === 'ativo' ? 'bg-emerald-500'
                    : ag.status === 'erro' ? 'bg-red-500 animate-pulse'
                    : 'bg-amber-400'
                  }`} />
                </div>
                <p className="eyebrow mb-1" style={{ color: 'var(--ink-4)' }}>{ag.area}</p>
                <p className="font-display text-lg font-bold leading-tight" style={{ color: 'var(--ink)' }}>{ag.nome}</p>
                <div className="mt-3 space-y-0.5 text-[11px]" style={{ color: 'var(--ink-3)' }}>
                  {ag.info.map((line, j) => <p key={j}>{line}</p>)}
                </div>
              </a>
            ))}

          </div>
        </div>

        {/* ── WHATSAPP MIRROR ────────────────────────────────────────────────── */}
        <div className="py-6" style={{ borderBottom: '1px solid var(--rule)' }}>
          <WhatsAppMirrorFeed mensagensIniciais={(mensagensMirror ?? []) as MensagemMirror[]} />
        </div>

        {/* ── FILA INFERIOR — EMPRESAS / BRIEFING / ACESSO RÁPIDO ───────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 py-8 gap-0" style={{ borderBottom: '1px solid var(--rule)' }}>

          {/* EMPRESAS */}
          <div className="md:pr-8 mb-8 md:mb-0" style={{ borderRight: undefined }}>
            <p className="eyebrow mb-4" style={{ color: 'var(--ink-3)' }}>
              Grupo GP SafeWork — {empresasAtivas.length} ativas
            </p>
            <div>
              {empresasAtivas.map(e => (
                <div key={e.id} className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--rule)' }}>
                  <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{e.nome_curto}</span>
                  <span className="eyebrow text-emerald-700">ativa</span>
                </div>
              ))}
              {(empresas ?? []).filter(e => e.status !== 'ativa').map(e => (
                <div key={e.id} className="flex items-center justify-between py-2 opacity-50" style={{ borderBottom: '1px solid var(--rule)' }}>
                  <span className="text-sm" style={{ color: 'var(--ink-3)' }}>{e.nome_curto}</span>
                  <span className="eyebrow" style={{ color: 'var(--ink-4)' }}>{e.status}</span>
                </div>
              ))}
            </div>
          </div>

          {/* BRIEFING */}
          <div className="md:px-8 mb-8 md:mb-0" style={{ borderLeft: '1px solid var(--rule)', borderRight: '1px solid var(--rule)' }}>
            <div className="flex items-baseline justify-between mb-4">
              <p className="eyebrow" style={{ color: 'var(--ink-3)' }}>Briefing de Hoje</p>
              {briefingExisteHoje && <span className="eyebrow text-emerald-700">gerado</span>}
            </div>
            {briefingHoje ? (
              <div>
                <p className="text-sm leading-relaxed line-clamp-10 whitespace-pre-wrap" style={{ color: 'var(--ink-2)' }}>
                  {briefingHoje.conteudo}
                </p>
                <a href="/dashboard/lui" className="inline-block mt-4 text-xs font-semibold hover:underline" style={{ color: 'var(--accent)' }}>
                  Ver completo →
                </a>
              </div>
            ) : (
              <div className="py-2">
                <p className="font-display font-bold text-4xl leading-none mb-3" style={{ color: 'var(--rule)' }}>7h00</p>
                <p className="text-sm" style={{ color: 'var(--ink-3)' }}>
                  Briefing automático diário ainda não gerado.
                </p>
                <a href="/dashboard/lui" className="inline-block mt-4 text-xs font-semibold hover:underline" style={{ color: 'var(--accent)' }}>
                  Gerar via LUI →
                </a>
              </div>
            )}
          </div>

          {/* ACESSO RÁPIDO + INTEGRAÇÕES */}
          <div className="md:pl-8">
            <p className="eyebrow mb-4" style={{ color: 'var(--ink-3)' }}>Acesso Rápido</p>
            <div className="mb-6">
              {[
                { label: 'Plata — Financeiro',  href: '/dashboard/financeiro/plata' },
                { label: 'DRE',                  href: '/dashboard/financeiro/dre' },
                { label: 'Inadimplentes',         href: '/dashboard/financeiro/inadimplentes' },
                { label: 'Medicina',              href: '/dashboard/medicina' },
                { label: 'Engenharia',            href: '/dashboard/engenharia' },
                { label: 'Comercial',             href: '/dashboard/comercial' },
                { label: 'RH',                    href: '/dashboard/rh' },
                { label: 'Processos',             href: '/dashboard/processos' },
                { label: 'Sistema',               href: '/dashboard/sistema' },
                { label: 'GP SafeWork OS ↗',      href: '/dashboard/os' },
              ].map(link => (
                <a
                  key={link.href}
                  href={link.href}
                  className="flex items-center justify-between py-1.5 text-xs group hover-accent"
                  style={{ borderBottom: '1px solid var(--rule)', color: 'var(--ink-2)' }}
                >
                  <span>{link.label}</span>
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                </a>
              ))}
            </div>

            <p className="eyebrow mb-3" style={{ color: 'var(--ink-3)' }}>Integrações</p>
            {[
              { nome: 'Conta Azul',       status: syncContaAzul?.status ?? 'sem sync',     detalhe: syncContaAzul ? relTime(syncContaAzul.finalizado_em) : 'Nunca' },
              { nome: 'SOC',              status: socOk ? 'conectado' : 'pendente',         detalhe: socOk ? 'Dados reais' : 'Máscaras pendentes' },
              { nome: 'WhatsApp',         status: 'ativo',                                  detalhe: relTime(ultimaInteracaoLUI) },
              { nome: 'Pluggy',           status: pluggyOk ? 'conectado' : 'pendente',      detalhe: pluggyOk ? 'Open Finance' : 'Pendente' },
              { nome: 'GP OS Core',       status: coreOk  ? 'conectado' : 'pendente',      detalhe: coreOk  ? 'Eventos ao vivo' : 'Configurar CORE_READ_TOKEN' },
            ].map(integ => (
              <div key={integ.nome} className="flex items-center justify-between py-1.5" style={{ borderBottom: '1px solid var(--rule)' }}>
                <div>
                  <p className="text-xs font-medium" style={{ color: 'var(--ink)' }}>{integ.nome}</p>
                  <p className="text-[10px]" style={{ color: 'var(--ink-4)' }}>{integ.detalhe}</p>
                </div>
                <span className={`eyebrow ${
                  ['sucesso', 'conectado', 'ativo'].includes(integ.status) ? 'text-emerald-700'
                  : integ.status === 'erro' ? 'text-red-700'
                  : 'text-amber-600'
                }`}>
                  {integ.status}
                </span>
              </div>
            ))}
          </div>

        </div>

        {/* ── GP OS EVENTOS ────────────────────────────────────────────────────── */}
        <div className="py-6" style={{ borderBottom: '1px solid var(--rule)' }}>
          <OSEventsFeed eventosIniciais={(osEventos ?? []) as OsEvento[]} />
        </div>

        {/* ── RODAPÉ ──────────────────────────────────────────────────────────── */}
        <div className="py-5 text-center">
          <p className="eyebrow" style={{ color: 'var(--ink-4)' }}>
            GP SafeWork OS · Portal Executivo · {new Date().getFullYear()}
          </p>
        </div>

      </div>
    </main>
  )
}
