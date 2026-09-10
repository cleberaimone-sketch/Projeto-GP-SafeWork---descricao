// Reimportar a mesma empresa duas vezes seguidas não pode mudar o total.
//
// Vale contra o bug que duplicou 22.266 exames em soc_exames: lá o fonte_id era
// hash do texto, e bastou a decodificação mudar para o upsert virar insert.
//
// Comparar com o total ANTES da primeira importação não serve de critério — a
// carga anterior é de dias atrás e o SOC tem exames novos desde então, então
// crescer é o esperado. O que prova idempotência é a SEGUNDA passada, feita
// contra o mesmo retorno da primeira: aí qualquer diferença é chave instável.

import { createClient } from '@supabase/supabase-js'
import { importarTrabalhadoresDaEmpresa, importarFuncionariosDaEmpresa } from '../lib/soc/importar'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const EMPRESA = process.argv[2] ?? '1165680'

async function conta(tabela: string) {
  const { count, error } = await sb.from(tabela).select('id', { count: 'exact', head: true }).eq('empresa_soc', EMPRESA)
  if (error) throw new Error(`${tabela}: ${error.message}`)
  return count ?? 0
}

async function importar() {
  const t = await importarTrabalhadoresDaEmpresa(sb, EMPRESA, 365)
  const f = await importarFuncionariosDaEmpresa(sb, EMPRESA)
  if (t.status === 'erro') throw new Error(`trabalhador: ${t.detalhe}`)
  if (f.status === 'erro') throw new Error(`funcionarios: ${f.detalhe}`)
  return { t: t.registros, f: f.registros }
}

async function main() {
  console.log(`empresa ${EMPRESA}`)

  const r1 = await importar()
  const t1 = await conta('soc_exames_trabalhador')
  const f1 = await conta('soc_funcionarios')
  console.log(`  1ª passada: importou ${r1.t} exames e ${r1.f} funcionários → tabela com ${t1} e ${f1}`)

  const r2 = await importar()
  const t2 = await conta('soc_exames_trabalhador')
  const f2 = await conta('soc_funcionarios')
  console.log(`  2ª passada: importou ${r2.t} exames e ${r2.f} funcionários → tabela com ${t2} e ${f2}`)

  const ok = t1 === t2 && f1 === f2
  console.log(ok
    ? '\n✅ a segunda passada não mudou nada — chave estável'
    : `\n❌ chave instável: +${t2 - t1} exames, +${f2 - f1} funcionários na reimportação`)
  process.exit(ok ? 0 : 1)
}

main()
