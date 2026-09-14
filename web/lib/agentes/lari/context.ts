import { createClient } from '@supabase/supabase-js'
import {
  getFuncionarios,
  getAgendamentos,
  getHistoricoFuncionarios,
  getLicencasMedicas,
  getExamesDetalhados,
  socConfigurado,
} from '@/lib/soc/client'
import {
  HISTORICO_MEDICINA,
  MEDICINA_2024,
  MEDICINA_2025,
  MEDICINA_2026,
  variacaoConsultas,
  topUnidades,
  mediaMensal,
} from '@/lib/medicina/dados'

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

  // Cliente do espelho local — usado pelo parecer de ASO e pelo resumo.
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const falhasSOC: string[] = []
  const [funcionarios, agendamentos, historico, licencas] = await Promise.all([
    tentar(falhasSOC, 'funcionários', () => getFuncionarios(), [] as unknown[]),
    tentar(falhasSOC, 'agendamentos', () => getAgendamentos(), [] as unknown[]),
    tentar(falhasSOC, 'histórico de funcionários', () => getHistoricoFuncionarios(), [] as unknown[]),
    tentar(falhasSOC, 'licenças médicas', () => getLicencasMedicas(), [] as unknown[]),
    // getExamesDetalhados saiu daqui: a máscara 193540 EXIGE o código de uma
    // empresa cliente e a chamada sem ele falhava em toda montagem de contexto.
    // O parecer agora vem do espelho, agregado — ver fn_parecer_aso_resumo.
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

  // Exames detalhados — máscara 193540 (SAIASO, PARECERASO, por funcionário)
  // Campos: NOMEFUNCIONARIO, MATRICULA, TIPOFICHA, NOMEEXAME, CODEXAME,
  //   EXAMEALTERADO, SAIASO, PARECERASO, UNIDADE, SETOR, CARGO, CPF
  type ExameDetalhado = {
    EMPRESA?: string; NOMEFUNCIONARIO?: string; MATRICULA?: string; CPF?: string
    DATAFICHA?: string; TIPOFICHA?: string; DATAEXAMES?: string
    CODEXAME?: string; NOMEEXAME?: string; EXAMEALTERADO?: string
    SAIASO?: string; PARECERASO?: string; UNIDADE?: string; SETOR?: string; CARGO?: string
  }
  // Parecer de ASO e exames alterados — do espelho, agregados no banco.
  //
  // Vinha de getExamesDetalhados(), que exige o código de uma empresa cliente e
  // era chamada sem ele: falhava em toda montagem, e a Lari ficava sem parecer,
  // sem inaptos e sem exames alterados. O espelho tem os mesmos campos para
  // todas as empresas, e agregar evita trafegar 121 mil linhas com CPF para
  // contar categorias.
  const { data: parecerJson, error: erroParecer } = await db.rpc('fn_parecer_aso_resumo')
  type Critico = { total: number; ainda_ativos: number; ja_desligados: number; sem_cadastro_de_vinculo: number }
  type ParecerRpc = {
    exames_no_periodo: number
    pessoas_no_periodo: number
    por_parecer_pessoas: Record<string, number>
    total_alterados: number
    alterados_por_exame: { exame: string; qtd: number }[]
    alterados_por_setor: { setor: string; qtd: number }[]
    inaptos: Critico
    com_restricao: Critico
    nomes_para_agir: { nome: string; empresa: string | null; cargo: string; setor: string; parecer: string; exame_em: string }[]
  }
  const parecer = parecerJson as ParecerRpc | null

  if (erroParecer) {
    ctx.exames_detalhados = {
      indisponivel: true,
      motivo: erroParecer.message,
      instrucao: 'NÃO afirme que não há inaptos ou exames alterados — a consulta falhou.',
    }
  } else if (parecer && parecer.exames_no_periodo > 0) {
    ctx.exames_detalhados = {
      exames_no_periodo: parecer.exames_no_periodo,
      pessoas_no_periodo: parecer.pessoas_no_periodo,
      total_exames_alterados: parecer.total_alterados,
      resultados_aso_por_pessoa: parecer.por_parecer_pessoas,
      inaptos: parecer.inaptos,
      com_restricoes: parecer.com_restricao,
      nomes_para_agir: parecer.nomes_para_agir,
      top_exames_alterados: parecer.alterados_por_exame,
      top_setores_alterados: parecer.alterados_por_setor,
      nota: 'Inapto para Função = afastamento obrigatório. Apto com Restrições = restrição de função. Exame alterado = resultado clínico anormal.',
      como_ler: [
        'Toda contagem de parecer aqui é de PESSOAS, pelo exame mais recente de cada uma — não de exames. A mesma pessoa aparece em vários exames, e somar linhas multiplica o número por cerca de cinco.',
        'Em inaptos e com_restricoes, o número que exige ação é ainda_ativos: quem já foi desligado não é pendência.',
        'sem_cadastro_de_vinculo = a pessoa não está em soc_funcionarios, que só guarda quem tem vínculo. Sugere desligamento, mas não comprova — se perguntarem, diga que não dá para afirmar.',
        'nomes_para_agir traz só quem está ativo, no máximo 20, por ser dado de saúde.',
        'Cargo e setor vêm do cadastro de vínculo, não do exame: o exame guarda só o código interno da empresa cliente, que não significa o mesmo entre empresas diferentes. Onde o cadastro falta, aparece "(sem cadastro)" — 29% das linhas de exame alterado.',
        'O período é de 365 dias, o mesmo alcance do espelho.',
      ],
    }
  } else {
    ctx.exames_detalhados = {
      indisponivel: true,
      motivo: 'espelho de exames por trabalhador vazio — a carga do SOC ainda não rodou',
      instrucao: 'NÃO afirme que não há inaptos: não há dado para afirmar isso.',
    }
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
  const cidDescMap: Record<string, string> = {
    M: 'Osteomuscular', F: 'Transtorno Mental/Comportamental', Z: 'Fatores Sociais',
    J: 'Respiratório', K: 'Digestivo', S: 'Acidente/Lesão Traumática',
    T: 'Intoxicação/Queimadura', G: 'Neurológico', R: 'Sintomas Inespecíficos',
    I: 'Cardiovascular', A: 'Infecciosa', B: 'Parasitária', C: 'Neoplasia',
    D: 'Sangue/Imunidade', E: 'Endócrino/Metabólico', H: 'Olhos/Ouvidos',
    L: 'Pele', N: 'Geniturinário', O: 'Gravidez/Parto', P: 'Neonatal',
    Q: 'Malformação Congênita', U: 'COVID/Emergência', V: 'Acidente Transporte',
    W: 'Queda/Afogamento', X: 'Queimadura/Envenenamento', Y: 'Causa Externa',
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

  // Grupo CID-10 para visão macro
  const cidGrupoMap: Record<string, number> = {}
  for (const l of licencas as Licenca[]) {
    if (l.CODCID) {
      const grp = l.CODCID[0].toUpperCase()
      cidGrupoMap[grp] = (cidGrupoMap[grp] ?? 0) + 1
    }
  }

  // Taxa de absenteísmo (benchmark: <3%)
  const headcountAtivos = (funcionarios as Array<{ SITUACAO?: string }>).filter(f => f.SITUACAO === 'Ativo').length
  const taxaAbsenteismo = headcountAtivos > 0
    ? ((totalHorasAfastamento / (headcountAtivos * 176)) * 100).toFixed(2)
    : null

  ctx.absenteismo_31d = {
    total_licencas: licencas.length,
    total_horas_afastamento: Math.round(totalHorasAfastamento),
    taxa_absenteismo_pct: taxaAbsenteismo ? `${taxaAbsenteismo}%` : 'indisponível',
    benchmark_referencia: '<3% saudável, 3-5% atenção, >5% crítico',
    acidentes_trajeto: acidentesTrajeto,
    top_cids: topCids.map(([cid, qtd]) => ({
      cid,
      quantidade: qtd,
      grupo_cid: cidDescMap[cid[0]?.toUpperCase()] ?? 'Outros',
    })),
    grupos_cid: Object.entries(cidGrupoMap)
      .sort((a, b) => b[1] - a[1])
      .map(([grp, qtd]) => ({ grupo: grp, descricao: cidDescMap[grp] ?? grp, quantidade: qtd })),
    lista: (licencas as Licenca[]).slice(0, 20).map(l => ({
      funcionario: l.NOMEFUNCIONARIO,
      cid: l.CODCID,
      motivo: l.MOTIVO_LICENCA,
      tipo: l.TIPO_LICENCA,
      inicio: l.DATA_INICIO_LICENCA,
      fim: l.DATA_FIM_LICENCAO,
      horas: l.AFASTAMENTO_EM_HORAS,
      situacao: l.SITUACAO,
      acidente_trajeto: l.ACIDENTE_TRAJETO === '1' || l.ACIDENTE_TRAJETO === 'S',
    })),
    nota_clinica: 'CIDs M/F/Z mais frequentes em SST. Reincidência = possível doença ocupacional.',
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

  // ─── Histórico anual (planilha manual — Controle Atendimentos) ──────────
  // Visão retrospectiva para análise de tendência ano a ano.
  ctx.historico_anual = {
    fonte: 'Planilha manual "Controle Atendimentos - Unidades - SafeWork"',
    referencia_recente: {
      ano: MEDICINA_2024.ano,
      status: MEDICINA_2024.status,
      consultas_total: MEDICINA_2024.consultas_total,
      consultas_media_mensal: Math.round(mediaMensal(MEDICINA_2024.consultas_mensais)),
      exames_por_tipo: MEDICINA_2024.exames_por_tipo,
      top_unidades: topUnidades(MEDICINA_2024, 5),
      observacao: MEDICINA_2024.observacao,
    },
    ano_corrente: {
      ano: MEDICINA_2026.ano,
      status: MEDICINA_2026.status,
      consultas_acumulado: MEDICINA_2026.consultas_total,
      observacao: MEDICINA_2026.observacao,
    },
    serie_anual: HISTORICO_MEDICINA
      .filter(h => h.status !== 'pendente')
      .map(h => ({
        ano: h.ano,
        status: h.status,
        consultas: h.consultas_total,
      })),
    variacao_2024_vs_2025: MEDICINA_2025.consultas_total > 0
      ? `${variacaoConsultas(MEDICINA_2025.consultas_total, MEDICINA_2024.consultas_total).toFixed(1)}%`
      : 'pendente — dados de 2025 ainda não importados',
    nota: 'Histórico complementa o SOC com sazonalidade e tendência multi-anual.',
  }

  // ── ASO por trabalhador, do espelho local ────────────────────────────────
  //
  // Vem do banco, não do SOC ao vivo: continua respondendo quando a API está
  // fora, que é quando mais se pergunta se há ASO vencido.
  // Agregado no banco, não contado aqui.
  //
  // Havia um db.rpc('fn_aso_vencido') seguido de contagem em JavaScript, e essa
  // função devolve 21.308 trabalhadores: o PostgREST corta em 1.000 e a Lari
  // respondia sobre 5% do quadro. É o mesmo defeito já corrigido na tela de
  // medicina, que passou a usar fn_aso_resumo — o agente tinha ficado para trás.
  //
  // Com o agregado ela recebe 21.308 e 5.223 no lugar de 1.000 e 261, e o CPF
  // de 21 mil pessoas deixa de trafegar para montar quatro contadores.
  const { data: asoJson, error: erroAso } = await db.rpc('fn_aso_resumo', { p_top_empresas: 10 })
  type ResumoAsoRpc = {
    trabalhadores: number
    precisam_acao: number
    por_situacao: Record<string, number>
    top_empresas: { empresa: string; qtd: number }[]
  }
  const resumoAso = asoJson as ResumoAsoRpc | null

  if (erroAso) {
    ctx.aso_por_trabalhador = {
      indisponivel: true,
      motivo: erroAso.message,
      instrucao: 'NÃO afirme número de ASO vencido — a consulta falhou.',
    }
  } else if (!resumoAso || resumoAso.trabalhadores === 0) {
    ctx.aso_por_trabalhador = {
      indisponivel: true,
      motivo: 'espelho de trabalhadores vazio — a carga do SOC ainda não rodou',
      instrucao: 'NÃO afirme que não há ASO vencido: não há dado para afirmar isso.',
    }
  } else {
    ctx.aso_por_trabalhador = {
      trabalhadores_com_vinculo: resumoAso.trabalhadores,
      precisam_de_acao: resumoAso.precisam_acao,
      por_situacao: resumoAso.por_situacao,
      top_empresas_com_pendencia: resumoAso.top_empresas,
      como_ler: [
        '"vencido" inclui quem não tem consulta no espelho: ele cobre ~365 dias, e não achar consulta ali E nao ter consulta no ultimo ano.',
        'O calculo depende do cadastro de situacao no SOC. Quem saiu e continua Ativo aparece como vencido; quem esta ativo cadastrado como Inativo NAO aparece — este e o caso perigoso, porque o silencio parece boa noticia.',
        'Ao citar o numero, cite a ressalva junto.',
      ],
    }
  }

  if (foco) ctx.foco_pergunta = foco
  // O agente precisa saber que está cego para poder dizer isso a quem
  // perguntou, em vez de afirmar ausência a partir de lista vazia.
  if (falhasSOC.length) {
    ctx.aviso_dados_incompletos =
      `ATENÇÃO: ${falhasSOC.length} consulta(s) ao SOC falharam nesta leitura (${falhasSOC.join(', ')}). ` +
      'Os números correspondentes estão zerados por falta de dado, não por ausência de registro. ' +
      'NÃO afirme que não há pendências com base neles — diga que a consulta falhou.'
  }
  return JSON.stringify(ctx, null, 2)
}

/**
 * Consulta que falha entra como lista vazia MAS deixa rastro em `falhas`.
 *
 * Sem isso, o SOC fora do ar faria o agente responder "não há ASO vencido" com
 * a mesma segurança de quando olhou de verdade. O agente precisa saber que
 * está cego para poder dizer isso a quem perguntou.
 */
async function tentar<T>(falhas: string[], nome: string, buscar: () => Promise<T>, vazio: T): Promise<T> {
  try {
    return await buscar()
  } catch (e) {
    falhas.push(nome)
    console.error(`[SOC] ${nome} falhou:`, e)
    return vazio
  }
}
