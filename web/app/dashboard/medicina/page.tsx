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
  getCompromissos,
  socConfigurado,
} from '@/lib/soc/client'
import LariChat from './LariChat'
import MemoriasPanel from '../components/MemoriasPanel'
import MedicinaCharts, { type AgendamentoRaw, type AtendimentoRaw } from './MedicinaCharts'
import ExamesRealizadosPanel, { type ExameRealizadoItem } from './ExamesRealizadosPanel'
import AsosVencidosChart, { type EmpresaAsosData } from './AsosVencidosChart'

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

// Parse de data sem shift de timezone UTC
function parseDateLocal(str?: string): Date | null {
  if (!str) return null
  if (str.includes('/')) {
    const p = str.split('/')
    return new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]))
  }
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]))
  return null
}

// Detecta consulta ocupacional (clínica) — a "consulta" que gera o ASO.
// Normaliza acentos para casar "CLÍNICO" e "CLINICO".
// Usado pelo KPI "Consultas Realizadas" e pelos gráficos de produção.
function isConsultaOcupacional(nomeExame?: string): boolean {
  if (!nomeExame) return false  // sem nome não conta como consulta
  const n = nomeExame.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  return n.includes('CONSULTA') || n.includes('CLINICO') || n.includes('ASO')
}
// Alias mantido temporariamente para retrocompatibilidade (será removido depois)
const isClinicalExamStr = isConsultaOcupacional

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
type Func = { SITUACAO?: string; NOMEEMPRESA?: string; NOME?: string }

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

  // Datas para consultas do mês atual
  const primeiroDoMes = `${anoNum}-${String(mesIdx + 1).padStart(2, '0')}-01`
  const hojeISO = agora.toISOString().split('T')[0]
  const fim30d  = new Date(Date.now() + 30 * 86_400_000).toISOString().split('T')[0]
  const ini90d  = new Date(Date.now() - 90 * 86_400_000).toISOString().split('T')[0]

  let exames: Exame[] = []
  let agendamentos: Agenda[] = []
  let agendamentosHistorico: AgendamentoRaw[] = []
  let examesDetalhados: ExameDetalhado[] = []
  let examesAnuais: ExameDetalhado[] = []
  let licencas: Licenca[] = []
  let empresas: Empresa[] = []
  let funcionarios: Func[] = []
  let examesAnt: Exame[] = []
  let licencasAnt: Licenca[] = []
  // Compromissos reais da máscara 203461 (nova)
  let compromissosRealizadosMes: AgendamentoRaw[] = []  // situacao='1' (Atendido) no mês
  let compromissosFaltantesMes: AgendamentoRaw[] = []   // situacao='5' (Não compareceu) no mês

  if (socOk) {
    ;[exames, agendamentos, agendamentosHistorico, examesDetalhados, examesAnuais, licencas, empresas, funcionarios, examesAnt, licencasAnt, compromissosRealizadosMes, compromissosFaltantesMes] = await Promise.all([
      getHistoricoFuncionarios().then(r => r as Exame[]).catch(() => []),
      getAgendamentos().then(r => r as Agenda[]).catch(() => []),
      getAgendamentosRange(90, 30).then(r => r as AgendamentoRaw[]).catch(() => []),
      getExamesDetalhados().then(r => r as ExameDetalhado[]).catch(() => []),
      getExamesDetalhados(365).then(r => r as ExameDetalhado[]).catch(() => []),
      getLicencasMedicas().then(r => r as Licenca[]).catch(() => []),
      getEmpresasClientes().catch(() => []) as Promise<Empresa[]>,
      getTodosFuncionarios().then(r => r as Func[]).catch(() => []),
      getExamesPeriodo(mesAntIni, mesAntFim).then(r => r as Exame[]).catch(() => []),
      getLicencasPeriodo(mesAntIni, mesAntFim).then(r => r as Licenca[]).catch(() => []),
      getCompromissos({ dataInicial: primeiroDoMes, dataFinal: hojeISO, situacao: '1' })
        .then(r => r as AgendamentoRaw[]).catch(() => []),
      getCompromissos({ dataInicial: primeiroDoMes, dataFinal: hojeISO, situacao: '5' })
        .then(r => r as AgendamentoRaw[]).catch(() => []),
    ])
  }

  // Suprime variáveis não usadas após refatoração
  void ini90d; void fim30d

  // Filtros por mês atual
  const examesMes = exames.filter(e => isDoMes(e.DATAFICHA, mesIdx, anoNum))
  const licencasMes = licencas.filter(l => isDoMes(l.DATA_INICIO_LICENCA, mesIdx, anoNum))
  // agendMes calculado abaixo após dedup (todosAgendamentos)

  // Variação percentual vs mês anterior
  const varExames   = pctVar(examesMes.length, examesAnt.length)
  const varLicencas = pctVar(licencasMes.length, licencasAnt.length)

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

  // Mescla agendamentos histórico + futuros + dedup por data+funcionario
  const seenAg = new Set<string>()
  const todosAgendamentos: AgendamentoRaw[] = [
    ...agendamentosHistorico,
    ...(agendamentos as AgendamentoRaw[]),
  ].filter(a => {
    const k = `${a.DATACOMPROMISSO}|${a.NOMEFUNCIONARIO}|${a.NOMEEMPRESA}`
    if (seenAg.has(k)) return false
    seenAg.add(k)
    return true
  })

  const agendamentosGrafico: AgendamentoRaw[] = todosAgendamentos
    .filter(a => isDoMes(a.DATACOMPROMISSO, mesIdx, anoNum))

  const atendimentosGrafico: AtendimentoRaw[] = examesParaGrafico
    .filter(e => isDoMes(e.DATAFICHA, mesIdx, anoNum))

  // Consultas Realizadas — usa compromissos atendidos (situacao='1') se disponíveis,
  // senão cai para contagem via examesDetalhados filtrados por isConsultaOcupacional
  const consultasMes = compromissosRealizadosMes.length > 0
    ? compromissosRealizadosMes.length
    : atendimentosGrafico.filter(e => isConsultaOcupacional(e.NOMEEXAME)).length
  const consultasAnt = examesAnt.filter(e => isConsultaOcupacional(e.NOMEEXAME)).length
  const varConsultas = pctVar(consultasMes, consultasAnt)

  // Faltantes do mês — compromissos com situacao='5' (Não compareceu)
  const faltantesMes = compromissosFaltantesMes.length

  // agendMes = agendamentos do mês (deduplicados)
  const agendMes = agendamentosGrafico

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

  // ─── ASOs Vencidos ────────────────────────────────────────────────────────────
  // Usa examesAnuais (365 dias) para encontrar o último ASO de cada trabalhador
  const MS_12M = 365 * 24 * 60 * 60 * 1000
  const MS_10M = 305 * 24 * 60 * 60 * 1000  // ~10 meses
  const agora2 = agora.getTime()

  // Último exame clínico por trabalhador (dentro dos 365 dias)
  const ultimoExame: Record<string, { data: Date; empresa: string }> = {}
  for (const e of examesAnuais.filter(e => isClinicalExamStr(e.NOMEEXAME))) {
    const nome = e.NOMEFUNCIONARIO?.trim().toUpperCase()
    if (!nome) continue
    const dt = parseDateLocal(e.DATAFICHA)
    if (!dt) continue
    if (!ultimoExame[nome] || dt > ultimoExame[nome].data) {
      ultimoExame[nome] = { data: dt, empresa: e.NOMEEMPRESA ?? e.UNIDADE ?? 'Sem empresa' }
    }
  }

  const empExpiryMap: Record<string, EmpresaAsosData> = {}
  function addExpiry(empresa: string, tipo: 'expirados' | 'expirando') {
    if (!empExpiryMap[empresa]) empExpiryMap[empresa] = { empresa, expirados: 0, expirando: 0 }
    empExpiryMap[empresa][tipo]++
  }

  // Trabalhadores ativos sem nenhum ASO nos últimos 365 dias
  for (const f of funcionarios.filter(f => f.SITUACAO === 'Ativo')) {
    const nome = (f.NOME ?? '').trim().toUpperCase()
    if (!nome) continue
    if (!ultimoExame[nome]) {
      addExpiry(f.NOMEEMPRESA ?? 'Sem empresa', 'expirados')
    }
  }

  // Trabalhadores com último ASO entre 10 e 12 meses (expirando em breve)
  for (const [, info] of Object.entries(ultimoExame)) {
    const age = agora2 - info.data.getTime()
    if (age > MS_12M) addExpiry(info.empresa, 'expirados')
    else if (age > MS_10M) addExpiry(info.empresa, 'expirando')
  }

  const dadosAsosVencidos: EmpresaAsosData[] = Object.values(empExpiryMap)
    .filter(d => d.expirados + d.expirando > 0)
    .sort((a, b) => (b.expirados + b.expirando) - (a.expirados + a.expirando))
    .slice(0, 15)

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

  // Exames por tipo do mês — conta ASOs (1 por trabalhador) via consultas clínicas
  // Usa examesDetalhados (193540): filtra NOMEEXAME = Consulta/Clínico → TIPOFICHA = tipo do ASO
  // Fallback: examesMes de mask 191865 com TIPOEXAME (inflado por exames complementares, mas melhor que nada)
  const tipoMap: Record<string, number> = {}
  const clinicaisMesDetalhados = examesDetalhados.filter(e =>
    isDoMes(e.DATAFICHA, mesIdx, anoNum) && isClinicalExamStr(e.NOMEEXAME)
  )
  if (clinicaisMesDetalhados.length > 0) {
    for (const e of clinicaisMesDetalhados) {
      const label = normalizarTipoExame(e.TIPOFICHA)
      tipoMap[label] = (tipoMap[label] ?? 0) + 1
    }
  } else {
    // fallback: mask 191865, mês atual
    for (const e of examesMes) {
      const label = normalizarTipoExame(e.TIPOEXAME)
      tipoMap[label] = (tipoMap[label] ?? 0) + 1
    }
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
    <main className="min-h-screen bg-slate-50 text-slate-800">
      {/* Header — banner azul corporativo */}
      <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white">
        <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6">
          <a href="/dashboard" className="text-blue-200/80 text-sm hover:text-white inline-block mb-2">← Centro de Comando</a>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white flex items-center justify-center text-xl font-bold shadow-lg">La</div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Lari — Medicina Ocupacional</h1>
              <p className="text-blue-100/90 text-sm">ASOs · Absenteísmo · PCMSO · eSocial Saúde</p>
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

      {/* KPIs — duas linhas: primárias (operacional) e secundárias (volume/contexto) */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
        {/* Consultas Realizadas — PRIMÁRIO (cada consulta = 1 ASO) */}
        <div className="group relative bg-gradient-to-br from-emerald-50 to-white rounded-xl p-4 border border-emerald-200 ring-1 ring-emerald-100 overflow-hidden">
          <div className="absolute inset-y-0 left-0 w-1 bg-emerald-500/80" />
          <div className="flex items-baseline justify-between mb-1">
            <p className="text-3xl font-bold text-slate-900 tabular-nums">{socOk ? consultasMes.toLocaleString('pt-BR') : '—'}</p>
            {socOk && varConsultas !== null && (
              <span className={`text-[11px] font-semibold tabular-nums ${varConsultas >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {varConsultas >= 0 ? '↑' : '↓'}{Math.abs(varConsultas)}%
              </span>
            )}
          </div>
          <p className="text-[11px] text-emerald-700 uppercase tracking-wider font-medium">Consultas Realizadas</p>
          <p className="text-[10px] text-slate-500 mt-0.5">{nomeMes} · consulta ocupacional / clínica</p>
        </div>

        {/* Agendamentos */}
        <div className="group relative bg-gradient-to-br from-sky-50 to-white rounded-xl p-4 border border-sky-200 ring-1 ring-sky-100 overflow-hidden">
          <div className="absolute inset-y-0 left-0 w-1 bg-sky-500/80" />
          <p className="text-3xl font-bold text-slate-900 tabular-nums mb-1">{socOk ? agendMes.length.toLocaleString('pt-BR') : '—'}</p>
          <p className="text-[11px] text-sky-700 uppercase tracking-wider font-medium">Agendamentos</p>
          <p className="text-[10px] text-slate-500 mt-0.5">próximos 30 dias</p>
        </div>

        {/* Faltantes */}
        <div className={`group relative bg-gradient-to-br ${faltantesMes > 5 ? 'from-rose-50' : 'from-white'} to-white rounded-xl p-4 border ${faltantesMes > 5 ? 'border-rose-200' : 'border-slate-200'} overflow-hidden`}>
          <div className={`absolute inset-y-0 left-0 w-1 ${faltantesMes > 5 ? 'bg-rose-500/80' : 'bg-slate-400/60'}`} />
          <p className={`text-3xl font-bold tabular-nums mb-1 ${faltantesMes > 5 ? 'text-rose-700' : 'text-slate-900'}`}>
            {socOk ? faltantesMes.toLocaleString('pt-BR') : '—'}
          </p>
          <p className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">Faltantes</p>
          <p className="text-[10px] text-slate-500 mt-0.5">{nomeMes} · não compareceram</p>
        </div>

        {/* Licenças */}
        <div className={`group relative bg-gradient-to-br ${licencasMes.length > 5 ? 'from-amber-50' : 'from-white'} to-white rounded-xl p-4 border ${licencasMes.length > 5 ? 'border-amber-200' : 'border-slate-200'} overflow-hidden`}>
          <div className={`absolute inset-y-0 left-0 w-1 ${licencasMes.length > 5 ? 'bg-amber-500/80' : 'bg-slate-600/60'}`} />
          <div className="flex items-baseline justify-between mb-1">
            <p className={`text-3xl font-bold tabular-nums ${licencasMes.length > 5 ? 'text-amber-800' : 'text-slate-900'}`}>
              {socOk ? licencasMes.length.toLocaleString('pt-BR') : '—'}
            </p>
            {socOk && varLicencas !== null && (
              <span className={`text-[11px] font-semibold tabular-nums ${varLicencas <= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {varLicencas >= 0 ? '↑' : '↓'}{Math.abs(varLicencas)}%
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">Licenças Médicas</p>
          <p className="text-[10px] text-slate-500 mt-0.5">{nomeMes} · afastamentos</p>
        </div>

        {/* Absenteísmo */}
        <div className={`group relative bg-gradient-to-br ${taxaAbsenteismo > 5 ? 'from-red-50' : taxaAbsenteismo > 3 ? 'from-amber-50' : 'from-white'} to-white rounded-xl p-4 border ${taxaAbsenteismo > 5 ? 'border-red-200' : taxaAbsenteismo > 3 ? 'border-amber-200' : 'border-slate-200'} overflow-hidden`}>
          <div className={`absolute inset-y-0 left-0 w-1 ${taxaAbsenteismo > 5 ? 'bg-rose-500/80' : taxaAbsenteismo > 3 ? 'bg-amber-500/80' : 'bg-slate-600/60'}`} />
          <p className={`text-3xl font-bold tabular-nums mb-1 ${taxaAbsenteismo > 5 ? 'text-red-700' : taxaAbsenteismo > 3 ? 'text-amber-800' : 'text-slate-900'}`}>
            {socOk ? `${taxaAbsenteismo.toFixed(1)}%` : '—'}
          </p>
          <p className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">Absenteísmo</p>
          <p className="text-[10px] text-slate-500 mt-0.5">{nomeMes} · ref: &lt;3% saudável</p>
        </div>
      </div>

      {/* KPIs secundários — volume e contexto */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
        {/* Exames totais (incluindo complementares) */}
        <div className="bg-white rounded-xl px-4 py-3 border border-slate-200 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-medium">Exames totais (com complementares)</p>
            <p className="text-[10px] text-slate-400 mt-0.5">audiometria, espiro, lab, etc.</p>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold text-slate-800 tabular-nums">{socOk ? examesMes.length.toLocaleString('pt-BR') : '—'}</p>
            {socOk && varExames !== null && (
              <span className={`text-[10px] font-medium ${varExames >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {varExames >= 0 ? '↑' : '↓'}{Math.abs(varExames)}% vs ant.
              </span>
            )}
          </div>
        </div>

        {/* Resultados alterados */}
        <div className={`rounded-xl px-4 py-3 border flex items-center justify-between ${alterados > 0 ? 'bg-rose-950/30 border-red-200' : 'bg-white border-slate-200'}`}>
          <div>
            <p className="text-xs text-slate-500 font-medium">Resultados alterados</p>
            <p className="text-[10px] text-slate-400 mt-0.5">requer comunicação ao empregador</p>
          </div>
          <p className={`text-xl font-bold tabular-nums ${alterados > 0 ? 'text-red-700' : 'text-slate-800'}`}>
            {socOk ? alterados : '—'}
          </p>
        </div>

        {/* Vidas sob gestão */}
        <div className="bg-white rounded-xl px-4 py-3 border border-slate-200 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-medium">Vidas sob gestão</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{empresasAtivas} empresas ativas</p>
          </div>
          <p className="text-xl font-bold text-slate-800 tabular-nums">{socOk ? totalVidas.toLocaleString('pt-BR') : '—'}</p>
        </div>
      </div>

      {/* Layout principal */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Chat Lari — 2/3 */}
        <div className="md:col-span-2 space-y-6">
          <div>
            <h2 className="text-sm font-semibold text-slate-500 mb-3">Chat com Lari</h2>
            <LariChat initialMessages={initialMessages} />
          </div>

          {/* Gráficos — Agendamentos / Atendimentos / Faltantes */}
          {socOk && (
            <div>
              <h2 className="text-sm font-semibold text-slate-500 mb-3">Produção por Unidade</h2>
              <MedicinaCharts
                agendamentos={agendamentosGrafico}
                atendimentos={atendimentosGrafico}
                faltantes={compromissosFaltantesMes}
              />
            </div>
          )}

          {/* ASOs Vencidos por empresa */}
          {socOk && (
            <AsosVencidosChart dados={dadosAsosVencidos} />
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
            <div className="bg-white rounded-xl p-5 border border-slate-200">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Exames por Empresa ({nomeMes})</h3>
              <div className="space-y-3">
                {topExameEmp.map(([emp, qty]) => {
                  const pct = exames.length > 0 ? (qty / exames.length) * 100 : 0
                  return (
                    <div key={emp}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs text-slate-700 truncate flex-1 mr-2">{emp}</span>
                        <span className="text-xs font-medium text-emerald-700 shrink-0">{qty}</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
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
            <div className="bg-white rounded-xl p-5 border border-slate-200">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Top CIDs — Absenteísmo ({nomeMes})</h3>
              <p className="text-[11px] text-slate-400 mb-4">{Math.round(totalHoras)}h perdidas em {nomeMes}</p>
              <div className="space-y-2">
                {topCids.map(([cid, qty]) => (
                  <div key={cid} className="flex items-center gap-3">
                    <div className="w-16 shrink-0">
                      <span className="text-xs font-mono text-amber-700">{cid}</span>
                    </div>
                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-yellow-600 rounded-full"
                        style={{ width: `${(qty / topCids[0][1]) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-500 shrink-0 w-20 text-right">{cidGrupo(cid)}</span>
                    <span className="text-xs font-medium text-amber-700 shrink-0 w-6 text-right">{qty}</span>
                  </div>
                ))}
              </div>
              {/* Grupos CID */}
              {topGruposCid.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-200">
                  <p className="text-[10px] text-slate-400 mb-2">Por capítulo CID-10:</p>
                  <div className="flex flex-wrap gap-2">
                    {topGruposCid.map(([grupo, qty]) => (
                      <span key={grupo} className="text-[10px] bg-slate-100 text-slate-700 px-2 py-1 rounded">
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
          {/* Consultas por tipo: Admissional / Demissional / Periódico / Retorno / Mudança */}
          <div className="bg-white rounded-xl p-4 border border-slate-200">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Consultas por Tipo ({nomeMes})
              {clinicaisMesDetalhados.length > 0 && <span className="ml-1 text-emerald-600 font-normal normal-case text-[9px]">contagem correta</span>}
            </h3>
            {topTipos.length === 0 ? (
              <p className="text-xs text-slate-500">Sem dados</p>
            ) : (
              <div className="space-y-2">
                {topTipos.map(([tipo, qty]) => (
                  <div key={tipo} className="flex justify-between items-center">
                    <span className="text-xs text-slate-700">{tipo}</span>
                    <span className="text-xs font-medium text-emerald-700">{qty.toLocaleString('pt-BR')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Acidentes de trajeto */}
          {acidentesTrajeto > 0 && (
            <div className="bg-red-50 rounded-xl p-4 border border-red-200">
              <h3 className="text-xs font-semibold text-red-700 uppercase tracking-wider mb-3">
                🚨 {acidentesTrajeto} Acidente{acidentesTrajeto > 1 ? 's' : ''} de Trajeto
              </h3>
              <div className="space-y-1">
                {licencasAcidente.slice(0, 5).map((l, i) => (
                  <div key={i} className="text-xs">
                    <p className="text-slate-800 truncate">{l.NOMEFUNCIONARIO ?? '—'}</p>
                    <p className="text-red-700">{l.NOMEEMPRESA} · {l.DATA_INICIO_LICENCA}</p>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-red-700 mt-3 font-medium">→ Verificar CAT + eSocial S-2210</p>
            </div>
          )}

          {/* Próximos agendamentos */}
          <div className="bg-white rounded-xl p-4 border border-slate-200">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Próximos Agendamentos</h3>
            {proxAgendamentos.length === 0 ? (
              <p className="text-xs text-slate-500">Sem agendamentos</p>
            ) : (
              <div className="space-y-2">
                {proxAgendamentos.map((a, i) => (
                  <div key={i} className="text-xs border-b border-slate-200 pb-2 last:border-0 last:pb-0">
                    <p className="text-slate-800 truncate font-medium">{a.NOMEFUNCIONARIO ?? '—'}</p>
                    <p className="text-slate-500">{a.NOMEEMPRESA}</p>
                    <p className="text-emerald-500">{a.DATACOMPROMISSO} · {normalizarTipoExame(a.TIPOCOMPROMISSO)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ASOs Pendentes */}
          {asosPendentes.length > 0 && (
            <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
              <h3 className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-1">
                ⏳ {asosPendentes.length} ASO{asosPendentes.length !== 1 ? 's' : ''} Pendente{asosPendentes.length !== 1 ? 's' : ''}
              </h3>
              <p className="text-[10px] text-yellow-700 mb-3">Aguardando assinatura do médico</p>
              <div className="space-y-2">
                {asosPendentes.slice(0, 8).map((a, i) => (
                  <div key={i} className="text-xs border-b border-yellow-900/30 pb-2 last:border-0 last:pb-0">
                    <p className="text-slate-800 truncate font-medium">{a.NOMEFUNCIONARIO ?? '—'}</p>
                    <p className="text-slate-500 truncate">{a.NOMEEMPRESA ?? a.UNIDADE ?? '—'}</p>
                    <p className="text-amber-700 text-[10px]">{a.DATAFICHA} · {a.TIPOFICHA ?? '—'}</p>
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
          <div className="bg-white rounded-xl p-4 border border-slate-200">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Prazos eSocial Saúde</h3>
            <div className="space-y-2">
              {[
                { evento: 'S-2210', desc: 'CAT', prazo: '1 dia útil', cor: 'text-red-700' },
                { evento: 'S-2220', desc: 'ASO', prazo: 'Dia anterior', cor: 'text-amber-700' },
                { evento: 'S-2230', desc: 'Afastamento', prazo: '5 dias corridos', cor: 'text-orange-700' },
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
          </div>
        </div>
      </div>
      </div>
    </main>
  )
}
