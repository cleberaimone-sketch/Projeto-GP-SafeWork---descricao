// Confere fn_lui_war_room contra as regras em TypeScript que ela substituiu.
//
//   npx tsx --env-file=.env.local scripts/conferir-war-room.ts
//
// A página do LUI calculava esses números em JS a partir dos lançamentos. Passei
// o cálculo para o banco; este script refaz o caminho antigo — agora lendo a
// base INTEIRA, paginada — e compara. Serve para duas coisas: provar que a
// migração não mudou número, e acusar se as duas implementações divergirem
// depois, quando alguém mexer numa e esquecer a outra.
//
// Há UMA divergência conhecida e proposital, declarada em DIVERGENCIAS_ACEITAS
// logo abaixo — foi o próprio script que a encontrou.
import { createClient } from '@supabase/supabase-js'
import { lerPaginado } from '../lib/supabase/paginar'
import { carregarCategoriasExcluidas, filtrarParaDRE, isTransferenciaInterna } from '../lib/financeiro/regras'

type L = {
  tipo: string; status: string | null; valor: number | null
  categoria: string | null; data_vencimento: string | null; empresa_id: string | null
}

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const hoje = new Date()
  const hojeISO = hoje.toISOString().slice(0, 10)
  const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
  const ant = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
  const mesAnt = `${ant.getFullYear()}-${String(ant.getMonth() + 1).padStart(2, '0')}`

  const excluidas = await carregarCategoriasExcluidas(sb)
  const todos = await lerPaginado<L>((de, ate) => sb.from('lancamentos_financeiros')
    .select('tipo, status, valor, categoria, data_vencimento, empresa_id')
    .neq('status', 'cancelado')
    .order('id').range(de, ate))
  console.log(`base lida: ${todos.length.toLocaleString('pt-BR')} lançamentos não cancelados`)

  const dre = filtrarParaDRE(todos, excluidas)
  const soma = (mes: string, tipo: string) => dre
    .filter(l => l.data_vencimento?.slice(0, 7) === mes && l.tipo === tipo)
    .reduce((s, l) => s + (l.valor ?? 0), 0)

  const atrasados = todos.filter(l =>
    !isTransferenciaInterna(l.categoria, excluidas) &&
    l.status !== 'pago' && l.status !== 'parcial' &&
    !!l.data_vencimento && l.data_vencimento < hojeISO)

  const RE = /empr[eé]stimo|emprestimo|parcelamento|parcela/i
  const emp = todos.filter(l => l.categoria && RE.test(l.categoria) &&
    l.status !== 'pago' && l.status !== 'parcial')

  const js = {
    rec_atual:  soma(mesAtual, 'receita'),
    desp_atual: soma(mesAtual, 'despesa'),
    rec_ant:    soma(mesAnt, 'receita'),
    desp_ant:   soma(mesAnt, 'despesa'),
    atrasados_valor: atrasados.reduce((s, l) => s + (l.valor ?? 0), 0),
    atrasados_qtd:   atrasados.length,
    emp_pagar:   emp.filter(l => l.tipo === 'despesa').reduce((s, l) => s + (l.valor ?? 0), 0),
    emp_receber: emp.filter(l => l.tipo === 'receita').reduce((s, l) => s + (l.valor ?? 0), 0),
  }

  const { data, error } = await sb.rpc('fn_lui_war_room', { p_mes_atual: mesAtual, p_mes_anterior: mesAnt })
  if (error) throw new Error(error.message)
  const w = data as {
    mes_atual: { receita: number; despesa: number }
    mes_anterior: { receita: number; despesa: number }
    atrasados: { valor: number; qtd: number }
    emprestimos: { a_pagar: number; a_receber: number }
  }
  const sql = {
    rec_atual: +w.mes_atual.receita, desp_atual: +w.mes_atual.despesa,
    rec_ant: +w.mes_anterior.receita, desp_ant: +w.mes_anterior.despesa,
    atrasados_valor: +w.atrasados.valor, atrasados_qtd: +w.atrasados.qtd,
    emp_pagar: +w.emprestimos.a_pagar, emp_receber: +w.emprestimos.a_receber,
  }

  // Um centavo de folga: o JS soma float, o Postgres soma numeric.
  const TOLERANCIA = 0.02

  // Divergência que a RPC introduziu DE PROPÓSITO, porque o cálculo antigo
  // estava errado. O filtro de empréstimos em JS rodava sobre todos os
  // lançamentos, sem tirar as transferências internas — e "Empréstimo Mutuo
  // entre Contas" está em categorias_excluidas justamente por ser dinheiro
  // andando entre contas do próprio grupo. O war room contava R$ 640 de
  // dívida que o grupo não deve a ninguém. A regra do projeto é filtrar
  // transferência interna ANTES de qualquer cálculo; a RPC filtra.
  const DIVERGENCIAS_ACEITAS: Partial<Record<keyof typeof js, { valor: number; motivo: string }>> = {
    emp_pagar: {
      valor: -640,
      motivo: 'JS contava "Empréstimo Mutuo entre Contas", que é transferência interna',
    },
  }

  let divergiu = 0
  console.log('\ncampo                  TypeScript          SQL        diferença')
  for (const k of Object.keys(js) as (keyof typeof js)[]) {
    const d = sql[k] - js[k]
    const aceita = DIVERGENCIAS_ACEITAS[k]
    const ok = aceita
      ? Math.abs(d - aceita.valor) <= TOLERANCIA
      : Math.abs(d) <= TOLERANCIA
    if (!ok) divergiu++
    const marca = !ok ? '  ❌' : aceita ? '  ⚠️' : '  ✅'
    console.log(`${marca} ${k.padEnd(18)} ${js[k].toFixed(2).padStart(14)} ${sql[k].toFixed(2).padStart(14)} ${d.toFixed(2).padStart(12)}`)
    if (ok && aceita) console.log(`       divergência esperada: ${aceita.motivo}`)
  }
  console.log(divergiu === 0
    ? '\n✅ a RPC reproduz o cálculo que substituiu, com as correções declaradas.'
    : `\n❌ ${divergiu} campo(s) divergem sem explicação — a migração mudou número.`)
  process.exit(divergiu === 0 ? 0 : 1)
}
main()
