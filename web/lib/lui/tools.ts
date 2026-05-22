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
  socConfigurado,
} from '@/lib/soc/client'

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
