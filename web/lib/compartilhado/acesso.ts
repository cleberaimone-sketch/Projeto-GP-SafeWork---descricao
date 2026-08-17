import { createClient } from '@supabase/supabase-js'

/**
 * Camada de acesso das páginas compartilhadas por link (/safet/<token>).
 *
 * Estas páginas ficam FORA do proxy.ts (que só cobre /dashboard/*), então não
 * há sessão nem cookie: quem autoriza é o token da URL, validado aqui contra a
 * tabela acessos_compartilhados. Todo acesso ao banco usa service_role, porque
 * o RLS fecha anon e authenticated.
 */

export interface AcessoValido {
  empresaId: string
  descricao: string | null
}

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

/**
 * Valida o token e devolve a empresa liberada, ou null.
 *
 * Registra o acesso (contador + timestamp) para dar rastro de uso — sem isso um
 * link vazado seria indetectável. O registro é best-effort: se falhar, o acesso
 * segue, porque derrubar a página do sócio por causa de telemetria seria pior.
 */
export async function validarToken(token: string): Promise<AcessoValido | null> {
  if (!token || token.length < 32) return null

  const sb = db()
  const { data, error } = await sb
    .from('acessos_compartilhados')
    .select('id, empresa_id, descricao, ativo, expira_em, total_acessos')
    .eq('token', token)
    .maybeSingle()

  if (error || !data || !data.ativo) return null
  if (data.expira_em && new Date(data.expira_em) < new Date()) return null

  try {
    await sb
      .from('acessos_compartilhados')
      .update({
        ultimo_acesso_em: new Date().toISOString(),
        total_acessos: (data.total_acessos ?? 0) + 1,
      })
      .eq('id', data.id)
  } catch {
    // telemetria é best-effort: não derruba a página do sócio
  }

  return { empresaId: data.empresa_id, descricao: data.descricao }
}

export interface PontoMensal {
  mes: string
  receita: number
  despesa: number
  resultado: number
}

export interface CategoriaValor {
  categoria: string
  total: number
}

export interface BalancoAno {
  ano: string
  receita: number
  despesa: number
  lucro: number
  margem: number
  parcial: boolean
}

/**
 * Produção vinda do relatório do comercial.
 *
 * turmasTotal é dado real: cada item da coluna Produtos do contrato é uma turma,
 * e uma venda pode conter várias ("NR23 | NR07 | NR35" é uma venda, três turmas).
 *
 * participantesConfirmados soma apenas as turmas em que o contrato informou a
 * lotação (turmasComLotacao). No restante — turma fechada — a lotação real não
 * é registrada em lugar nenhum, e a página diz isso em vez de estimar.
 */
export interface Producao {
  totalVendas: number
  totalValor: number
  clientesDistintos: number
  clientesNovos: number
  cortesias: number
  periodoDe: string | null
  periodoAte: string | null
  turmasTotal: number
  turmasComLotacao: number
  participantesConfirmados: number
  porMes: Array<{ mes: string; turmas: number; participantes: number; valor: number }>
  topNormas: Array<{ norma: string; turmas: number; participantes: number }>
  unidades: Array<{ unidade: string; qtd: number; valor: number }>
  modalidades: Array<{ modalidade: string; qtd: number }>
  topClientes: Array<{ cliente: string; qtd: number; valor: number }>
}

export interface DadosEmpresa {
  nome: string
  cnpj: string | null
  cidade: string | null
  estado: string | null
  serie: PontoMensal[]
  porAno: BalancoAno[]
  receitas: CategoriaValor[]
  despesas: CategoriaValor[]
  producao: Producao | null
  atualizadoEm: string | null
}

/** Rótulo legível a partir da categoria do Conta Azul ("1.04.01 Treinamentos"). */
function rotuloCategoria(c: string): string {
  return c.replace(/^\d+(\.\d+)*\s*/, '').trim() || c
}

export async function carregarDadosEmpresa(
  empresaId: string,
  de: string,
  ate: string,
): Promise<DadosEmpresa | null> {
  const sb = db()

  const [empresaRes, mensalRes, recRes, despRes, syncRes, prodRes] = await Promise.all([
    sb.from('empresas').select('nome, cnpj, cidade, estado').eq('id', empresaId).maybeSingle(),
    sb.rpc('fn_financeiro_mensal', { p_de: de, p_ate: ate, p_empresa_id: empresaId, p_tipo: null }),
    sb.rpc('fn_financeiro_categorias', { p_de: de, p_ate: ate, p_empresa_id: empresaId, p_tipo: 'receita' }),
    sb.rpc('fn_financeiro_categorias', { p_de: de, p_ate: ate, p_empresa_id: empresaId, p_tipo: 'despesa' }),
    sb.from('sync_log')
      .select('iniciado_em')
      .eq('empresa_id', empresaId)
      .eq('status', 'sucesso')
      .order('iniciado_em', { ascending: false })
      .limit(1)
      .maybeSingle(),
    sb.rpc('fn_producao_treinamento', { p_empresa_id: empresaId, p_de: de, p_ate: ate }),
  ])

  if (!empresaRes.data) return null

  // fn_financeiro_mensal devolve linhas por vencimento (pago/vencido/pendente) e
  // também a visão de caixa ('caixa_pago'). Somar tudo contaria o mesmo dinheiro
  // duas vezes — o demonstrativo é por competência, então caixa_pago fica fora.
  const porMes = new Map<string, PontoMensal>()
  for (const l of (mensalRes.data ?? []) as Array<{
    mes: string; tipo: string; status_grupo: string; total: string
  }>) {
    if (l.status_grupo === 'caixa_pago') continue
    const p = porMes.get(l.mes) ?? { mes: l.mes, receita: 0, despesa: 0, resultado: 0 }
    const v = Number(l.total) || 0
    if (l.tipo === 'receita') p.receita += v
    else if (l.tipo === 'despesa') p.despesa += v
    porMes.set(l.mes, p)
  }
  const serie = [...porMes.values()]
    .map(p => ({ ...p, resultado: p.receita - p.despesa }))
    .sort((a, b) => a.mes.localeCompare(b.mes))

  const mapCat = (rows: unknown): CategoriaValor[] =>
    ((rows ?? []) as Array<{ categoria: string; total: string }>)
      .map(r => ({ categoria: rotuloCategoria(r.categoria), total: Number(r.total) || 0 }))
      .filter(r => r.total > 0)
      .sort((a, b) => b.total - a.total)

  // Balanço anual, derivado da mesma série mensal para não haver divergência
  // entre o gráfico e a tabela. O ano corrente é marcado como parcial — sem
  // isso, comparar 8 meses de 2026 com os 12 de 2025 induz a erro de leitura.
  const anoCorrente = String(new Date().getUTCFullYear())
  const porAnoMap = new Map<string, { receita: number; despesa: number }>()
  for (const p of serie) {
    const ano = p.mes.slice(0, 4)
    const a = porAnoMap.get(ano) ?? { receita: 0, despesa: 0 }
    a.receita += p.receita
    a.despesa += p.despesa
    porAnoMap.set(ano, a)
  }
  const porAno: BalancoAno[] = [...porAnoMap.entries()]
    .map(([ano, a]) => ({
      ano,
      receita: a.receita,
      despesa: a.despesa,
      lucro: a.receita - a.despesa,
      margem: a.receita > 0 ? ((a.receita - a.despesa) / a.receita) * 100 : 0,
      parcial: ano === anoCorrente,
    }))
    .sort((x, y) => x.ano.localeCompare(y.ano))

  return {
    nome: empresaRes.data.nome,
    cnpj: empresaRes.data.cnpj,
    cidade: empresaRes.data.cidade,
    estado: empresaRes.data.estado,
    serie,
    porAno,
    receitas: mapCat(recRes.data),
    despesas: mapCat(despRes.data),
    // A produção só existe se o relatório do comercial já foi importado; a
    // página trata null escondendo a seção em vez de mostrar zeros.
    producao: (prodRes.data as Producao | null) ?? null,
    atualizadoEm: syncRes.data?.iniciado_em ?? null,
  }
}
