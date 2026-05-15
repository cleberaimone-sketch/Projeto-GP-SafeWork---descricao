import { createClient } from '@/lib/supabase/server'
import { createClient as sb } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import {
  getHistoricoFuncionarios,
  getAgendamentos,
  getAgendamentosRange,
  getExamesDetalhados,
  getLicencasMedicas,
  getLicencasPeriodo,
  getExamesPeriodo,
  getEmpresasClientes,
  getTodosFuncionarios,
  socConfigurado,
} from '@/lib/soc/client'
import LariChat from './LariChat'
import MemoriasPanel from '../components/MemoriasPanel'
import MedicinaCharts, { type AgendamentoRaw, type AtendimentoRaw } from './MedicinaCharts'
import ExamesRealizadosPanel, { type ExameRealizadoItem } from './ExamesRealizadosPanel'

// ─── Helpers de data ─────────────────────────────────────────────────────────
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function ddmmAnoPg(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
}

function isDoMes(str: string | undefined, mes: number, ano: number): boolean {
  if (!str) return false
  // DD/MM/YYYY
  if (str.includes('/')) {
    const p = str.split('/')
    return parseInt(p[1]) === mes + 1 && parseInt(p[2]) === ano
  }
  // YYYY-MM-DD ou YYYY-MM-DDTHH:... — parse manual, sem UTC shift
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (match) return parseInt(match[2]) === mes + 1 && parseInt(match[1]) === ano
  return false
}

function pctVar(atual: number, ant: number): number | null {
  if (ant === 0) return null
  return Math.round((atual - ant) / ant * 100)
}

// ─── Tipos ───────────────────────────────────────────────────────────────────
type Exame = { TIPOEXAME?: string; EXAMEALTERADO?: string; NOMEEMPRESA?: string; EMPRESA?: string; DATAFICHA?: string; NOMEEXAME?: string; CODEXAME?: string }
type ExameDetalhado = { DATAFICHA?: string; UNIDADE?: string; NOMEEMPRESA?: string; NOMEFUNCIONARIO?: string; TIPOFICHA?: string; SAIASO?: string; NOMEEXAME?: string; CODEXAME?: string }
type Licenca = {
  CODCID?: string; AFASTAMENTO_EM_HORAS?: string; NOMEFUNCIONARIO?: string
  NOMEEMPRESA?: string; DATA_INICIO_LICENCA?: string; ACIDENTE_TRAJETO?: string
  TIPO_LICENCA?: string
}
type Agenda = {
  DATACOMPROMISSO?: string; NOMEFUNCIONARIO?: string
  NOMEEMPRESA?: string; TIPOCOMPROMISSO?: string
}
type Empresa = { CODIGO: string; NOME: string; NUMERO_VIDAS?: string }
type Func = { SITUACAO?: string; NOMEEMPRESA?: string }

function normalizarTipoExame(tipo?: string): string {
  if (!tipo) return '—'
  const t = tipo.toLowerCase().trim()
  if (t === 'jornal' || t.includes('peri') || t === 'per') return 'Periódico'
  if (t.includes('admiss') || t === 'adm')                 return 'Admissional'
  if (t.includes('demiss') || t === 'dem')                 return 'Demissional'
  if (t.includes('mudan') || t.includes('posi') || t === 'mud') return 'Mudança de Função'
  if (t.includes('retor') || t === 'rett' || t === 'ret')  return 'Retorno ao Trabalho'
  if (t.includes('segui') || t === 'seg' || t.includes('control') || t === 'con') return 'Seguimento/Controle'
  if (t.includes('monit') || t === 'mon')                  return 'Monitoramento'
  if (t.includes('consul'))                                return 'Consulta'
  if (t.includes('transf'))                                return 'Transferência'
  return tipo  // retorna o valor bruto se não reconhecido (para debug)
}

const cidDescricoes: Record<string, string> = {
  M: 'Osteomuscular', F: 'Transtorno Mental', Z: 'Motivo Social',
  J: 'Respiratório', K: 'Digestivo', S: 'Acidente/Lesão',
  T: 'Intoxicação', G: 'Neurológico', R: 'Sintomas Inespecíficos',
  I: 'Cardiovascular', A: 'Infecciosa', B: 'Parasitária',
}

function cidGrupo(cid: string) {
  if (!cid) return '?'
  return cidDescricoes[cid[0].toUpperCase()] ?? cid[0].toUpperCase()
}

export default async function MedicinaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const socOk = socConfigurado()

  // Referências de mês atual e anterior
  const agora = new Date()
  const mesIdx = agora.getMonth()       // 0-indexed
  const anoNum = agora.getFullYear()
  const mesAntIdx = mesIdx === 0 ? 11 : mesIdx - 1
  const anoAnt = mesIdx === 0 ? anoNum - 1 : anoNum
  const nomeMes = MESES[mesIdx]
  const mesAntIni = ddmmAnoPg(new Date(anoAnt, mesAntIdx, 1))
  const mesAntFim = ddmmAnoPg(new Date(anoNum, mesIdx, 0))  // último dia do mês anterior

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
  let agendamentosHistorico: AgendamentoRaw[] = []
  let examesDetalhados: ExameDetalhado[] = []
  let licencas: Licenca[] = []
  let empresas: Empresa[] = []
  let funcionarios: Func[] = []
  let examesAnt: Exame[] = []
  let licencasAnt: Licenca[] = []

  if (socOk) {
    ;[exames, agendamentos, agendamentosHistorico, examesDetalhados, licencas, empresas, funcionarios, examesAnt, licencasAnt] = await Promise.all([
      getHistoricoFuncionarios().then(r => r as Exame[]).catch(() => []),
      getAgendamentos().then(r => r as Agenda[]).catch(() => []),
      getAgendamentosRange(90, 30).then(r => r as AgendamentoRaw[]).catch(() => []),
      getExamesDetalhados().then(r => r as ExameDetalhado[]).catch(() => []),
      getLicencasMedicas().then(r => r as Licenca[]).catch(() => []),
      getEmpresasClientes().catch(() => []) as Promise<Empresa[]>,
      getTodosFuncionarios().then(r => r as Func[]).catch(() => []),
      getExamesPeriodo(mesAntIni, mesAntFim).then(r => r as Exame[]).catch(() => []),
      getLicencasPeriodo(mesAntIni, mesAntFim).then(r => r as Licenca[]).catch(() => []),
    ])
  }

  // Filtros por mês atual
  const examesMes = exames.filter(e => isDoMes(e.DATAFICHA, mesIdx, anoNum))
  const licencasMes = licencas.filter(l => isDoMes(l.DATA_INICIO_LICENCA, mesIdx, anoNum))
  const agendMes = [...agendamentos, ...agendamentosHistorico].filter(a => isDoMes(a.DATACOMPROMISSO, mesIdx, anoNum))

  // Variação percentual vs mês anterior
  const varExames   = pctVar(examesMes.length, examesAnt.length)
  const varLicencas = pctVar(licencasMes.length, licencasAnt.length)
  const varAgend    = pctVar(agendMes.length, agendamentos.length > 0 ? agendamentos.length : 0)

  // Gráficos: apenas mês atual
  const examesParaGrafico = examesDetalhados.length > 0
    ? (examesDetalhados as AtendimentoRaw[])
    : exames.map(e => ({
        DATAFICHA: e.DATAFICHA,
        UNIDADE: e.NOMEEMPRESA,
        NOMEEMPRESA: e.NOMEEMPRESA,
        NOMEEXAME: e.NOMEEXAME,
        CODEXAME: e.CODEXAME,
      } as AtendimentoRaw))

  const agendamentosGrafico: AgendamentoRaw[] = (
    agendamentosHistorico.length > 0 ? agendamentosHistorico : (agendamentos as AgendamentoRaw[])
  ).filter(a => isDoMes(a.DATACOMPROMISSO, mesIdx, anoNum))

  const atendimentosGrafico: AtendimentoRaw[] = examesParaGrafico
    .filter(e => isDoMes(e.DATAFICHA, mesIdx, anoNum))

  // ASOs pendentes: exame registrado mas sem SAIASO (aguardando assinatura do médico)
  const asosPendentes = examesDetalhados.filter(e => !e.SAIASO || e.SAIASO.trim() === '')

  // Ranking de exames do mês atual — fonte: 193540 (NOMEEXAME por linha) ou fallback 191865
  const exameNomeMap: Record<string, { total: number; alterados: number }> = {}
  const fonteExames = (examesDetalhados.length > 0 ? examesDetalhados : exames)
    .filter(e => isDoMes((e as ExameDetalhado).DATAFICHA ?? (e as Exame).DATAFICHA, mesIdx, anoNum))

  for (const e of fonteExames) {
    const nomeRaw = (e as ExameDetalhado).NOMEEXAME ?? (e as Exame).NOMEEXAME ?? (e as Exame).CODEXAME ?? 'Não identificado'
    // Remove duplicatas: "Pacote ASO" é o mesmo que "Consulta Ocupacional" — mantém só o exame clínico
    if (nomeRaw.toUpperCase().includes('PACOTE')) continue
    const nome = nomeRaw
    if (!exameNomeMap[nome]) exameNomeMap[nome] = { total: 0, alterados: 0 }
    exameNomeMap[nome].total++
    if ((e as Exame).EXAMEALTERADO === '1' || (e as ExameDetalhado).SAIASO === 'INAPTO') exameNomeMap[nome].alterados++
  }
  const todosExamesRanking: ExameRealizadoItem[] = Object.entries(exameNomeMap)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([nome, v]) => ({ nome, quantidade: v.total, alterados: v.alterados }))

  // KPIs — mês atual
  const alterados = examesMes.filter(e => e.EXAMEALTERADO === '1').length
  const totalVidas = empresas.reduce((s, e) => s + Number(e.NUMERO_VIDAS ?? 0), 0)
  const empresasAtivas = empresas.filter(e => Number(e.NUMERO_VIDAS ?? 0) > 0).length
  const ativos = funcionarios.filter(f => f.SITUACAO === 'Ativo').length
  let totalHoras = 0
  let acidentesTrajeto = 0
  for (const l of licencasMes) {
    totalHoras += Number(l.AFASTAMENTO_EM_HORAS ?? 0)
    if (l.ACIDENTE_TRAJETO === '1' || l.ACIDENTE_TRAJETO === 'S') acidentesTrajeto++
  }

  // Taxa de absenteísmo do mês
  const taxaAbsenteismo = ativos > 0 ? (totalHoras / (ativos * 176)) * 100 : 0

  // Exames por tipo — usa todos os últimos 30d para ter amostra maior
  const tipoMap: Record<string, number> = {}
  for (const e of exames) {
    const label = normalizarTipoExame(e.TIPOEXAME)
    tipoMap[label] = (tipoMap[label] ?? 0) + 1
  }
  const topTipos = Object.entries(tipoMap).sort((a, b) => b[1] - a[1]).slice(0, 6)

  // CIDs — mês atual
  const cidMap: Record<string, number> = {}
  for (const l of licencasMes) {
    if (l.CODCID) cidMap[l.CODCID] = (cidMap[l.CODCID] ?? 0) + 1
  }
  const topCids = Object.entries(cidMap).sort((a, b) => b[1] - a[1]).slice(0, 8)

  // Grupo CID — mês atual
  const cidGrupoMap: Record<string, number> = {}
  for (const l of licencasMes) {
    if (l.CODCID) {
      const g = cidGrupo(l.CODCID)
      cidGrupoMap[g] = (cidGrupoMap[g] ?? 0) + 1
    }
  }
  const topGruposCid = Object.entries(cidGrupoMap).sort((a, b) => b[1] - a[1]).slice(0, 5)

  // Acidentes de trajeto — mês atual
  const licencasAcidente = licencasMes.filter(l => l.ACIDENTE_TRAJETO === '1' || l.ACIDENTE_TRAJETO === 'S')

  // Agendamentos — próximos 10
  const proxAgendamentos = agendamentos.slice(0, 10)

  // Exames por empresa — mês atual
  const exameEmpMap: Record<string, number> = {}
  for (const e of examesMes) {
    const emp = e.NOMEEMPRESA ?? e.EMPRESA ?? 'Sem empresa'
    exameEmpMap[emp] = (exameEmpMap[emp] ?? 0) + 1
  }
  const topExameEmp = Object.entries(exameEmpMap).sort((a, b) => b[1] - a[1]).slice(0, 6)

  // Alertas
  const alertas: { nivel: 'critico' | 'atencao'; msg: string }[] = []
  if (alterados > 0)
    alertas.push({ nivel: 'critico', msg: `${alterados} exame${alterados > 1 ? 's' : ''} com resultado alterado — requer comunicação ao empregador` })
  if (acidentesTrajeto > 0)
    alertas.push({ nivel: 'critico', msg: `${acidentesTrajeto} acidente${acidentesTrajeto > 1 ? 's' : ''} de trajeto — verificar CAT e eSocial S-2210` })
  if (taxaAbsenteismo > 5)
    alertas.push({ nivel: 'critico', msg: `Taxa de absenteísmo ${taxaAbsenteismo.toFixed(1)}% — acima do limite de 5%` })
  else if (taxaAbsenteismo > 3)
    alertas.push({ nivel: 'atencao', msg: `Taxa de absenteísmo ${taxaAbsenteismo.toFixed(1)}% — monitorar (referência: <3%)` })

  return (
    <main className="min-h-screen bg-gray-950 text-white p-6 md:p-8">
      {/* Header */}
      <div className="mb-8">
        <a href="/dashboard" className="text-gray-500 text-sm hover:text-gray-300">← Centro de Comando</a>
        <div className="flex items-center gap-4 mt-2">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-600 to-emerald-900 flex items-center justify-center text-xl font-bold">La</div>
          <div>
            <h1 className="text-2xl font-bold">Lari — Medicina Ocupacional</h1>
            <p className="text-gray-400 text-sm">ASOs · Absenteísmo · PCMSO · eSocial Saúde</p>
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
        {/* Exames do mês */}
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 col-span-1">
          <p className="text-2xl font-bold text-white">{socOk ? examesMes.length.toLocaleString('pt-BR') : '—'}</p>
          <p className="text-xs text-gray-500 mt-1">Exames ({nomeMes})</p>
          {socOk && varExames !== null && (
            <p className={`text-[10px] mt-1 font-medium ${varExames >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {varExames >= 0 ? '↑' : '↓'} {Math.abs(varExames)}% vs mês ant.
            </p>
          )}
        </div>
        {/* Resultados alterados */}
        <div className={`rounded-xl p-4 border col-span-1 ${alterados > 0 ? 'bg-red-950/30 border-red-900/50' : 'bg-gray-900 border-gray-800'}`}>
          <p className={`text-2xl font-bold ${alterados > 0 ? 'text-red-400' : 'text-white'}`}>
            {socOk ? alterados : '—'}
          </p>
          <p className="text-xs text-gray-500 mt-1">Alterados ({nomeMes})</p>
        </div>
        {/* Agendamentos do mês */}
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 col-span-1">
          <p className="text-2xl font-bold text-white">{socOk ? agendMes.length : '—'}</p>
          <p className="text-xs text-gray-500 mt-1">Agendamentos ({nomeMes})</p>
        </div>
        {/* Licenças do mês */}
        <div className={`rounded-xl p-4 border col-span-1 ${licencasMes.length > 5 ? 'bg-yellow-950/30 border-yellow-900/40' : 'bg-gray-900 border-gray-800'}`}>
          <p className={`text-2xl font-bold ${licencasMes.length > 5 ? 'text-yellow-400' : 'text-white'}`}>
            {socOk ? licencasMes.length : '—'}
          </p>
          <p className="text-xs text-gray-500 mt-1">Licenças ({nomeMes})</p>
          {socOk && varLicencas !== null && (
            <p className={`text-[10px] mt-1 font-medium ${varLicencas >= 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {varLicencas >= 0 ? '↑' : '↓'} {Math.abs(varLicencas)}% vs mês ant.
            </p>
          )}
        </div>
        {/* Taxa absenteísmo */}
        <div className={`rounded-xl p-4 border col-span-1 ${taxaAbsenteismo > 3 ? (taxaAbsenteismo > 5 ? 'bg-red-950/30 border-red-900/50' : 'bg-yellow-950/30 border-yellow-900/40') : 'bg-gray-900 border-gray-800'}`}>
          <p className={`text-2xl font-bold ${taxaAbsenteismo > 5 ? 'text-red-400' : taxaAbsenteismo > 3 ? 'text-yellow-400' : 'text-white'}`}>
            {socOk ? `${taxaAbsenteismo.toFixed(1)}%` : '—'}
          </p>
          <p className="text-xs text-gray-500 mt-1">Absenteísmo ({nomeMes})</p>
          {socOk && <p className="text-[10px] text-gray-600 mt-0.5">ref: &lt;3%</p>}
        </div>
        {/* Vidas */}
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 col-span-1">
          <p className="text-2xl font-bold text-white">{socOk ? totalVidas.toLocaleString('pt-BR') : '—'}</p>
          <p className="text-xs text-gray-500 mt-1">Vidas em {empresasAtivas} emp.</p>
        </div>
      </div>

      {/* Layout principal */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Chat Lari — 2/3 */}
        <div className="md:col-span-2 space-y-6">
          <div>
            <h2 className="text-sm font-semibold text-gray-400 mb-3">Chat com Lari</h2>
            <LariChat initialMessages={initialMessages} />
          </div>

          {/* Gráficos — Agendamentos / Atendimentos / Faltantes */}
          {socOk && (
            <div>
              <h2 className="text-sm font-semibold text-gray-400 mb-3">Produção por Unidade</h2>
              <MedicinaCharts
                agendamentos={agendamentosGrafico}
                atendimentos={atendimentosGrafico}
              />
            </div>
          )}

          {/* Ranking de todos os exames realizados */}
          {socOk && todosExamesRanking.length > 0 && (
            <ExamesRealizadosPanel
              exames={todosExamesRanking}
              periodo={nomeMes}
            />
          )}

          {/* Exames por empresa */}
          {topExameEmp.length > 0 && (
            <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Exames por Empresa ({nomeMes})</h3>
              <div className="space-y-3">
                {topExameEmp.map(([emp, qty]) => {
                  const pct = exames.length > 0 ? (qty / exames.length) * 100 : 0
                  return (
                    <div key={emp}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs text-gray-300 truncate flex-1 mr-2">{emp}</span>
                        <span className="text-xs font-medium text-emerald-400 shrink-0">{qty}</span>
                      </div>
                      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Licenças por CID com grupo */}
          {topCids.length > 0 && (
            <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Top CIDs — Absenteísmo ({nomeMes})</h3>
              <p className="text-[11px] text-gray-600 mb-4">{Math.round(totalHoras)}h perdidas em {nomeMes}</p>
              <div className="space-y-2">
                {topCids.map(([cid, qty]) => (
                  <div key={cid} className="flex items-center gap-3">
                    <div className="w-16 shrink-0">
                      <span className="text-xs font-mono text-yellow-400">{cid}</span>
                    </div>
                    <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-yellow-600 rounded-full"
                        style={{ width: `${(qty / topCids[0][1]) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-400 shrink-0 w-20 text-right">{cidGrupo(cid)}</span>
                    <span className="text-xs font-medium text-yellow-400 shrink-0 w-6 text-right">{qty}</span>
                  </div>
                ))}
              </div>
              {/* Grupos CID */}
              {topGruposCid.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-800">
                  <p className="text-[10px] text-gray-600 mb-2">Por capítulo CID-10:</p>
                  <div className="flex flex-wrap gap-2">
                    {topGruposCid.map(([grupo, qty]) => (
                      <span key={grupo} className="text-[10px] bg-gray-800 text-gray-300 px-2 py-1 rounded">
                        {grupo}: {qty}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar — 1/3 */}
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
                    <span className="text-xs text-gray-300">{tipo}</span>
                    <span className="text-xs font-medium text-emerald-400">{qty.toLocaleString('pt-BR')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Acidentes de trajeto */}
          {acidentesTrajeto > 0 && (
            <div className="bg-red-950/30 rounded-xl p-4 border border-red-900/50">
              <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-3">
                🚨 {acidentesTrajeto} Acidente{acidentesTrajeto > 1 ? 's' : ''} de Trajeto
              </h3>
              <div className="space-y-1">
                {licencasAcidente.slice(0, 5).map((l, i) => (
                  <div key={i} className="text-xs">
                    <p className="text-gray-200 truncate">{l.NOMEFUNCIONARIO ?? '—'}</p>
                    <p className="text-red-400">{l.NOMEEMPRESA} · {l.DATA_INICIO_LICENCA}</p>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-red-400 mt-3 font-medium">→ Verificar CAT + eSocial S-2210</p>
            </div>
          )}

          {/* Próximos agendamentos */}
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Próximos Agendamentos</h3>
            {proxAgendamentos.length === 0 ? (
              <p className="text-xs text-gray-500">Sem agendamentos</p>
            ) : (
              <div className="space-y-2">
                {proxAgendamentos.map((a, i) => (
                  <div key={i} className="text-xs border-b border-gray-800 pb-2 last:border-0 last:pb-0">
                    <p className="text-gray-200 truncate font-medium">{a.NOMEFUNCIONARIO ?? '—'}</p>
                    <p className="text-gray-500">{a.NOMEEMPRESA}</p>
                    <p className="text-emerald-500">{a.DATACOMPROMISSO} · {normalizarTipoExame(a.TIPOCOMPROMISSO)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ASOs Pendentes */}
          {asosPendentes.length > 0 && (
            <div className="bg-yellow-950/30 rounded-xl p-4 border border-yellow-900/40">
              <h3 className="text-xs font-semibold text-yellow-400 uppercase tracking-wider mb-1">
                ⏳ {asosPendentes.length} ASO{asosPendentes.length !== 1 ? 's' : ''} Pendente{asosPendentes.length !== 1 ? 's' : ''}
              </h3>
              <p className="text-[10px] text-yellow-700 mb-3">Aguardando assinatura do médico</p>
              <div className="space-y-2">
                {asosPendentes.slice(0, 8).map((a, i) => (
                  <div key={i} className="text-xs border-b border-yellow-900/30 pb-2 last:border-0 last:pb-0">
                    <p className="text-gray-200 truncate font-medium">{a.NOMEFUNCIONARIO ?? '—'}</p>
                    <p className="text-gray-500 truncate">{a.NOMEEMPRESA ?? a.UNIDADE ?? '—'}</p>
                    <p className="text-yellow-500 text-[10px]">{a.DATAFICHA} · {a.TIPOFICHA ?? '—'}</p>
                  </div>
                ))}
              </div>
              {asosPendentes.length > 8 && (
                <p className="text-[10px] text-yellow-600 mt-2">+{asosPendentes.length - 8} pendentes</p>
              )}
            </div>
          )}

          {/* Memórias da Lari */}
          <MemoriasPanel agente="lari" />

          {/* Referências eSocial */}
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Prazos eSocial Saúde</h3>
            <div className="space-y-2">
              {[
                { evento: 'S-2210', desc: 'CAT', prazo: '1 dia útil', cor: 'text-red-400' },
                { evento: 'S-2220', desc: 'ASO', prazo: 'Dia anterior', cor: 'text-yellow-400' },
                { evento: 'S-2230', desc: 'Afastamento', prazo: '5 dias corridos', cor: 'text-orange-400' },
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
          </div>
        </div>
      </div>
    </main>
  )
}
