import { createClient } from '@/lib/supabase/server'
import { createClient as sb } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import {
  getRiscos,
  getEntregasEpi,
  getEmpresasClientes,
  getTodosFuncionarios,
  socConfigurado,
} from '@/lib/soc/client'
import DieguitorChat from './DieguitorChat'
import MemoriasPanel from '../components/MemoriasPanel'

type Ghe = {
  codigoGhe?: string; descricaoGhe?: string; codigoUnidadeCliente?: string
  maiorAdicionalInsalubridade?: string
  existePericulosidade?: string
  existeAposentadoriaEspecial?: string
  maiorPeriodoAposentadoria?: string
}
type Epi = {
  NOME_EPI?: string; CODIGO_CA?: string; DATA_VENCIMENTO?: string
  MATRICULA?: string; EMPRESA?: string
}
type Empresa = { CODIGO: string; NOME: string; NUMERO_VIDAS?: string }
type Func = { SITUACAO?: string; NOMEEMPRESA?: string }

export default async function EngenhariaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const socOk = socConfigurado()

  const supaService = sb(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: convData } = await supaService
    .from('conversas_ia')
    .select('mensagens')
    .eq('agente', 'dieguito')
    .eq('canal', 'dashboard')
    .eq('contato_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const initialMessages = ((convData?.mensagens ?? []) as { role: 'user' | 'assistant'; content: string }[]).slice(-30)

  let ghe: Ghe[] = []
  let epis: Epi[] = []
  let empresas: Empresa[] = []
  let funcionarios: Func[] = []

  if (socOk) {
    ;[ghe, epis, empresas, funcionarios] = await Promise.all([
      getRiscos().then(r => r as Ghe[]).catch(() => []),
      getEntregasEpi().then(r => r as Epi[]).catch(() => []),
      getEmpresasClientes().catch(() => []) as Promise<Empresa[]>,
      getTodosFuncionarios().then(r => r as Func[]).catch(() => []),
    ])
  }

  const hoje = new Date().toISOString().split('T')[0]
  const d30  = new Date(Date.now() + 30 * 86_400_000).toISOString().split('T')[0]
  const d60  = new Date(Date.now() + 60 * 86_400_000).toISOString().split('T')[0]

  // GHE stats
  const comInsalubridade = ghe.filter(g => g.maiorAdicionalInsalubridade && g.maiorAdicionalInsalubridade !== '0')
  const comPericulosidade = ghe.filter(g => g.existePericulosidade === 'S' || g.existePericulosidade === 'Sim')
  const comAposEsp = ghe.filter(g => g.existeAposentadoriaEspecial === 'S' || g.existeAposentadoriaEspecial === 'Sim')

  // Distribuição por adicional de insalubridade
  const insalubMap: Record<string, number> = { '40': 0, '20': 0, '10': 0 }
  for (const g of comInsalubridade) {
    const v = g.maiorAdicionalInsalubridade ?? '0'
    if (v === '40') insalubMap['40']++
    else if (v === '20') insalubMap['20']++
    else if (v === '10') insalubMap['10']++
  }

  // EPI stats
  const caVencido = epis.filter(e => e.DATA_VENCIMENTO && e.DATA_VENCIMENTO < hoje)
  const caVencendo30 = epis.filter(e => e.DATA_VENCIMENTO && e.DATA_VENCIMENTO >= hoje && e.DATA_VENCIMENTO <= d30)
  const caVencendo60 = epis.filter(e => e.DATA_VENCIMENTO && e.DATA_VENCIMENTO > d30 && e.DATA_VENCIMENTO <= d60)

  const totalVidas = empresas.reduce((s, e) => s + Number(e.NUMERO_VIDAS ?? 0), 0)
  const ativos = funcionarios.filter(f => f.SITUACAO === 'Ativo').length

  // Top EPIs por nome
  const epiMap: Record<string, number> = {}
  for (const e of epis) {
    if (e.NOME_EPI) epiMap[e.NOME_EPI] = (epiMap[e.NOME_EPI] ?? 0) + 1
  }
  const topEpis = Object.entries(epiMap).sort((a, b) => b[1] - a[1]).slice(0, 8)

  // EPIs vencidos por nome — para agrupar
  const epiVencidoMap: Record<string, number> = {}
  for (const e of caVencido) {
    if (e.NOME_EPI) epiVencidoMap[e.NOME_EPI] = (epiVencidoMap[e.NOME_EPI] ?? 0) + 1
  }
  const topEpisVencidos = Object.entries(epiVencidoMap).sort((a, b) => b[1] - a[1]).slice(0, 5)

  // GHE por unidade/empresa
  const gheEmpMap: Record<string, number> = {}
  for (const g of ghe) {
    const u = g.codigoUnidadeCliente ?? 'Sem unidade'
    gheEmpMap[u] = (gheEmpMap[u] ?? 0) + 1
  }

  // Alertas
  const alertas: { nivel: 'critico' | 'atencao'; msg: string }[] = []
  if (caVencido.length > 0)
    alertas.push({ nivel: 'critico', msg: `${caVencido.length} EPI${caVencido.length > 1 ? 's' : ''} com CA vencido — uso irregular, passivo em acidente` })
  if (caVencendo30.length > 0)
    alertas.push({ nivel: 'atencao', msg: `${caVencendo30.length} CA${caVencendo30.length > 1 ? 's' : ''} vencendo em 30 dias — iniciar processo de compra` })
  if (comAposEsp.length > 0)
    alertas.push({ nivel: 'atencao', msg: `${comAposEsp.length} GHE${comAposEsp.length > 1 ? 's' : ''} com aposentadoria especial — verificar PPP e LTCAT atualizados` })

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      {/* Header — banner azul corporativo */}
      <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white">
        <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6">
          <a href="/dashboard" className="text-blue-200/80 text-sm hover:text-white inline-block mb-2">← Centro de Comando</a>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 text-white flex items-center justify-center text-xl font-bold shadow-lg">Di</div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Dieguito — Engenharia de Segurança</h1>
              <p className="text-blue-100/90 text-sm">GHE · EPIs · PGR · LTCAT · Conformidade NR</p>
            </div>
            <div className={`ml-auto flex items-center gap-2 px-3 py-1.5 rounded-full border backdrop-blur-sm ${socOk ? 'bg-emerald-500/20 border-emerald-300/40 text-emerald-100' : 'bg-amber-500/20 border-amber-300/40 text-amber-100'}`}>
              <span className={`w-2 h-2 rounded-full ${socOk ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span className="text-xs font-medium">
                {socOk ? 'SOC conectado' : 'SOC não configurado'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6 md:py-8">

      {/* Alertas */}
      {alertas.length > 0 && (
        <div className="mb-6 space-y-2">
          {alertas.map((a, i) => (
            <div key={i} className={`rounded-xl px-4 py-3 flex items-start gap-3 border ${
              a.nivel === 'critico'
                ? 'bg-red-50 border-red-200'
                : 'bg-amber-50 border-amber-200'
            }`}>
              <span className="text-lg mt-0.5">{a.nivel === 'critico' ? '🔴' : '⚠️'}</span>
              <p className="text-sm text-slate-800">{a.msg}</p>
            </div>
          ))}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8">
        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <p className="text-2xl font-bold text-slate-900">{socOk ? ghe.length : '—'}</p>
          <p className="text-xs text-slate-500 mt-1">GHEs ativos</p>
        </div>
        <div className={`rounded-xl p-4 border ${comInsalubridade.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
          <p className={`text-2xl font-bold ${comInsalubridade.length > 0 ? 'text-amber-700' : 'text-slate-900'}`}>
            {socOk ? comInsalubridade.length : '—'}
          </p>
          <p className="text-xs text-slate-500 mt-1">Insalubridade</p>
        </div>
        <div className={`rounded-xl p-4 border ${comPericulosidade.length > 0 ? 'bg-orange-950/30 border-orange-200' : 'bg-white border-slate-200'}`}>
          <p className={`text-2xl font-bold ${comPericulosidade.length > 0 ? 'text-orange-700' : 'text-slate-900'}`}>
            {socOk ? comPericulosidade.length : '—'}
          </p>
          <p className="text-xs text-slate-500 mt-1">Periculosidade</p>
        </div>
        <div className={`rounded-xl p-4 border ${caVencido.length > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
          <p className={`text-2xl font-bold ${caVencido.length > 0 ? 'text-red-700' : 'text-slate-900'}`}>
            {socOk ? caVencido.length : '—'}
          </p>
          <p className="text-xs text-slate-500 mt-1">CA vencido</p>
          {caVencido.length > 0 && <p className="text-[10px] text-red-700 mt-0.5">risco legal</p>}
        </div>
        <div className={`rounded-xl p-4 border ${caVencendo30.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
          <p className={`text-2xl font-bold ${caVencendo30.length > 0 ? 'text-amber-700' : 'text-slate-900'}`}>
            {socOk ? caVencendo30.length : '—'}
          </p>
          <p className="text-xs text-slate-500 mt-1">CA vencendo 30d</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <p className="text-2xl font-bold text-slate-900">{socOk ? totalVidas.toLocaleString('pt-BR') : '—'}</p>
          <p className="text-xs text-slate-500 mt-1">Total de vidas</p>
          {socOk && ativos > 0 && <p className="text-[10px] text-slate-500 mt-0.5">{ativos} ativos</p>}
        </div>
      </div>

      {/* Layout principal */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Chat Dieguito — 2/3 */}
        <div className="md:col-span-2 space-y-6">
          <div>
            <h2 className="text-sm font-semibold text-slate-500 mb-3">Chat com Dieguito</h2>
            <DieguitorChat initialMessages={initialMessages} />
          </div>

          {/* EPIs vencidos por nome */}
          {topEpisVencidos.length > 0 && (
            <div className="bg-red-50 rounded-xl p-5 border border-red-200">
              <h3 className="text-xs font-semibold text-red-700 uppercase tracking-wider mb-4">
                EPIs com CA Vencido — {caVencido.length} registros
              </h3>
              <div className="space-y-3">
                {topEpisVencidos.map(([epi, qty]) => (
                  <div key={epi}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs text-slate-800 flex-1 mr-2">{epi}</span>
                      <span className="text-xs font-medium text-red-700 shrink-0">{qty} CA{qty > 1 ? 's' : ''}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-red-700 rounded-full"
                        style={{ width: `${(qty / topEpisVencidos[0][1]) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              {caVencido.length > 5 && (
                <p className="text-xs text-slate-500 mt-3">
                  + {caVencido.length - topEpisVencidos.reduce((s, [, q]) => s + q, 0)} outros CAs vencidos
                </p>
              )}
              <div className="mt-4 pt-3 border-t border-red-900/30">
                <p className="text-[10px] text-red-700 font-medium">
                  → CA vencido = EPI sem certificado de aprovação = uso proibido pelo MTE
                </p>
              </div>
            </div>
          )}

          {/* Top EPIs usados */}
          {topEpis.length > 0 && (
            <div className="bg-white rounded-xl p-5 border border-slate-200">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">EPIs mais utilizados</h3>
              <div className="space-y-3">
                {topEpis.map(([epi, qty]) => {
                  const pct = epis.length > 0 ? (qty / epis.length) * 100 : 0
                  return (
                    <div key={epi}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs text-slate-700 truncate flex-1 mr-2">{epi}</span>
                        <span className="text-xs font-medium text-orange-700 shrink-0">{qty.toLocaleString('pt-BR')}</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-orange-700 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar — 1/3 */}
        <div className="space-y-4">
          {/* Exposição GHE */}
          <div className="bg-white rounded-xl p-4 border border-slate-200">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Exposição — GHE</h3>
            <div className="space-y-2">
              {[
                { label: 'Total GHEs', val: ghe.length, color: 'text-slate-900' },
                { label: 'Insalubridade', val: comInsalubridade.length, color: 'text-amber-700' },
                { label: 'Periculosidade', val: comPericulosidade.length, color: 'text-orange-700' },
                { label: 'Aposent. especial', val: comAposEsp.length, color: 'text-blue-700' },
              ].map(row => (
                <div key={row.label} className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">{row.label}</span>
                  <span className={`text-xs font-medium ${row.color}`}>{socOk ? row.val : '—'}</span>
                </div>
              ))}
            </div>
            {/* Insalubridade por grau */}
            {comInsalubridade.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-200">
                <p className="text-[10px] text-slate-500 mb-2">Graus de insalubridade:</p>
                <div className="flex gap-3">
                  {Object.entries(insalubMap).map(([grau, qty]) => qty > 0 && (
                    <div key={grau} className="text-center">
                      <p className="text-sm font-bold text-amber-700">{qty}</p>
                      <p className="text-[10px] text-slate-500">{grau}%</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* CA timeline */}
          <div className="bg-white rounded-xl p-4 border border-slate-200">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Status CAs</h3>
            <div className="space-y-3">
              <div className={`flex items-center justify-between p-2 rounded-lg ${caVencido.length > 0 ? 'bg-red-50' : 'bg-slate-100'}`}>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${caVencido.length > 0 ? 'bg-red-500' : 'bg-slate-400'}`} />
                  <span className="text-xs text-slate-700">Vencidos</span>
                </div>
                <span className={`text-xs font-bold ${caVencido.length > 0 ? 'text-red-700' : 'text-slate-500'}`}>
                  {socOk ? caVencido.length : '—'}
                </span>
              </div>
              <div className={`flex items-center justify-between p-2 rounded-lg ${caVencendo30.length > 0 ? 'bg-amber-50' : 'bg-slate-100'}`}>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${caVencendo30.length > 0 ? 'bg-yellow-500' : 'bg-slate-400'}`} />
                  <span className="text-xs text-slate-700">Vencendo &lt;30d</span>
                </div>
                <span className={`text-xs font-bold ${caVencendo30.length > 0 ? 'text-amber-700' : 'text-slate-500'}`}>
                  {socOk ? caVencendo30.length : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-100">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-xs text-slate-700">Vencendo 30–60d</span>
                </div>
                <span className="text-xs font-bold text-blue-700">
                  {socOk ? caVencendo60.length : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Memórias do Dieguito */}
          <MemoriasPanel agente="dieguito" />

          {/* Referências NR */}
          <div className="bg-white rounded-xl p-4 border border-slate-200">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">eSocial Engenharia</h3>
            <div className="space-y-2">
              {[
                { evento: 'S-2240', desc: 'Cond. ambientais', prazo: 'Admissão + anual', cor: 'text-orange-700' },
                { evento: 'S-2245', desc: 'Treinamentos', prazo: 'Após cada NR', cor: 'text-blue-700' },
              ].map(e => (
                <div key={e.evento} className="flex items-start justify-between gap-2">
                  <div>
                    <span className={`text-[11px] font-mono font-bold ${e.cor}`}>{e.evento}</span>
                    <span className="text-[11px] text-slate-500 ml-1">{e.desc}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 text-right">{e.prazo}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-200">
              <p className="text-[10px] text-slate-500">Documentos periódicos:</p>
              <div className="mt-1 space-y-1">
                <p className="text-[10px] text-slate-500">PGR — revisão anual obrigatória</p>
                <p className="text-[10px] text-slate-500">LTCAT — revisão a cada 2 anos</p>
                <p className="text-[10px] text-slate-500">PPP — na demissão de exposto</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </main>
  )
}
