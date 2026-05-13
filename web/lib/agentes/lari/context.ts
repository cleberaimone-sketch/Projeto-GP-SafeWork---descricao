import {
  getTodosFuncionarios,
  getAgendamentos,
  getHistoricoFuncionarios,
  getLicencasMedicas,
  socConfigurado,
} from '@/lib/soc/client'

function hoje() { return new Date().toISOString().split('T')[0] }
function diasAFrente(n: number) { return new Date(Date.now() + n * 86400000).toISOString().split('T')[0] }

export async function buildLariContext(foco?: string): Promise<string> {
  const ctx: Record<string, unknown> = {
    data_referencia: hoje(),
    soc_configurado: socConfigurado(),
  }

  if (!socConfigurado()) {
    ctx.aviso = 'SOC não configurado. Copiar máscaras em Menu → Relatórios → Relatório Exporta Dados e preencher SOC_MASK_* no Vercel.'
    if (foco) ctx.foco_pergunta = foco
    return JSON.stringify(ctx, null, 2)
  }

  const [funcionarios, agendamentos, historico, licencas] = await Promise.all([
    getTodosFuncionarios(),
    getAgendamentos(),
    getHistoricoFuncionarios(),
    getLicencasMedicas(),
  ])

  // Exames realizados — últimos 30 dias (máscara 191865)
  // Campos: EMPRESA, NOMEEMPRESA, DATAFICHA, TIPOEXAME, CODEXAME, NOMEEXAME, EXAMEALTERADO
  type Exame = {
    EMPRESA?: string; NOMEEMPRESA?: string; DATAFICHA?: string
    TIPOEXAME?: string; CODEXAME?: string; NOMEEXAME?: string; EXAMEALTERADO?: string
  }
  const exames = historico as Exame[]

  // Agrupa por tipo de exame
  const tipoMap: Record<string, number> = {}
  const empresaExameMap: Record<string, number> = {}
  let alterados = 0
  for (const e of exames) {
    const tipo = e.TIPOEXAME ?? 'desconhecido'
    tipoMap[tipo] = (tipoMap[tipo] ?? 0) + 1
    const emp = e.NOMEEMPRESA ?? e.EMPRESA ?? 'sem empresa'
    empresaExameMap[emp] = (empresaExameMap[emp] ?? 0) + 1
    if (e.EXAMEALTERADO === '1') alterados++
  }

  // Valores reais que o SOC retorna no campo TIPOEXAME
  const tipoLabel: Record<string, string> = {
    // Forma longa (valores reais da API)
    'Admissão': 'Admissional',
    'Jornal': 'Periódico',
    'Demissional': 'Demissional',
    'Mudança de posição': 'Mudança de Função',
    'rett': 'Retorno ao Trabalho',
    'seg': 'Seguimento/Controle',
    // Códigos curtos (fallback para outras configurações)
    adm: 'Admissional', per: 'Periódico', dem: 'Demissional',
    ret: 'Retorno ao Trabalho', mud: 'Mudança de Função', con: 'Controle',
  }

  ctx.exames_30d = {
    total: exames.length,
    alterados,
    por_tipo: Object.entries(tipoMap)
      .sort((a, b) => b[1] - a[1])
      .map(([tipo, qty]) => ({ tipo, descricao: tipoLabel[tipo] ?? tipo, quantidade: qty })),
    top_empresas: Object.entries(empresaExameMap)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([empresa, qty]) => ({ empresa, quantidade: qty })),
    nota: 'Exames realizados nos últimos 30 dias. Exame alterado = resultado anormal.',
  }

  // Agendamentos próximos 30 dias (máscara 215357)
  // Campos uppercase: DATACOMPROMISSO, NOMEFUNCIONARIO, NOMEEMPRESA, TIPOCOMPROMISSO, NOMEAGENDA
  const tipoAgenda: Record<string, string> = {
    '1': 'Periódico', '2': 'Admissional', '3': 'Retorno ao Trabalho',
    '4': 'Mudança de Função', '5': 'Demissional', '6': 'Monitoramento Pontual', '10': 'Consulta',
  }
  type Agenda = { DATACOMPROMISSO?: string; NOMEFUNCIONARIO?: string; NOMEEMPRESA?: string; TIPOCOMPROMISSO?: string; NOMEAGENDA?: string }
  const agendaList = agendamentos as Agenda[]
  ctx.agendamentos = {
    total: agendaList.length,
    lista: agendaList.slice(0, 30).map(a => ({
      data: a.DATACOMPROMISSO,
      funcionario: a.NOMEFUNCIONARIO,
      empresa: a.NOMEEMPRESA,
      tipo: tipoAgenda[a.TIPOCOMPROMISSO ?? ''] ?? a.TIPOCOMPROMISSO,
      agenda: a.NOMEAGENDA,
    })),
  }

  // Absenteísmo (últimos 31 dias — máscara 163382)
  // Campos uppercase: CODCID, NOMEFUNCIONARIO, DATA_INICIO_LICENCA, DATA_FIM_LICENCAO,
  //   AFASTAMENTO_EM_HORAS, MOTIVO_LICENCA, TIPO_LICENCA, SITUACAO, ACIDENTE_TRAJETO
  type Licenca = {
    CODCID?: string; NOMEFUNCIONARIO?: string; DATA_INICIO_LICENCA?: string
    DATA_FIM_LICENCAO?: string; AFASTAMENTO_EM_HORAS?: string
    MOTIVO_LICENCA?: string; TIPO_LICENCA?: string; SITUACAO?: string; ACIDENTE_TRAJETO?: string
  }
  const cidMap: Record<string, number> = {}
  let totalHorasAfastamento = 0
  let acidentesTrajeto = 0
  for (const l of licencas as Licenca[]) {
    if (l.CODCID) cidMap[l.CODCID] = (cidMap[l.CODCID] ?? 0) + 1
    totalHorasAfastamento += Number(l.AFASTAMENTO_EM_HORAS ?? 0)
    if (l.ACIDENTE_TRAJETO === '1' || l.ACIDENTE_TRAJETO === 'S') acidentesTrajeto++
  }
  const topCids = Object.entries(cidMap).sort((a, b) => b[1] - a[1]).slice(0, 10)

  ctx.absenteismo_31d = {
    total_licencas: licencas.length,
    total_horas_afastamento: totalHorasAfastamento,
    acidentes_trajeto: acidentesTrajeto,
    top_cids: topCids.map(([cid, qtd]) => ({ cid, quantidade: qtd })),
    lista: (licencas as Licenca[]).slice(0, 20).map(l => ({
      funcionario: l.NOMEFUNCIONARIO,
      cid: l.CODCID,
      motivo: l.MOTIVO_LICENCA,
      tipo: l.TIPO_LICENCA,
      inicio: l.DATA_INICIO_LICENCA,
      fim: l.DATA_FIM_LICENCAO,
      horas: l.AFASTAMENTO_EM_HORAS,
      situacao: l.SITUACAO,
    })),
  }

  // Headcount por empresa (campos uppercase da máscara 192399)
  const empMap: Record<string, number> = {}
  for (const f of funcionarios as Array<{ NOMEEMPRESA?: string; nomeEmpresa?: string }>) {
    const emp = f.NOMEEMPRESA ?? f.nomeEmpresa ?? 'Sem empresa'
    empMap[emp] = (empMap[emp] ?? 0) + 1
  }
  const ativos = (funcionarios as Array<{ SITUACAO?: string }>).filter(f => f.SITUACAO === 'Ativo').length
  ctx.headcount = {
    total: funcionarios.length,
    ativos,
    por_empresa: empMap,
  }

  if (foco) ctx.foco_pergunta = foco
  return JSON.stringify(ctx, null, 2)
}
