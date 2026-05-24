// ============================================================
// LUI — Ferramentas (Tool Use) para o agente CEO
// Claude chama estas funções durante a conversa para buscar dados reais
// ============================================================

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { sendWhatsAppMessage } from './whatsapp'
import {
  carregarCategoriasExcluidas,
  filtrarParaDRE,
} from '@/lib/financeiro/regras'
import {
  getTodosFuncionarios,
  getExamesPeriodo,
  getAgendamentos,
  getDocumentosVencimentos,
  socConfigurado,
} from '@/lib/soc/client'
import { buildLuizitoContext } from '@/lib/agentes/luizito/context'
import {
  ANO_REFERENCIA, INDICADORES_DP, INDICADORES_DP_2024, TAXA_TURNOVER, ORGANOGRAMA, TOTAL_PESSOAS,
  COLABORADORES_POR_TIPO_2025, CUSTO_2025_PLANILHA_TOTAL, CUSTO_2024_PLANILHA_TOTAL,
} from '@/lib/rh/dados'
import { carregarCustoPessoal } from '@/lib/rh/custo-pessoal'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function hoje() { return new Date().toISOString().split('T')[0] }
function diasAtras(n: number) {
  return new Date(Date.now() - n * 86_400_000).toISOString().split('T')[0]
}
function diasAFrente(n: number) {
  return new Date(Date.now() + n * 86_400_000).toISOString().split('T')[0]
}

const CONTATOS_GERENTES: Record<string, string> = {
  lari:     '5545998206681',
  dieguito: '5545999728929',
  luizito:  '5545999779174',
  le:       '5545998196549',
  carlitos:  '5542998373742',
  josiane:  '5545999805004',
}

// ─── Definições das ferramentas (schema para Claude) ─────────────────────────

export const LUI_TOOLS: Anthropic.Tool[] = [
  {
    name: 'buscar_financeiro',
    description:
      'Busca lançamentos financeiros reais do Conta Azul (receitas e despesas). ' +
      'Já aplica filtro de transferências internas e conta atrasada. ' +
      'Use para responder perguntas sobre receita, despesa, inadimplência, resultado do mês, contas a pagar/receber.',
    input_schema: {
      type: 'object' as const,
      properties: {
        periodo_dias: {
          type: 'number',
          description: 'Quantos dias para trás consultar (padrão: 30, máximo: 365)',
        },
        tipo: {
          type: 'string',
          enum: ['receita', 'despesa', 'ambos'],
          description: 'Tipo de lançamento (padrão: ambos)',
        },
        status: {
          type: 'string',
          enum: ['vencido', 'pendente', 'pago', 'todos'],
          description: 'Status do lançamento (padrão: todos)',
        },
      },
      required: [],
    },
  },
  {
    name: 'buscar_saldos',
    description:
      'Retorna saldos bancários atuais de todas as contas ativas da holding (v_saldos_ativos). ' +
      'Use para perguntas sobre caixa disponível, posição bancária, saldo consolidado.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'buscar_integracoes',
    description:
      'Verifica status e histórico das integrações: Conta Azul, SOC, Pluggy. ' +
      'Use para verificar último sync, erros de integração ou saúde das conexões.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'buscar_asos',
    description:
      'Consulta o SOC para verificar ASOs vencidos: funcionários ativos sem consulta ocupacional há mais de 365 dias. ' +
      'ATENÇÃO: consulta lenta (5-15s). Use apenas para perguntas explicitamente sobre ASOs, medicina ou saúde ocupacional.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'buscar_agendamentos',
    description:
      'Consulta o SOC para listar agendamentos de consultas médicas dos próximos 30 dias. ' +
      'Use para perguntas sobre agenda médica, consultas marcadas, compromissos de saúde.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'buscar_comercial',
    description:
      'Busca dados comerciais: oportunidades de renovação de contratos (documentos SST vencidos/urgentes), ' +
      'inadimplência de clientes, receita por empresa nos últimos 90 dias e top clientes por vidas. ' +
      'Use para perguntas sobre vendas, renovações, churn, clientes em risco, pipeline comercial.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'buscar_treinamentos_nr',
    description:
      'Consulta o SOC para verificar vencimento de treinamentos em Normas Regulamentadoras (NR-06, NR-10, NR-12, NR-17, NR-20, NR-23, NR-33, NR-35, etc.). ' +
      'Retorna quantidades de treinamentos vencidos e urgentes por NR. ' +
      'Use para perguntas sobre conformidade SST, validade de treinamentos, NRs, segurança do trabalho.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'buscar_rh',
    description:
      'Retorna dados de RH & Pessoas: headcount, turnover, custo de pessoal mensal (folha interna + prestadores externos) ' +
      'e organograma por departamento. Use para perguntas sobre colaboradores, folha de pagamento, custo de pessoal.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'enviar_whatsapp',
    description:
      'Envia mensagem de WhatsApp para um gerente da equipe GP SafeWork. ' +
      'Só use quando o Cleber pedir explicitamente para avisar, acionar ou mandar mensagem para alguém. ' +
      'NUNCA envie sem confirmação explícita do Cleber.',
    input_schema: {
      type: 'object' as const,
      properties: {
        destinatario: {
          type: 'string',
          enum: ['lari', 'dieguito', 'luizito', 'le', 'carlitos', 'josiane'],
          description: 'Apelido do gerente destinatário',
        },
        mensagem: {
          type: 'string',
          description: 'Texto exato da mensagem a enviar',
        },
      },
      required: ['destinatario', 'mensagem'],
    },
  },
]

// ─── Executores das ferramentas ───────────────────────────────────────────────

type ToolInput = Record<string, unknown>

export async function executarFerramenta(nome: string, input: ToolInput): Promise<string> {
  try {
    switch (nome) {
      case 'buscar_financeiro':
        return await ferramentaFinanceiro(input)
      case 'buscar_saldos':
        return await ferramentaSaldos()
      case 'buscar_integracoes':
        return await ferramentaIntegracoes()
      case 'buscar_asos':
        return await ferramentaAsos()
      case 'buscar_agendamentos':
        return await ferramentaAgendamentos()
      case 'buscar_comercial':
        return await ferramentaComercial()
      case 'buscar_treinamentos_nr':
        return await ferramentaTreinamentosNR()
      case 'buscar_rh':
        return await ferramentaRH()
      case 'enviar_whatsapp':
        return await ferramentaWhatsApp(input)
      default:
        return `Ferramenta desconhecida: ${nome}`
    }
  } catch (err) {
    return `Erro ao executar ${nome}: ${err instanceof Error ? err.message : String(err)}`
  }
}

async function ferramentaFinanceiro(input: ToolInput): Promise<string> {
  const supabase = getSupabase()
  const periodo = Math.min(Number(input.periodo_dias ?? 30), 365)
  const tipo = (input.tipo as string) ?? 'ambos'
  const status = (input.status as string) ?? 'todos'

  let query = supabase
    .from('lancamentos_financeiros')
    .select('tipo, status, valor, categoria, data_vencimento, empresa_id')
    .gte('data_vencimento', diasAtras(periodo))
    .lte('data_vencimento', diasAFrente(30))
    .neq('status', 'cancelado')

  if (tipo !== 'ambos') query = query.eq('tipo', tipo)
  if (status !== 'todos') query = query.eq('status', status)

  const { data, error } = await query.limit(500)
  if (error) return `Erro ao buscar lançamentos: ${error.message}`

  const excluidas = await carregarCategoriasExcluidas(supabase)
  const lancamentos = filtrarParaDRE(data ?? [], excluidas)

  // Agrupa por mês e tipo
  const porMes: Record<string, { receita: number; despesa: number }> = {}
  let totalReceita = 0, totalDespesa = 0
  let vencidosReceita = 0, vencidosDespesa = 0

  for (const l of lancamentos) {
    const mes = (l.data_vencimento ?? '').slice(0, 7)
    if (!porMes[mes]) porMes[mes] = { receita: 0, despesa: 0 }
    const v = Number(l.valor ?? 0)
    if (l.tipo === 'receita') {
      porMes[mes].receita += v
      totalReceita += v
      if (l.status === 'vencido') vencidosReceita += v
    } else if (l.tipo === 'despesa') {
      porMes[mes].despesa += v
      totalDespesa += v
      if (l.status === 'vencido') vencidosDespesa += v
    }
  }

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
  const resultado = totalReceita - totalDespesa

  const linhasMes = Object.entries(porMes)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-3)
    .map(([mes, v]) => `  ${mes}: receita ${fmt(v.receita)} | despesa ${fmt(v.despesa)} | resultado ${fmt(v.receita - v.despesa)}`)
    .join('\n')

  return [
    `Lançamentos filtrados: ${lancamentos.length} (período: ${periodo} dias)`,
    `Receita total: ${fmt(totalReceita)} | Inadimplência (rec. vencida): ${fmt(vencidosReceita)}`,
    `Despesa total: ${fmt(totalDespesa)} | Despesas vencidas: ${fmt(vencidosDespesa)}`,
    `Resultado (receita - despesa): ${fmt(resultado)}`,
    `\nPor mês (últimos 3):\n${linhasMes || '  (sem dados no período)'}`,
  ].join('\n')
}

async function ferramentaSaldos(): Promise<string> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('v_saldos_ativos')
    .select('nome_exibicao, saldo, empresa_id, data_referencia')
    .order('saldo', { ascending: false })

  if (error) return `Erro ao buscar saldos: ${error.message}`
  if (!data || data.length === 0) return 'Nenhum saldo de conta ativa encontrado.'

  const total = data.reduce((s, b) => s + Number(b.saldo ?? 0), 0)
  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

  const linhas = data.map(b =>
    `  ${b.nome_exibicao ?? 'Conta'}: ${fmt(Number(b.saldo ?? 0))}${b.data_referencia ? ` (ref: ${b.data_referencia})` : ''}`
  ).join('\n')

  return `Saldo consolidado (contas ativas): ${fmt(total)}\n\nDetalhamento:\n${linhas}`
}

async function ferramentaIntegracoes(): Promise<string> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('sync_log')
    .select('fonte, status, finalizado_em, registros_processados, mensagem_erro')
    .order('finalizado_em', { ascending: false })
    .limit(10)

  if (error) return `Erro ao buscar sync: ${error.message}`
  if (!data || data.length === 0) return 'Nenhum registro de sync encontrado.'

  const porFonte: Record<string, typeof data[0]> = {}
  for (const s of data) {
    if (!porFonte[s.fonte]) porFonte[s.fonte] = s
  }

  const linhas = Object.entries(porFonte).map(([fonte, s]) => {
    const quando = s.finalizado_em
      ? new Date(s.finalizado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      : 'nunca'
    const regs = s.registros_processados != null ? ` | ${s.registros_processados} registros` : ''
    const erro = s.mensagem_erro ? ` | ERRO: ${String(s.mensagem_erro).slice(0, 100)}` : ''
    return `  ${fonte}: ${s.status} (${quando})${regs}${erro}`
  }).join('\n')

  return `Status das integrações (último sync por fonte):\n${linhas}`
}

async function ferramentaAsos(): Promise<string> {
  if (!socConfigurado()) return 'SOC não configurado — máscaras de acesso não definidas no ambiente.'

  const hoje365 = new Date(Date.now() - 365 * 86_400_000)
  const hojeDate = new Date()
  const ddmm = (d: Date) => {
    const p = (n: number) => String(n).padStart(2, '0')
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
  }

  const [funcionarios, exames] = await Promise.all([
    getTodosFuncionarios(),
    // Busca 13 meses de exames para cobrir o critério de 365 dias
    getExamesPeriodo(ddmm(new Date(Date.now() - 395 * 86_400_000)), ddmm(hojeDate)).catch(() => []),
  ])

  type Func = { SITUACAO?: string; NOMEFUNCIONARIO?: string }
  type Exame = { NOMEFUNCIONARIO?: string; DATAFICHA?: string; NOMEEXAME?: string }

  const funcs = funcionarios as Func[]
  const exs = exames as Exame[]

  function isConsultaOcupacional(nome?: string): boolean {
    if (!nome) return true
    const n = nome.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    return n.includes('CONSULTA') || n.includes('CLINICO') || n.includes('ASO')
  }

  function parseDataSoc(str?: string): Date | null {
    if (!str) return null
    if (str.includes('/')) {
      const p = str.split('/')
      return new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]))
    }
    const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]))
    return null
  }

  const ultimaConsulta: Record<string, Date> = {}
  for (const e of exs) {
    if (!isConsultaOcupacional(e.NOMEEXAME)) continue
    const dt = parseDataSoc(e.DATAFICHA)
    const nome = e.NOMEFUNCIONARIO
    if (!dt || !nome) continue
    if (!ultimaConsulta[nome] || dt > ultimaConsulta[nome]) ultimaConsulta[nome] = dt
  }

  const ativos = funcs.filter(f => f.SITUACAO === 'Ativo')
  let vencidos = 0
  const listaPrioridade: string[] = []

  for (const f of ativos) {
    const nome = f.NOMEFUNCIONARIO
    if (!nome) continue
    const ult = ultimaConsulta[nome]
    if (!ult || ult < hoje365) {
      vencidos++
      if (listaPrioridade.length < 5) {
        const diasSem = ult ? Math.floor((hojeDate.getTime() - ult.getTime()) / 86_400_000) : 999
        listaPrioridade.push(`  ${nome}: ${ult ? `última ${ddmm(ult)} (${diasSem} dias)` : 'sem registro'}`)
      }
    }
  }

  return [
    `Funcionários ativos: ${ativos.length}`,
    `ASOs vencidos (>365d sem consulta): ${vencidos}`,
    `ASOs em dia: ${ativos.length - vencidos}`,
    listaPrioridade.length > 0
      ? `\nPrioridade para agendar (primeiros 5):\n${listaPrioridade.join('\n')}`
      : '',
  ].filter(Boolean).join('\n')
}

async function ferramentaAgendamentos(): Promise<string> {
  if (!socConfigurado()) return 'SOC não configurado.'

  const agendamentos = await getAgendamentos()
  if (agendamentos.length === 0) return 'Nenhum agendamento encontrado nos próximos 30 dias.'

  type Agend = { NOMEFUNCIONARIO?: string; DATACOMPROMISSO?: string; NOMEAGENDA?: string; NOMEEMPRESA?: string }
  const ags = (agendamentos as Agend[]).slice(0, 20)

  const linhas = ags.map(a =>
    `  ${a.DATACOMPROMISSO ?? '—'} | ${a.NOMEFUNCIONARIO ?? '—'} | ${a.NOMEAGENDA ?? '—'} | ${a.NOMEEMPRESA ?? '—'}`
  ).join('\n')

  return `Agendamentos próximos 30 dias: ${agendamentos.length} total\n\nPróximos 20:\n${linhas}`
}

async function ferramentaComercial(): Promise<string> {
  try {
    const contexto = await buildLuizitoContext()
    return contexto
  } catch (err) {
    return `Erro ao buscar dados comerciais: ${err instanceof Error ? err.message : String(err)}`
  }
}

const NRS_KEYWORDS: Record<string, string[]> = {
  'NR-06': ['nr-06', 'nr 06', 'nr06', 'epi', 'equipamento de proteção'],
  'NR-10': ['nr-10', 'nr 10', 'nr10', 'eletricidade', 'elétrica', 'instalação elétrica'],
  'NR-11': ['nr-11', 'nr 11', 'nr11', 'transporte', 'movimentação', 'armazenagem'],
  'NR-12': ['nr-12', 'nr 12', 'nr12', 'máquina', 'equipamento', 'maquinário'],
  'NR-17': ['nr-17', 'nr 17', 'nr17', 'ergonomia'],
  'NR-20': ['nr-20', 'nr 20', 'nr20', 'inflamável', 'combustível'],
  'NR-23': ['nr-23', 'nr 23', 'nr23', 'combate a incêndio', 'incêndio', 'extintor'],
  'NR-33': ['nr-33', 'nr 33', 'nr33', 'espaço confinado', 'confinado'],
  'NR-35': ['nr-35', 'nr 35', 'nr35', 'trabalho em altura', 'altura'],
}

function detectarNRLui(nomeProduto: string): string | null {
  const lower = nomeProduto.toLowerCase()
  for (const [nr, keywords] of Object.entries(NRS_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) return nr
  }
  const m = lower.match(/nr[-\s]?(\d{2})/)
  if (m) return `NR-${m[1].padStart(2, '0')}`
  return null
}

async function ferramentaTreinamentosNR(): Promise<string> {
  if (!socConfigurado()) return 'SOC não configurado — variáveis de ambiente SOC ausentes.'

  type DocVenc = { NOME_PRODUTO?: string; DATA_VENCIMENTO?: string; LOCAL_TRABALHO?: string }

  let docs: DocVenc[] = []
  try {
    docs = (await getDocumentosVencimentos()) as DocVenc[]
  } catch (err) {
    return `Erro ao consultar SOC: ${err instanceof Error ? err.message : String(err)}`
  }

  const hojeMs = Date.now()

  function parseDataSocDoc(str?: string): Date | null {
    if (!str) return null
    const p = str.includes('/') ? str.split('/') : null
    if (p && p.length === 3) return new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]))
    const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]))
    return null
  }

  const porNR: Record<string, { vencidos: number; urgentes: number; atencao: number; ok: number }> = {}
  let semNR = 0

  for (const d of docs) {
    const nr = detectarNRLui(d.NOME_PRODUTO ?? '')
    if (!nr) { semNR++; continue }
    if (!porNR[nr]) porNR[nr] = { vencidos: 0, urgentes: 0, atencao: 0, ok: 0 }
    const dt = parseDataSocDoc(d.DATA_VENCIMENTO)
    if (!dt) { porNR[nr].ok++; continue }
    const diffDias = Math.floor((dt.getTime() - hojeMs) / 86_400_000)
    if (diffDias < 0) porNR[nr].vencidos++
    else if (diffDias <= 30) porNR[nr].urgentes++
    else if (diffDias <= 60) porNR[nr].atencao++
    else porNR[nr].ok++
  }

  if (Object.keys(porNR).length === 0) return 'Nenhum treinamento NR encontrado no SOC.'

  const totalVencidos = Object.values(porNR).reduce((s, v) => s + v.vencidos, 0)
  const totalUrgentes = Object.values(porNR).reduce((s, v) => s + v.urgentes, 0)

  const linhas = Object.entries(porNR)
    .sort(([, a], [, b]) => (b.vencidos + b.urgentes) - (a.vencidos + a.urgentes))
    .map(([nr, v]) => `  ${nr}: ${v.vencidos} vencidos | ${v.urgentes} urgentes (<30d) | ${v.atencao} atenção (<60d) | ${v.ok} ok`)
    .join('\n')

  return [
    `Treinamentos NR rastreados: ${docs.length - semNR} (${semNR} sem NR identificada)`,
    `TOTAL vencidos: ${totalVencidos} | urgentes (<30d): ${totalUrgentes}`,
    `\nPor NR:\n${linhas}`,
  ].join('\n')
}

async function ferramentaRH(): Promise<string> {
  const supabase = getSupabase()
  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

  const [custo, custoAnt] = await Promise.all([
    carregarCustoPessoal(supabase, ANO_REFERENCIA),
    carregarCustoPessoal(supabase, ANO_REFERENCIA - 1),
  ])

  const ultimo = custo.meses.length - 1
  const mesLabel = custo.meses[ultimo] ?? '—'
  const internoAtual = custo.internoMensal[ultimo] ?? 0
  const externoAtual = custo.externoMensal[ultimo] ?? 0
  const totalAtual = internoAtual + externoAtual
  const internoAntMes = custo.internoMensal[ultimo - 1] ?? internoAtual
  const varInterno = internoAntMes ? Math.round(((internoAtual - internoAntMes) / internoAntMes) * 100) : 0

  const totalAnoInterno = custo.internoMensal.reduce((s, v) => s + v, 0)
  const totalAnoExterno = custo.externoMensal.reduce((s, v) => s + v, 0)
  const mediaInterno = custo.meses.length ? Math.round(totalAnoInterno / custo.meses.length) : 0

  const porGrupo = ORGANOGRAMA.reduce<Record<string, number>>((acc, s) => {
    acc[s.grupo] = (acc[s.grupo] ?? 0) + s.pessoas.length
    return acc
  }, {})
  const gruposLinhas = Object.entries(porGrupo)
    .sort(([, a], [, b]) => b - a)
    .map(([g, n]) => `  ${g}: ${n} pessoas`)
    .join('\n')

  return [
    `=== RH & Pessoas — GP SafeWork (${ANO_REFERENCIA}) ===`,
    ``,
    `Headcount (organograma físico): ${TOTAL_PESSOAS} pessoas`,
    `Quadro DP (planilha RH — Jan/Nov 2025):`,
    `  Headcount: ${INDICADORES_DP.headcountInicial} → ${INDICADORES_DP.headcountFinal}`,
    `  CLT ${COLABORADORES_POR_TIPO_2025.CLT} | PJ ${COLABORADORES_POR_TIPO_2025.PJ} | Outros ${COLABORADORES_POR_TIPO_2025.Outros}`,
    `  Contratações: ${INDICADORES_DP.contratacoes} | Desligamentos: ${INDICADORES_DP.desligamentos}`,
    `  Turnover acumulado: ${TAXA_TURNOVER.toFixed(1)}%`,
    ``,
    `Comparativo 2024: ${INDICADORES_DP_2024.contratacoes} contratações, ${INDICADORES_DP_2024.desligamentos} desligamentos, turnover ${INDICADORES_DP_2024.turnoverAcumulado.toFixed(1)}%`,
    ``,
    `Custo de Pessoal (Conta Azul) — ${mesLabel}/${ANO_REFERENCIA}:`,
    `  Folha interna (CLT+PJ+estágio+pró-labore+encargos): ${fmt(internoAtual)} (${varInterno >= 0 ? '+' : ''}${varInterno}% vs mês ant.)`,
    `  Prestadores externos (clínicas, instrutores, Moha): ${fmt(externoAtual)}`,
    `  Total: ${fmt(totalAtual)}`,
    `  Custo médio/pessoa: ${fmt(Math.round(internoAtual / INDICADORES_DP.headcountFinal))}`,
    ``,
    `Acumulado ${ANO_REFERENCIA} (Conta Azul): interno ${fmt(totalAnoInterno)} | externo ${fmt(totalAnoExterno)}`,
    `Média mensal folha interna: ${fmt(mediaInterno)}`,
    ``,
    `CTSE da planilha RH (Custo Total Salários + Encargos):`,
    `  2025 (Jan-Nov): ${fmt(CUSTO_2025_PLANILHA_TOTAL)}`,
    `  2024 (ano completo): ${fmt(CUSTO_2024_PLANILHA_TOTAL)}`,
    custo.meses.length > 0 && custoAnt.meses.length > 0
      ? `\nComparativo Conta Azul YoY: ${ANO_REFERENCIA} ${fmt(totalAnoInterno)} vs ${ANO_REFERENCIA - 1} ${fmt(custoAnt.internoMensal.reduce((s, v) => s + v, 0))}`
      : '',
    ``,
    `Organograma por departamento:\n${gruposLinhas}`,
  ].filter(Boolean).join('\n')
}

async function ferramentaWhatsApp(input: ToolInput): Promise<string> {
  const destinatario = String(input.destinatario ?? '').toLowerCase()
  const mensagem = String(input.mensagem ?? '').trim()

  if (!mensagem) return 'Erro: mensagem vazia.'

  const numero = CONTATOS_GERENTES[destinatario]
  if (!numero) return `Gerente "${destinatario}" não encontrado. Use: ${Object.keys(CONTATOS_GERENTES).join(', ')}`

  const ok = await sendWhatsAppMessage(numero, mensagem)
  if (ok) {
    return `✅ Mensagem enviada para ${destinatario} (${numero}): "${mensagem.slice(0, 80)}${mensagem.length > 80 ? '...' : ''}"`
  }
  return `❌ Falha ao enviar mensagem para ${destinatario}. Verifique se Z-API/Evolution está configurado.`
}
