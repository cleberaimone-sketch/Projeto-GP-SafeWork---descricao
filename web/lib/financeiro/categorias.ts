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
