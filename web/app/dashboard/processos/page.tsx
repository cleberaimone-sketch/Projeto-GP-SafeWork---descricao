import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import CarlitosChat from './CarlitosChat'
import MemoriasPanel from '../components/MemoriasPanel'
import {
  PRODUTOS_SAFEHELP,
  PROCESSOS_OPERACIONAIS,
  EQUIPE_TECH_CARLITOS,
  INDICADORES_TECH,
  type StatusProduto,
} from '@/lib/processos/dados'

const STATUS_COR: Record<StatusProduto, { fundo: string; texto: string; borda: string; label: string }> = {
  ativo:      { fundo: 'bg-emerald-50',  texto: 'text-emerald-700',  borda: 'border-emerald-200',  label: 'ATIVO' },
  beta:       { fundo: 'bg-sky-50',      texto: 'text-sky-700',      borda: 'border-sky-200',      label: 'BETA' },
  mvp:        { fundo: 'bg-violet-50',   texto: 'text-violet-700',   borda: 'border-violet-200',   label: 'MVP' },
  planejado:  { fundo: 'bg-slate-100',   texto: 'text-slate-600',    borda: 'border-slate-200',    label: 'PLANEJADO' },
  pausado:    { fundo: 'bg-amber-50',    texto: 'text-amber-700',    borda: 'border-amber-200',    label: 'PAUSADO' },
}

const STATUS_PROC: Record<'em_dia' | 'atencao' | 'critico', { fundo: string; texto: string; icone: string }> = {
  em_dia:  { fundo: 'bg-emerald-50',  texto: 'text-emerald-700',  icone: '✓' },
  atencao: { fundo: 'bg-amber-50',    texto: 'text-amber-700',    icone: '⚠' },
  critico: { fundo: 'bg-rose-50',     texto: 'text-rose-700',     icone: '🔴' },
}

export default async function ProcessosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const sb = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: convData } = await sb
    .from('conversas_ia')
    .select('mensagens')
    .eq('agente', 'carlitos')
    .eq('canal', 'dashboard')
    .eq('contato_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const initialMessages = ((convData?.mensagens ?? []) as { role: 'user' | 'assistant'; content: string }[]).slice(-30)

  const processosCriticos = PROCESSOS_OPERACIONAIS.filter(p => p.status !== 'em_dia')
  const totalProcessos = PROCESSOS_OPERACIONAIS.length
  const emDia = PROCESSOS_OPERACIONAIS.filter(p => p.status === 'em_dia').length

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white">
        <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6">
          <a href="/dashboard" className="text-blue-200/80 text-sm hover:text-white inline-block mb-2">← Centro de Comando</a>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-700 text-white flex items-center justify-center text-xl font-bold shadow-lg">Ca</div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Carlitos — Processos & Tech</h1>
              <p className="text-blue-100/90 text-sm">SafeHelp · Processos transversais · Time de tech</p>
            </div>
            <div className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-full border bg-indigo-500/20 border-indigo-300/40 text-indigo-100">
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
              <span className="text-xs font-medium">{INDICADORES_TECH.estagiariosAtivos} estagiários</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6 md:py-8">

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-white rounded-xl p-4 border border-slate-200">
            <p className="text-3xl font-bold text-slate-900 tabular-nums">{PRODUTOS_SAFEHELP.length}</p>
            <p className="text-[11px] text-indigo-700 uppercase tracking-wider font-medium mt-1">Produtos SafeHelp</p>
            <p className="text-[10px] text-slate-500 mt-0.5">SafeChat · SafeDocs · SafeApp</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-200">
            <p className="text-3xl font-bold text-emerald-700 tabular-nums">{emDia}/{totalProcessos}</p>
            <p className="text-[11px] text-emerald-700 uppercase tracking-wider font-medium mt-1">Processos em dia</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{processosCriticos.length} com atenção/críticos</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-200">
            <p className="text-3xl font-bold text-slate-900 tabular-nums">{INDICADORES_TECH.estagiariosAtivos}</p>
            <p className="text-[11px] text-slate-600 uppercase tracking-wider font-medium mt-1">Time tech</p>
            <p className="text-[10px] text-slate-500 mt-0.5">front · back · QA</p>
          </div>
          <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
            <p className="text-3xl font-bold text-amber-700 tabular-nums">—</p>
            <p className="text-[11px] text-amber-700 uppercase tracking-wider font-medium mt-1">ClickUp</p>
            <p className="text-[10px] text-amber-700 mt-0.5">pendente de integração</p>
          </div>
        </div>

        {/* Layout: chat + sidebar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Coluna principal — chat e processos */}
          <div className="md:col-span-2 space-y-6">
            <div>
              <h2 className="text-sm font-semibold text-slate-500 mb-3">Chat com Carlitos</h2>
              <CarlitosChat initialMessages={initialMessages} />
            </div>

            {/* Produtos SafeHelp */}
            <div className="bg-white rounded-xl p-5 border border-slate-200">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Produtos SafeHelp</h3>
              <div className="space-y-3">
                {PRODUTOS_SAFEHELP.map(p => {
                  const cor = STATUS_COR[p.status]
                  return (
                    <div key={p.nome} className={`rounded-lg p-3 border ${cor.borda} ${cor.fundo}`}>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-semibold text-slate-800">{p.nome}</p>
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${cor.texto}`}>{cor.label}</span>
                      </div>
                      <p className="text-xs text-slate-600">{p.descricao}</p>
                      {p.notas && <p className="text-[10px] text-slate-500 mt-1.5">{p.notas}</p>}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Processos transversais */}
            <div className="bg-white rounded-xl p-5 border border-slate-200">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Processos Transversais</h3>
              <div className="space-y-2">
                {PROCESSOS_OPERACIONAIS.map(p => {
                  const cor = STATUS_PROC[p.status]
                  return (
                    <div key={p.nome} className="flex items-start gap-3 py-2 border-b border-slate-100 last:border-0">
                      <span className={`text-lg ${cor.texto}`}>{cor.icone}</span>
                      <div className="flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-sm font-medium text-slate-800">{p.nome}</p>
                          <span className="text-[10px] text-slate-500 shrink-0">{p.area}</span>
                        </div>
                        {p.notas && <p className="text-[11px] text-slate-500 mt-0.5">{p.notas}</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Equipe */}
            <div className="bg-white rounded-xl p-4 border border-slate-200">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Time de Tech</h3>
              <div className="space-y-2">
                {EQUIPE_TECH_CARLITOS.map((e, i) => (
                  <div key={i} className="text-xs text-slate-700 flex items-start gap-2">
                    <span className="text-indigo-500 mt-0.5">→</span>
                    <span>{e}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Indicadores tech */}
            <div className="bg-white rounded-xl p-4 border border-slate-200">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Indicadores</h3>
              <div className="space-y-2.5 text-xs">
                <div>
                  <p className="text-slate-500">Velocidade semanal</p>
                  <p className="text-slate-800 mt-0.5">{INDICADORES_TECH.velocidadeTimeSemanal}</p>
                </div>
                <div>
                  <p className="text-slate-500">Bugs abertos</p>
                  <p className="text-slate-800 mt-0.5">{INDICADORES_TECH.bugsAbertos}</p>
                </div>
                <div>
                  <p className="text-slate-500">Releases (30d)</p>
                  <p className="text-slate-800 mt-0.5">{INDICADORES_TECH.releasesUltimo30d}</p>
                </div>
                <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mt-2">
                  {INDICADORES_TECH.observacao}
                </p>
              </div>
            </div>

            {/* Memórias do Carlitos */}
            <MemoriasPanel agente="carlitos" />

            {/* Integrações */}
            <div className="bg-white rounded-xl p-4 border border-slate-200">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Integrações</h3>
              <div className="space-y-1.5 text-xs">
                {[
                  { nome: 'SOC', status: 'ativo' },
                  { nome: 'Conta Azul', status: 'ativo' },
                  { nome: 'D4sign', status: 'ativo' },
                  { nome: 'RD Station', status: 'ativo' },
                  { nome: 'Z-API / Evolution', status: 'ativo' },
                  { nome: 'Pluggy', status: 'integrando' },
                  { nome: 'ClickUp', status: 'pendente' },
                  { nome: 'Unisyst', status: 'planejado' },
                ].map(i => (
                  <div key={i.nome} className="flex items-center justify-between">
                    <span className="text-slate-700">{i.nome}</span>
                    <span className={`text-[10px] uppercase tracking-wider ${
                      i.status === 'ativo' ? 'text-emerald-700' :
                      i.status === 'integrando' ? 'text-sky-700' :
                      i.status === 'pendente' ? 'text-amber-700' :
                      'text-slate-500'
                    }`}>{i.status}</span>
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
