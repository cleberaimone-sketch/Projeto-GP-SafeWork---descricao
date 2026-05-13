import { createClient } from '@/lib/supabase/server'
import { createClient as sb } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import {
  getRiscos,
  getEntregasEpi,
  getEmpresasClientes,
  socConfigurado,
} from '@/lib/soc/client'
import DieguitorChat from './DieguitorChat'

type Ghe = {
  codigoGhe?: string; descricaoGhe?: string
  maiorAdicionalInsalubridade?: string
  existePericulosidade?: string
  existeAposentadoriaEspecial?: string
  maiorPeriodoAposentadoria?: string
}
type Epi = { NOME_EPI?: string; CODIGO_CA?: string; DATA_VENCIMENTO?: string; MATRICULA?: string }
type Empresa = { CODIGO: string; NOME: string; NUMERO_VIDAS?: string }

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

  if (socOk) {
    ;[ghe, epis, empresas] = await Promise.all([
      getRiscos().then(r => r as Ghe[]).catch(() => []),
      getEntregasEpi().then(r => r as Epi[]).catch(() => []),
      getEmpresasClientes().catch(() => []),
    ])
  }

  const hoje = new Date().toISOString().split('T')[0]
  const d30  = new Date(Date.now() + 30 * 86_400_000).toISOString().split('T')[0]

  const comInsalubridade = ghe.filter(g => g.maiorAdicionalInsalubridade && g.maiorAdicionalInsalubridade !== '0').length
  const comPericulosidade = ghe.filter(g => g.existePericulosidade === 'S' || g.existePericulosidade === 'Sim').length
  const comAposEsp = ghe.filter(g => g.existeAposentadoriaEspecial === 'S' || g.existeAposentadoriaEspecial === 'Sim').length

  const caVencido = epis.filter(e => e.DATA_VENCIMENTO && e.DATA_VENCIMENTO < hoje).length
  const caVencendo = epis.filter(e => e.DATA_VENCIMENTO && e.DATA_VENCIMENTO >= hoje && e.DATA_VENCIMENTO <= d30).length

  const totalVidas = empresas.reduce((s, e) => s + Number(e.NUMERO_VIDAS ?? 0), 0)

  const epiMap: Record<string, number> = {}
  for (const e of epis) {
    if (e.NOME_EPI) epiMap[e.NOME_EPI] = (epiMap[e.NOME_EPI] ?? 0) + 1
  }
  const topEpis = Object.entries(epiMap).sort((a, b) => b[1] - a[1]).slice(0, 8)

  return (
    <main className="min-h-screen bg-gray-950 text-white p-6 md:p-8">
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

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <p className="text-2xl font-bold text-white">{socOk ? ghe.length : '—'}</p>
          <p className="text-xs text-gray-500 mt-1">GHEs ativos</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <p className={`text-2xl font-bold ${comInsalubridade > 0 ? 'text-yellow-400' : 'text-white'}`}>
            {socOk ? comInsalubridade : '—'}
          </p>
          <p className="text-xs text-gray-500 mt-1">Com insalubridade</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <p className={`text-2xl font-bold ${comPericulosidade > 0 ? 'text-orange-400' : 'text-white'}`}>
            {socOk ? comPericulosidade : '—'}
          </p>
          <p className="text-xs text-gray-500 mt-1">Com periculosidade</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <p className={`text-2xl font-bold ${caVencido > 0 ? 'text-red-400' : 'text-white'}`}>
            {socOk ? caVencido : '—'}
          </p>
          <p className="text-xs text-gray-500 mt-1">CA vencido</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <p className="text-2xl font-bold text-white">{socOk ? totalVidas.toLocaleString('pt-BR') : '—'}</p>
          <p className="text-xs text-gray-500 mt-1">Total de vidas</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Chat Dieguito */}
        <div className="md:col-span-2">
          <h2 className="text-sm font-semibold text-gray-400 mb-3">Chat com Dieguito</h2>
          <DieguitorChat initialMessages={initialMessages} />
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* GHE resumo */}
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Exposição (GHE)</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-xs text-gray-400">Insalubridade</span>
                <span className="text-xs font-medium text-yellow-400">{socOk ? comInsalubridade : '—'} GHEs</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-gray-400">Periculosidade</span>
                <span className="text-xs font-medium text-orange-400">{socOk ? comPericulosidade : '—'} GHEs</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-gray-400">Aposentadoria especial</span>
                <span className="text-xs font-medium text-blue-400">{socOk ? comAposEsp : '—'} GHEs</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-gray-400">CA vencendo (30d)</span>
                <span className={`text-xs font-medium ${caVencendo > 0 ? 'text-yellow-400' : 'text-gray-400'}`}>
                  {socOk ? caVencendo : '—'} EPIs
                </span>
              </div>
            </div>
          </div>

          {/* Top EPIs */}
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">EPIs mais usados</h3>
            {topEpis.length === 0 ? (
              <p className="text-xs text-gray-500">Sem dados</p>
            ) : (
              <div className="space-y-2">
                {topEpis.map(([epi, qty]) => (
                  <div key={epi} className="flex justify-between items-center">
                    <span className="text-xs text-gray-300 truncate flex-1 mr-2">{epi}</span>
                    <span className="text-xs font-medium text-orange-400 shrink-0">{qty.toLocaleString('pt-BR')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* CA vencidos */}
          {caVencido > 0 && (
            <div className="bg-red-950/30 rounded-xl p-4 border border-red-900/50">
              <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-3">
                Alerta — {caVencido} CA{caVencido > 1 ? 's' : ''} Vencido{caVencido > 1 ? 's' : ''}
              </h3>
              <div className="space-y-1">
                {epis.filter(e => e.DATA_VENCIMENTO && e.DATA_VENCIMENTO < hoje).slice(0, 5).map((e, i) => (
                  <div key={i} className="text-xs">
                    <span className="text-gray-300">{e.NOME_EPI}</span>
                    <span className="text-red-400 ml-2">{e.DATA_VENCIMENTO}</span>
                  </div>
                ))}
                {caVencido > 5 && <p className="text-xs text-gray-500">+{caVencido - 5} outros</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
