// Classificação de categorias do Conta Azul em grupos gerenciais

export type GrupoFinanceiro =
  | 'receita_operacional'
  | 'receita_financeira'
  | 'receita_outros'
  | 'csp'           // Custo dos Serviços Prestados
  | 'pessoal'
  | 'administrativo'
  | 'comercial'
  | 'impostos'
  | 'financeiro'    // Juros, IOF, tarifas bancárias
  | 'investimento'
  | 'transferencia' // EXCLUIR do DRE e fluxo
  | 'outros'

const REGRAS: [RegExp, GrupoFinanceiro][] = [
  // Transferências — excluir sempre
  [/transfer[eê]ncia|repasse entre contas|movimento interno/i, 'transferencia'],

  // Pessoal
  [/sal[aá]rio|folha|f[eé]rias|13[°o]|rescis[aã]o|encargo|inss|fgts|e-social|horas? extra|adiantamento|pró.labore|prolabore|ben[eé]ficio|vt |va |vr |vale.transporte|vale.alimenta/i, 'pessoal'],

  // Impostos e tributos
  [/irpj|csll|pis|cofins|iss |issqn|darf|das |simples|irrf|imposto|tributo|gps |guia |parcelamento fiscal/i, 'impostos'],

  // Financeiro (juros, empréstimos, tarifas)
  [/juro|empréstimo|financiamento|iof |tarifa bancária|tarifa banco|tarifa conta|ted |doc |cheque|cobrança bancária|spread|multa mora|mora |juros mora/i, 'financeiro'],

  // Investimento (ativo fixo)
  [/imobilizado|equipamento|computador|veículo|veiculo|moto |carro |ativo fixo|reforma|benfeitor/i, 'investimento'],

  // CSP — custos diretos dos serviços
  [/prestador|terceiriz|exame|aso |clínica|laborat|médico|medico|esocial|cipa|nr |treinamento|capacita|consult[ao]r|honorário|técnico de segurança|engenheiro de segurança/i, 'csp'],

  // Administrativo
  [/aluguel|energia|água|internet|telefon|condomínio|limpeza|material de escritório|escritório|contador|contabilidade|juridico|jurídico|advogado|seguro|assinatura|software|sistema|manutenção|combustível|combust/i, 'administrativo'],

  // Comercial
  [/marketing|publicidade|propaganda|comissão|comissao|representa|prospect|cliente|brinde|evento/i, 'comercial'],

  // Receitas financeiras
  [/rendimento|aplicação|cdb|renda fixa|juros recebidos|receita financeira/i, 'receita_financeira'],
]

export function classificar(categoria: string | null): GrupoFinanceiro {
  if (!categoria) return 'outros'
  for (const [regex, grupo] of REGRAS) {
    if (regex.test(categoria)) return grupo
  }
  return 'outros'
}

export const GRUPOS_LABEL: Record<GrupoFinanceiro, string> = {
  receita_operacional: 'Receita Operacional',
  receita_financeira:  'Receita Financeira',
  receita_outros:      'Outras Receitas',
  csp:                 'Custo dos Serviços Prestados (CSP)',
  pessoal:             'Despesas com Pessoal',
  administrativo:      'Despesas Administrativas',
  comercial:           'Despesas Comerciais',
  impostos:            'Impostos e Tributos',
  financeiro:          'Resultado Financeiro',
  investimento:        'Investimentos (Capex)',
  transferencia:       'Transferência entre Contas',
  outros:              'Outros',
}

export const GRUPOS_OPERACIONAIS: GrupoFinanceiro[] = [
  'csp', 'pessoal', 'administrativo', 'comercial', 'impostos', 'outros',
]

export const GRUPOS_NAO_OPERACIONAIS: GrupoFinanceiro[] = [
  'financeiro', 'investimento',
]

// ─── Classificação pelo plano de contas do Conta Azul ────────────────────────
// O `classificar()` acima casa por texto e erra feio quando a categoria já vem
// numerada: "1.03.02 Engenharia + Medicina + E-Social" casa com /e-social/ e
// vira 'pessoal'; "1.05.02 Receitas Intermediadas (Moha)" casa com /imposto/.
// Como o DRE só somava algumas chaves de receita, R$ 1,77 mi de receita de 2026
// sumia da tela sem erro nenhum.
//
// O plano de contas já carrega a classificação no 1º dígito — é a fonte
// confiável, e a mesma que as RPCs usam. O texto fica só de reserva para
// categoria sem número.

export type LinhaDreCodigo =
  | 'receita' | 'deducoes' | 'custo' | 'administrativa' | 'financeira'
  | 'investimento' | 'emprestimo' | 'parcelamento'
  | 'transferencia' | 'sem_classificacao'

const POR_DIGITO: Record<string, LinhaDreCodigo> = {
  '1': 'receita',
  '2': 'deducoes',
  '3': 'custo',
  '4': 'administrativa',
  '5': 'financeira',
  '6': 'investimento',
  '7': 'emprestimo',
  '8': 'parcelamento',
  '9': 'transferencia',
}

/** Só as quatro primeiras compõem o resultado operacional. */
export const LINHAS_OPERACIONAIS: LinhaDreCodigo[] =
  ['receita', 'deducoes', 'custo', 'administrativa', 'financeira']

/** Saem do resultado (conta patrimonial), mas continuam no fluxo de caixa. */
export const LINHAS_NAO_OPERACIONAIS: LinhaDreCodigo[] =
  ['investimento', 'emprestimo', 'parcelamento']

export function classificarPorPlano(categoria: string | null | undefined): LinhaDreCodigo {
  const texto = String(categoria ?? '').trim()
  const digito = texto.match(/^(\d)/)?.[1]
  if (digito && POR_DIGITO[digito]) return POR_DIGITO[digito]

  // Sem número, mas não-operacional por nome — mesma lista de fn_nao_operacional
  // no banco. Sem isto, "Empréstimo Mútuo entre Contas" casaria com o regex de
  // 'financeiro' e entraria no resultado como despesa financeira, fazendo o DRE
  // discordar das RPCs em R$ 92.867 no ano.
  const semAcento = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
  if (semAcento.startsWith('EMPRESTIMO')) return 'emprestimo'
  if (semAcento === 'VENDA DE ATIVOS')    return 'investimento'
  if (semAcento === 'OI')                 return 'investimento'

  // Resto sem número: cai no classificador por texto e traduz o que der.
  switch (classificar(texto)) {
    case 'transferencia':      return 'transferencia'
    case 'impostos':           return 'deducoes'
    case 'csp':                return 'custo'
    case 'financeiro':         return 'financeira'
    case 'investimento':       return 'investimento'
    case 'pessoal':
    case 'administrativo':
    case 'comercial':          return 'administrativa'
    case 'receita_operacional':
    case 'receita_financeira':
    case 'receita_outros':     return 'receita'
    default:                   return 'sem_classificacao'
  }
}
