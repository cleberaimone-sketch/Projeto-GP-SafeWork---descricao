import { createClient } from '@/lib/supabase/server'
import { createClient as sb } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import {
  getHistoricoFuncionarios,
  getAgendamentos,
  getLicencasMedicas,
  getEmpresasClientes,
  socConfigurado,
} from '@/lib/soc/client'
import LariChat from './LariChat'

type Exame = { TIPOEXAME?: string; EXAMEALTERADO?: string }
type Licenca = { CODCID?: string; AFASTAMENTO_EM_HORAS?: string }
type Agenda = { DATACOMPROMISSO?: string; NOMEFUNCIONARIO?: string; NOMEEMPRESA?: string; TIPOCOMPROMISSO?: string }
type Empresa = { CODIGO: string; NOME: string; NUMERO_VIDAS?: string }

// Valores reais que o SOC retorna no campo TIPOEXAME
const tipoLabel: Record<string, string> = {
  'Admissão': 'Admissional',
  'Jornal': 'Periódico',
  'Demissional': 'Demissional',
  'Mudança de posição': 'Mudança de Função',
  'rett': 'Retorno ao Trabalho',
  'seg': 'Seguimento/Controle',
  adm: 'Admissional', per: 'Periódico', dem: 'Demissional',
  ret: 'Retorno ao Trabalho', mud: 'Mudança de Função', con: 'Controle',
}

export default async function MedicinaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const socOk = socConfigurado()

  const supaService = sb(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: convData } = await supaService
    .from('conversas_ia')
    .select('mensagens')
    .eq('agente', 'lari')
    .eq('canal', 'dashboard')
    .eq('contato_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const initialMessages = ((convData?.mensagens ?? []) as { role: 'user' | 'assistant'; content: string }[]).slice(-30)

  let exames: Exame[] = []
  let agendamentos: Agenda[] = []
  let licencas: Licenca[] = []
  let empresas: Empresa[] = []

  if (socOk) {
    ;[exames, agendamentos, licencas, empresas] = await Promise.all([
      getHistoricoFuncionarios().then(r => r as Exame[]).catch(() => []),
      getAgendamentos().then(r => r as Agenda[]).catch(() => []),
      getLicencasMedicas().then(r => r as Licenca[]).catch(() => []),
      getEmpresasClientes().catch(() => []),
    ])
  }

  const alterados = exames.filter(e => e.EXAMEALTERADO === '1').length
  const totalVidas = empresas.reduce((s, e) => s + Number(e.NUMERO_VIDAS ?? 0), 0)
  const empresasAtivas = empresas.filter(e => Number(e.NUMERO_VIDAS ?? 0) > 0).length

  const tipoMap: Record<string, number> = {}
  for (const e of exames) {
    const t = e.TIPOEXAME ?? '?'
    tipoMap[t] = (tipoMap[t] ?? 0) + 1
  }
  const topTipos = Object.entries(tipoMap).sort((a, b) => b[1] - a[1]).slice(0, 6)

  const cidMap: Record<string, number> = {}
  let totalHoras = 0
  for (const l of licencas) {
    if (l.CODCID) cidMap[l.CODCID] = (cidMap[l.CODCID] ?? 0) + 1
    totalHoras += Number(l.AFASTAMENTO_EM_HORAS ?? 0)
  }
  const topCids = Object.entries(cidMap).sort((a, b) => b[1] - a[1]).slice(0, 5)

  const proxAgendamentos = agendamentos.slice(0, 8)

  return (
    <main className="min-h-screen bg-gray-950 text-white p-6 md:p-8">
      <div className="mb-8">
        <a href="/dashboard" className="text-gray-500 text-sm hover:text-gray-300">← Centro de Comando</a>
        <div className="flex items-center gap-4 mt-2">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-600 to-emerald-900 flex items-center justify-center text-xl font-bold">La</div>
          <div>
            <h1 className="text-2xl font-bold">Lari — Medicina Ocupacional</h1>
            <p className="text-gray-400 text-sm">ASOs · Consultas · PCMSO · 4 clínicas</p>
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
          <p className="text-2xl font-bold text-white">{socOk ? exames.length.toLocaleString('pt-BR') : '—'}</p>
          <p className="text-xs text-gray-500 mt-1">Exames 30 dias</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <p className={`text-2xl font-bold ${alterados > 0 ? 'text-red-400' : 'text-white'}`}>
            {socOk ? alterados : '—'}
          </p>
          <p className="text-xs text-gray-500 mt-1">Resultados alterados</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <p className="text-2xl font-bold text-white">{socOk ? agendamentos.length : '—'}</p>
          <p className="text-xs text-gray-500 mt-1">Agendamentos (30d)</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <p className={`text-2xl font-bold ${licencas.length > 0 ? 'text-yellow-400' : 'text-white'}`}>
            {socOk ? licencas.length : '—'}
          </p>
          <p className="text-xs text-gray-500 mt-1">Licenças 31 dias</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <p className="text-2xl font-bold text-white">{socOk ? totalVidas.toLocaleString('pt-BR') : '—'}</p>
          <p className="text-xs text-gray-500 mt-1">Vidas em {empresasAtivas} empresas</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Chat Lari */}
        <div className="md:col-span-2">
          <h2 className="text-sm font-semibold text-gray-400 mb-3">Chat com Lari</h2>
          <LariChat initialMessages={initialMessages} />
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Exames por tipo */}
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Exames por Tipo (30d)</h3>
            {topTipos.length === 0 ? (
              <p className="text-xs text-gray-500">Sem dados</p>
            ) : (
              <div className="space-y-2">
                {topTipos.map(([tipo, qty]) => (
                  <div key={tipo} className="flex justify-between items-center">
                    <span className="text-xs text-gray-300">{tipoLabel[tipo] ?? tipo}</span>
                    <span className="text-xs font-medium text-emerald-400">{qty.toLocaleString('pt-BR')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Absenteísmo */}
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Absenteísmo (31d) — {Math.round(totalHoras)}h
            </h3>
            {topCids.length === 0 ? (
              <p className="text-xs text-gray-500">Sem licenças no período</p>
            ) : (
              <div className="space-y-2">
                {topCids.map(([cid, qty]) => (
                  <div key={cid} className="flex justify-between items-center">
                    <span className="text-xs text-gray-300">{cid}</span>
                    <span className="text-xs font-medium text-yellow-400">{qty} afastamento{qty > 1 ? 's' : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Próximos agendamentos */}
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Próximos Agendamentos</h3>
            {proxAgendamentos.length === 0 ? (
              <p className="text-xs text-gray-500">Sem agendamentos</p>
            ) : (
              <div className="space-y-2">
                {proxAgendamentos.map((a, i) => (
                  <div key={i} className="text-xs">
                    <p className="text-gray-200 truncate">{a.NOMEFUNCIONARIO ?? '—'}</p>
                    <p className="text-gray-500">{a.DATACOMPROMISSO} · {tipoLabel[a.TIPOCOMPROMISSO ?? ''] ?? a.TIPOCOMPROMISSO ?? '—'}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
