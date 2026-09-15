// Confere as duas premissas que sustentam a leitura da carteira do SOC.
//
//   npx tsx --env-file=.env.local scripts/conferir-carteira-soc.ts
//
// 1. A rede SOCNET continua identificável pelo sufixo "(SOCNET)" no nome.
//    Se o SOC mudar o padrão, as clínicas parceiras voltam a ser contadas como
//    clientes e o total de vidas salta para a casa das centenas de milhares —
//    foi o que aconteceu até 14/09/2026, com 470.262 no lugar de 22.682.
//
// 2. O CODIGO devolvido pela máscara de empresas casa com empresa_soc do
//    espelho de exames. É esse cruzamento que diz se um cliente está parado; se
//    as chaves divergirem, toda empresa parece sem exame e a Nina volta a
//    marcar a carteira inteira como churn.
import { createClient } from '@supabase/supabase-js'
import { getEmpresasClientes } from '../lib/soc/client'
import { separarCarteira, ehRedeSocnet } from '../lib/soc/carteira'
import { lerRpcPaginado } from '../lib/supabase/paginar'

const n = (v: number) => v.toLocaleString('pt-BR')

async function main() {
  const empresas = await getEmpresasClientes()
  const c = separarCarteira(empresas)
  let falhou = 0

  console.log('── Carteira ────────────────────────────────────────────')
  console.log(`  clientes        ${String(c.clientes.length).padStart(6)} empresas · ${n(c.vidas).padStart(9)} vidas`)
  console.log(`  rede SOCNET     ${String(c.redeSocnet.length).padStart(6)} empresas · ${n(c.vidasRedeSocnet).padStart(9)} vidas`)

  // Um nome que mencione SOCNET fora do sufixo é sinal de que o padrão mudou.
  const foraDoPadrao = empresas.filter(e => !ehRedeSocnet(e.NOME) && /socnet/i.test(e.NOME ?? ''))
  if (foraDoPadrao.length > 0) {
    falhou++
    console.log(`\n  ❌ ${foraDoPadrao.length} empresa(s) citam SOCNET sem o sufixo — o marcador mudou:`)
    for (const e of foraDoPadrao.slice(0, 5)) console.log(`       ${e.NOME}`)
  } else {
    console.log('  ✅ marcador "(SOCNET)" continua consistente')
  }

  // A carteira própria de uma holding regional de SST não tem centenas de
  // milhares de vidas. Se passar disso, alguma coisa entrou que não devia.
  const TETO_PLAUSIVEL = 100_000
  if (c.vidas > TETO_PLAUSIVEL) {
    falhou++
    console.log(`  ❌ ${n(c.vidas)} vidas na carteira — acima do plausível (${n(TETO_PLAUSIVEL)}).`)
  }

  console.log('\n── Cruzamento com o espelho ────────────────────────────')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const exames = await lerRpcPaginado<{ empresa_soc: string }>(db, 'fn_soc_exames_por_empresa', { p_dias: 90 })
  const chaves = new Set(exames.map(e => String(e.empresa_soc)))
  const reconhecidas = [...chaves].filter(k => c.clientes.some(e => String(e.CODIGO) === k)).length
  const pct = chaves.size > 0 ? (reconhecidas / chaves.size) * 100 : 0
  console.log(`  empresas com exame em 90d : ${chaves.size}`)
  console.log(`  reconhecidas na carteira  : ${reconhecidas} (${pct.toFixed(0)}%)`)
  if (pct < 80) {
    falhou++
    console.log('  ❌ cruzamento por CODIGO degradou — a Nina perde a leitura de atividade.')
  } else {
    console.log('  ✅ as chaves casam')
  }

  console.log(falhou === 0 ? '\n✅ premissas de pé.' : `\n❌ ${falhou} premissa(s) quebrada(s).`)
  process.exit(falhou === 0 ? 0 : 1)
}
main()
