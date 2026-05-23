// ============================================================
// RH — Custo de pessoal puxado do Conta Azul (lancamentos_financeiros)
//
// Os pagamentos de folha/PJ/estágio/pró-labore são lançados no Conta Azul
// num plano de contas por departamento + tipo de contrato. Aqui classificamos
// cada categoria em INTERNO (folha real) vs EXTERNO (prestadores da operação:
// clínicas parceiras, repasse Moha, instrutores) e agregamos por mês.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'

export type TipoPessoal = 'CLT' | 'PJ' | 'Estágio' | 'Pró-labore' | 'Comissões' | 'Encargos'
export type GrupoCusto = 'interno' | 'externo'

export interface ClassPessoal {
  grupo: GrupoCusto
  tipo: TipoPessoal
  depto: string             // Administrativo | Comercial | Engenharia | Medicina | Outros
  rotuloExterno?: string    // p/ externos: "Clínicas Parceiras" | "Repasse Moha" | "Instrutores"
}

function detectarDepto(c: string): string {
  if (/administrativ/.test(c)) return 'Administrativo'
  if (/comercial/.test(c)) return 'Comercial'
  if (/engenharia/.test(c)) return 'Engenharia'
  if (/medicina|médic|medic|fonoaud|psicó|psico/.test(c)) return 'Medicina'
  return 'Outros'
}

// Classifica uma categoria do plano de contas. Retorna null se não for pessoal.
export function classificarPessoal(categoria: string | null | undefined): ClassPessoal | null {
  if (!categoria) return null
  const c = categoria.toLowerCase()

  // Honorários de SERVIÇOS profissionais (não são pessoal): contábil, jurídico, consultoria
  if (/honorários contábeis|honorarios contabeis|honorários advocatícios|honorarios advocaticios|honorários consultoria|honorarios consultoria/.test(c)) return null

  // ── Externos (prestadores de fora / custo de operação) ──
  if (/clínicas parceiras|clinicas parceiras/.test(c)) return { grupo: 'externo', tipo: 'PJ', depto: 'Medicina', rotuloExterno: 'Clínicas Parceiras' }
  if (/repassados moha|repasse moha/.test(c)) return { grupo: 'externo', tipo: 'PJ', depto: 'Outros', rotuloExterno: 'Repasse Moha' }
  if (/instrutores/.test(c)) return { grupo: 'externo', tipo: 'PJ', depto: 'Outros', rotuloExterno: 'Instrutores' }

  // ── Internos ──
  if (/mão de obra direta.*clt|mao de obra direta.*clt/.test(c)) return { grupo: 'interno', tipo: 'CLT', depto: detectarDepto(c) }
  if (/mão de obra direta.*estági|mao de obra direta.*estagi/.test(c)) return { grupo: 'interno', tipo: 'Estágio', depto: detectarDepto(c) }
  if (/pró-labore|pro-labore|pró labore/.test(c)) return { grupo: 'interno', tipo: 'Pró-labore', depto: 'Administrativo' }
  if (/comissões de vendedores|comissoes de vendedores/.test(c)) return { grupo: 'interno', tipo: 'Comissões', depto: 'Comercial' }
  // Encargos sobre folha
  if (/fgts|provisões com férias|provisoes com ferias|provisões com 13|provisoes com 13|rescisão|rescisao|irrf s\/ sal|dctfweb|inss/.test(c)) return { grupo: 'interno', tipo: 'Encargos', depto: detectarDepto(c) }
  // Honorários MEI/PJ internos + médicos/fono/psico das clínicas
  if (/honorários profissionais mei\/pj|honorarios profissionais mei\/pj|honorários médicos|honorarios medicos|fonoaudióloga\/psicóloga|fonoaudiologa\/psicologa/.test(c)) return { grupo: 'interno', tipo: 'PJ', depto: detectarDepto(c) }

  return null
}

interface Linha { categoria: string | null; valor: number | null; data_vencimento: string | null }

export interface CustoPessoalResult {
  meses: string[]                                          // ['Jan', 'Fev', ...]
  internoMensal: number[]
  externoMensal: number[]
  internoPorTipo: { tipo: string; valores: number[] }[]
  internoPorDepto: { depto: string; valores: number[] }[]
  externoPorRotulo: { rotulo: string; valor: number }[]    // total acumulado por prestador
  totalInternoAno: number
  totalExternoAno: number
}

const ROTULO_MES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export async function carregarCustoPessoal(
  sb: SupabaseClient,
  ano: number
): Promise<CustoPessoalResult> {
  // Pagina todas as despesas do ano (REST limita a 1000 por página)
  const linhas: Linha[] = []
  let from = 0
  for (let pagina = 0; pagina < 30; pagina++) {
    const { data, error } = await sb
      .from('lancamentos_financeiros')
      .select('categoria, valor, data_vencimento')
      .eq('tipo', 'despesa')
      .neq('status', 'cancelado')
      .gte('data_vencimento', `${ano}-01-01`)
      .lt('data_vencimento', `${ano + 1}-01-01`)
      .order('data_vencimento', { ascending: true })
      .range(from, from + 999)
    if (error || !data || data.length === 0) break
    linhas.push(...data)
    if (data.length < 1000) break
    from += 1000
  }

  const internoMes = new Array(12).fill(0)
  const externoMes = new Array(12).fill(0)
  const porTipo: Record<string, number[]> = {}
  const porDepto: Record<string, number[]> = {}
  const externoRot: Record<string, number> = {}
  let ultimoMesComDados = -1

  for (const l of linhas) {
    const cl = classificarPessoal(l.categoria)
    if (!cl) continue
    const mi = parseInt((l.data_vencimento ?? '').slice(5, 7), 10) - 1
    if (isNaN(mi) || mi < 0 || mi > 11) continue
    const v = Number(l.valor ?? 0)
    if (mi > ultimoMesComDados) ultimoMesComDados = mi
    if (cl.grupo === 'externo') {
      externoMes[mi] += v
      externoRot[cl.rotuloExterno ?? 'Outros'] = (externoRot[cl.rotuloExterno ?? 'Outros'] ?? 0) + v
    } else {
      internoMes[mi] += v
      if (!porTipo[cl.tipo]) porTipo[cl.tipo] = new Array(12).fill(0)
      porTipo[cl.tipo][mi] += v
      if (!porDepto[cl.depto]) porDepto[cl.depto] = new Array(12).fill(0)
      porDepto[cl.depto][mi] += v
    }
  }

  const nMeses = Math.max(ultimoMesComDados + 1, 1)
  const corta = (arr: number[]) => arr.slice(0, nMeses).map(v => Math.round(v))

  const ordemTipo = ['CLT', 'PJ', 'Estágio', 'Pró-labore', 'Comissões', 'Encargos']

  return {
    meses: ROTULO_MES.slice(0, nMeses),
    internoMensal: corta(internoMes),
    externoMensal: corta(externoMes),
    internoPorTipo: ordemTipo
      .filter(t => porTipo[t])
      .map(t => ({ tipo: t, valores: corta(porTipo[t]) })),
    internoPorDepto: Object.entries(porDepto)
      .sort((a, b) => b[1].reduce((s, v) => s + v, 0) - a[1].reduce((s, v) => s + v, 0))
      .map(([depto, vals]) => ({ depto, valores: corta(vals) })),
    externoPorRotulo: Object.entries(externoRot)
      .sort((a, b) => b[1] - a[1])
      .map(([rotulo, valor]) => ({ rotulo, valor: Math.round(valor) })),
    totalInternoAno: Math.round(internoMes.reduce((s, v) => s + v, 0)),
    totalExternoAno: Math.round(externoMes.reduce((s, v) => s + v, 0)),
  }
}
