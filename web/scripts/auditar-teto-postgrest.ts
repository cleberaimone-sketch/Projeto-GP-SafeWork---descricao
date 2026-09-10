// Quais RPCs chegam perto do teto de 1.000 linhas do PostgREST.
//
// O corte é silencioso — status 200, array truncado — e já custou caro três
// vezes: 294 empresas fora da carga do SOC, R$ 4,7M de receita a menos no
// Demonstrativo de 2025, e um painel de medicina exibindo 261 pendências de
// ASO quando havia 5.223. Este script existe para a quarta vez ser encontrada
// aqui, não em produção.
//
// Rodar depois de criar RPC nova ou quando a base crescer:
//   npx tsx --env-file=.env.local scripts/auditar-teto-postgrest.ts

import { createClient } from '@supabase/supabase-js'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const TETO = 1000
const ALERTA = 800

const anoAtual = new Date().getFullYear()

// Parâmetros que puxam o maior volume plausível de cada função.
const ALVOS: { nome: string; params: Record<string, unknown>; tratada?: string }[] = [
  { nome: 'fn_aso_vencido',               params: {},
    tratada: 'a tela usa fn_aso_resumo, que agrega no banco' },
  { nome: 'fn_dre_categoria_mensal',      params: { p_ano: anoAtual - 1, p_empresa_id: null },
    tratada: 'os dois chamadores usam lerRpcPaginado' },
  { nome: 'fn_dre_unidade_mensal',        params: { p_ano: anoAtual - 1 } },
  { nome: 'fn_soc_exames_mensal',         params: {} },
  { nome: 'fn_soc_consultas_por_unidade', params: { p_ano: anoAtual } },
  { nome: 'fn_soc_exames_por_tipo',       params: { p_ano: anoAtual, p_limite: 12 } },
  { nome: 'fn_financeiro_mensal',         params: { p_de: `${anoAtual - 1}-01-01`, p_ate: `${anoAtual}-12-31`, p_empresa_id: null, p_tipo: null } },
  { nome: 'fn_financeiro_categorias',     params: { p_de: `${anoAtual - 1}-01-01`, p_ate: `${anoAtual}-12-31`, p_empresa_id: null, p_tipo: null } },
  { nome: 'fn_financeiro_por_empresa',    params: { p_de: `${anoAtual - 1}-01-01`, p_ate: `${anoAtual}-12-31` } },
  { nome: 'fn_divida_titulos',            params: { p_categoria: null, p_ano: null, p_empresa_id: null } },
  { nome: 'fn_divida_por_categoria',      params: { p_ano: anoAtual, p_empresa_id: null } },
  { nome: 'fn_saude_unidades',            params: {} },
  { nome: 'fn_orcamento_ano',             params: { p_ano: anoAtual } },
  { nome: 'fn_lancamentos_extraordinarios', params: { p_ano: anoAtual - 1, p_empresa_id: null, p_ate_mes: 12 } },
  { nome: 'fn_despesa_recorrente_irregular', params: { p_ano: anoAtual } },
  { nome: 'fn_curva_saldo',               params: {} },
]

async function main() {
  let problemas = 0
  for (const { nome, params, tratada } of ALVOS) {
    const { data, error } = await db.rpc(nome, params)
    if (error) {
      // Assinatura mudou ou função sumiu — vale saber, mas não é o que se audita aqui.
      console.log(`  ?  ${nome.padEnd(34)} não respondeu: ${error.message.slice(0, 60)}`)
      continue
    }
    const n = Array.isArray(data) ? data.length : 1
    if (n >= TETO && tratada) {
      console.log(`  ✔  ${nome.padEnd(34)} ${n} linhas — passa do teto, mas ${tratada}`)
    } else if (n >= TETO) {
      console.log(`  ❌ ${nome.padEnd(34)} ${n} linhas — TRUNCADA, precisa de lerRpcPaginado ou agregação`)
      problemas++
    } else if (n >= ALERTA) {
      console.log(`  ⚠️  ${nome.padEnd(34)} ${n} linhas — perto do teto, vai truncar quando a base crescer`)
      problemas++
    } else {
      console.log(`  ✅ ${nome.padEnd(34)} ${n} linha(s)`)
    }
  }
  console.log(problemas === 0
    ? '\nNenhuma RPC perto do teto.'
    : `\n${problemas} RPC(s) exigem atenção.`)
  process.exit(problemas === 0 ? 0 : 1)
}
main()
