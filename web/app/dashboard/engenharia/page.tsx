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
    <main className="min-h-screen bg-gray-950 text-white p-6 md:p-8">
      {/* Header */}
      <div className="mb-8">
        <a href="/dashboard" className="text-gray-500 text-sm hover:text-gray-300">← Centro de Comando</a>
        <div className="flex items-center gap-4 mt-2">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-600 to-orange-900 flex items-center justify-center text-xl font-bold">Di</div>
          <div>
            <h1 className="text-2xl font-bold">Dieguito — Engenharia de Segurança</h1>
            <p className="text-gray-400 text-sm">GHE · EPIs · PGR · LTCAT · Conformidade NR</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${socOk ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'}`} />
            <span className={`text-xs ${socOk ? 'text-green-400' : 'text-yellow-400'}`}>
              {socOk ? 'SOC conectado' : 'SOC não configurado'}
            </span>
          </div>
        </div>
      </div>

      {/* Alertas */}
      {alertas.length > 0 && (
        <div className="mb-6 space-y-2">
          {alertas.map((a, i) => (
            <div key={i} className={`rounded-xl px-4 py-3 flex items-start gap-3 border ${
              a.nivel === 'critico'
                ? 'bg-red-950/40 border-red-900/50'
                : 'bg-yellow-950/30 border-yellow-900/40'
            }`}>
              <span className="text-lg mt-0.5">{a.nivel === 'critico' ? '🔴' : '⚠️'}</span>
              <p className="text-sm text-gray-200">{a.msg}</p>
            </div>
          ))}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8">
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <p className="text-2xl font-bold text-white">{socOk ? ghe.length : '—'}</p>
          <p className="text-xs text-gray-500 mt-1">GHEs ativos</p>
        </div>
        <div className={`rounded-xl p-4 border ${comInsalubridade.length > 0 ? 'bg-yellow-950/30 border-yellow-900/40' : 'bg-gray-900 border-gray-800'}`}>
          <p className={`text-2xl font-bold ${comInsalubridade.length > 0 ? 'text-yellow-400' : 'text-white'}`}>
            {socOk ? comInsalubridade.length : '—'}
          </p>
          <p className="text-xs text-gray-500 mt-1">Insalubridade</p>
        </div>
        <div className={`rounded-xl p-4 border ${comPericulosidade.length > 0 ? 'bg-orange-950/30 border-orange-900/40' : 'bg-gray-900 border-gray-800'}`}>
          <p className={`text-2xl font-bold ${comPericulosidade.length > 0 ? 'text-orange-400' : 'text-white'}`}>
            {socOk ? comPericulosidade.length : '—'}
          </p>
          <p className="text-xs text-gray-500 mt-1">Periculosidade</p>
        </div>
        <div className={`rounded-xl p-4 border ${caVencido.length > 0 ? 'bg-red-950/40 border-red-900/50' : 'bg-gray-900 border-gray-800'}`}>
          <p className={`text-2xl font-bold ${caVencido.length > 0 ? 'text-red-400' : 'text-white'}`}>
            {socOk ? caVencido.length : '—'}
          </p>
          <p className="text-xs text-gray-500 mt-1">CA vencido</p>
          {caVencido.length > 0 && <p className="text-[10px] text-red-500 mt-0.5">risco legal</p>}
        </div>
        <div className={`rounded-xl p-4 border ${caVencendo30.length > 0 ? 'bg-yellow-950/30 border-yellow-900/40' : 'bg-gray-900 border-gray-800'}`}>
          <p className={`text-2xl font-bold ${caVencendo30.length > 0 ? 'text-yellow-400' : 'text-white'}`}>
            {socOk ? caVencendo30.length : '—'}
          </p>
          <p className="text-xs text-gray-500 mt-1">CA vencendo 30d</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <p className="text-2xl font-bold text-white">{socOk ? totalVidas.toLocaleString('pt-BR') : '—'}</p>
          <p className="text-xs text-gray-500 mt-1">Total de vidas</p>
          {socOk && ativos > 0 && <p className="text-[10px] text-gray-600 mt-0.5">{ativos} ativos</p>}
        </div>
      </div>

      {/* Layout principal */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Chat Dieguito — 2/3 */}
        <div className="md:col-span-2 space-y-6">
          <div>
            <h2 className="text-sm font-semibold text-gray-400 mb-3">Chat com Dieguito</h2>
            <DieguitorChat initialMessages={initialMessages} />
          </div>

          {/* EPIs vencidos por nome */}
          {topEpisVencidos.length > 0 && (
            <div className="bg-red-950/20 rounded-xl p-5 border border-red-900/40">
              <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-4">
                EPIs com CA Vencido — {caVencido.length} registros
              </h3>
              <div className="space-y-3">
                {topEpisVencidos.map(([epi, qty]) => (
                  <div key={epi}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs text-gray-200 flex-1 mr-2">{epi}</span>
                      <span className="text-xs font-medium text-red-400 shrink-0">{qty} CA{qty > 1 ? 's' : ''}</span>
                    </div>
                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-red-700 rounded-full"
                        style={{ width: `${(qty / topEpisVencidos[0][1]) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              {caVencido.length > 5 && (
                <p className="text-xs text-gray-500 mt-3">
                  + {caVencido.length - topEpisVencidos.reduce((s, [, q]) => s + q, 0)} outros CAs vencidos
                </p>
              )}
              <div className="mt-4 pt-3 border-t border-red-900/30">
                <p className="text-[10px] text-red-400 font-medium">
                  → CA vencido = EPI sem certificado de aprovação = uso proibido pelo MTE
                </p>
              </div>
            </div>
          )}

          {/* Top EPIs usados */}
          {topEpis.length > 0 && (
            <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">EPIs mais utilizados</h3>
              <div className="space-y-3">
                {topEpis.map(([epi, qty]) => {
                  const pct = epis.length > 0 ? (qty / epis.length) * 100 : 0
                  return (
                    <div key={epi}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs text-gray-300 truncate flex-1 mr-2">{epi}</span>
                        <span className="text-xs font-medium text-orange-400 shrink-0">{qty.toLocaleString('pt-BR')}</span>
                      </div>
                      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
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
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Exposição — GHE</h3>
            <div className="space-y-2">
              {[
                { label: 'Total GHEs', val: ghe.length, color: 'text-white' },
                { label: 'Insalubridade', val: comInsalubridade.length, color: 'text-yellow-400' },
                { label: 'Periculosidade', val: comPericulosidade.length, color: 'text-orange-400' },
                { label: 'Aposent. especial', val: comAposEsp.length, color: 'text-blue-400' },
              ].map(row => (
                <div key={row.label} className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">{row.label}</span>
                  <span className={`text-xs font-medium ${row.color}`}>{socOk ? row.val : '—'}</span>
                </div>
              ))}
            </div>
            {/* Insalubridade por grau */}
            {comInsalubridade.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-800">
                <p className="text-[10px] text-gray-600 mb-2">Graus de insalubridade:</p>
                <div className="flex gap-3">
                  {Object.entries(insalubMap).map(([grau, qty]) => qty > 0 && (
                    <div key={grau} className="text-center">
                      <p className="text-sm font-bold text-yellow-400">{qty}</p>
                      <p className="text-[10px] text-gray-500">{grau}%</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* CA timeline */}
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Status CAs</h3>
            <div className="space-y-3">
              <div className={`flex items-center justify-between p-2 rounded-lg ${caVencido.length > 0 ? 'bg-red-950/40' : 'bg-gray-800/50'}`}>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${caVencido.length > 0 ? 'bg-red-500' : 'bg-gray-600'}`} />
                  <span className="text-xs text-gray-300">Vencidos</span>
                </div>
                <span className={`text-xs font-bold ${caVencido.length > 0 ? 'text-red-400' : 'text-gray-500'}`}>
                  {socOk ? caVencido.length : '—'}
                </span>
              </div>
              <div className={`flex items-center justify-between p-2 rounded-lg ${caVencendo30.length > 0 ? 'bg-yellow-950/30' : 'bg-gray-800/50'}`}>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${caVencendo30.length > 0 ? 'bg-yellow-500' : 'bg-gray-600'}`} />
                  <span className="text-xs text-gray-300">Vencendo &lt;30d</span>
                </div>
                <span className={`text-xs font-bold ${caVencendo30.length > 0 ? 'text-yellow-400' : 'text-gray-500'}`}>
                  {socOk ? caVencendo30.length : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-gray-800/50">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-xs text-gray-300">Vencendo 30–60d</span>
                </div>
                <span className="text-xs font-bold text-blue-400">
                  {socOk ? caVencendo60.length : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Memórias do Dieguito */}
          <MemoriasPanel agente="dieguito" />

          {/* Referências NR */}
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">eSocial Engenharia</h3>
            <div className="space-y-2">
              {[
                { evento: 'S-2240', desc: 'Cond. ambientais', prazo: 'Admissão + anual', cor: 'text-orange-400' },
                { evento: 'S-2245', desc: 'Treinamentos', prazo: 'Após cada NR', cor: 'text-blue-400' },
              ].map(e => (
                <div key={e.evento} className="flex items-start justify-between gap-2">
                  <div>
                    <span className={`text-[11px] font-mono font-bold ${e.cor}`}>{e.evento}</span>
                    <span className="text-[11px] text-gray-400 ml-1">{e.desc}</span>
                  </div>
                  <span className="text-[10px] text-gray-500 text-right">{e.prazo}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-800">
              <p className="text-[10px] text-gray-500">Documentos periódicos:</p>
              <div className="mt-1 space-y-1">
                <p className="text-[10px] text-gray-400">PGR — revisão anual obrigatória</p>
                <p className="text-[10px] text-gray-400">LTCAT — revisão a cada 2 anos</p>
                <p className="text-[10px] text-gray-400">PPP — na demissão de exposto</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
