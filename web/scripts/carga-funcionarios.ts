// Carga dos funcionários por empresa (máscara 192399).
//
// Completa o ASO vencido: o espelho de exames só mostra quem FEZ exame no
// último ano; o trabalhador ativo que não fez nenhum — o caso mais grave — só
// aparece cruzando com esta lista.
//
// A máscara é por empresa cliente, então isto é uma varredura: ~1.300 empresas
// com movimento nos últimos 13 meses. Roda daqui e não pela rota porque não
// cabe no limite de tempo do serverless.
//
//   npx tsx --env-file=.env.local scripts/carga-funcionarios.ts [diasAtras] [limite]
//
// Retomável: empresas já importadas com sucesso ficam registradas em
// soc_importacoes (recurso 'trabalhadores') e são puladas na próxima execução.

import { createClient } from '@supabase/supabase-js'
import { importarFuncionariosDaEmpresa } from '../lib/soc/importar'

async function main() {
  // 365 é o teto da máscara 193540 — 395 devolve "Período de datas maior que o
  // permitido". Serve: o critério de ASO vencido é justamente não ter consulta
  // nos últimos 365 dias, então quem não aparece na janela está vencido.
  const diasAtras = Number(process.argv[2] ?? 365)
  const limite = Number(process.argv[3] ?? 0)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Empresas com movimento na janela: só elas podem ter ASO a vencer.
  // Pagina de verdade: o PostgREST corta em 1000 linhas e são ~1.300 empresas.
  // Uma empresa não varrida vira "nenhum ASO vencido" para os funcionários
  // dela — é o pior desfecho possível neste indicador.
  type Emp = { empresa_soc: string; nome_empresa: string; exames: number }
  const todas: Emp[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.rpc('fn_soc_empresas_ativas', {
      p_dias: diasAtras, p_limite: 500, p_offset: offset,
    })
    // Lista vazia por erro é diferente de lista vazia de verdade.
    if (error) throw new Error(`fn_soc_empresas_ativas: ${error.message}`)
    const pagina = (data ?? []) as Emp[]
    todas.push(...pagina)
    if (pagina.length < 500) break
  }
  if (!todas.length) throw new Error('Nenhuma empresa com movimento na janela — verifique soc_exames.')
  const empresas = todas
  let lista = todas

  const { data: feitas } = await supabase.from('soc_importacoes_funcionarios')
    .select('empresa_soc').eq('status', 'ok')
  const jaFeita = new Set((feitas ?? []).map(f => String(f.empresa_soc)))

  const pendentes = lista.filter(e => !jaFeita.has(e.empresa_soc))
  if (limite > 0) lista = pendentes.slice(0, limite)
  else lista = pendentes

  console.log(`${lista.length} empresa(s) a importar (de ${(empresas ?? []).length} com movimento em ${diasAtras} dias)\n`)

  let total = 0, erros = 0
  for (const [i, emp] of lista.entries()) {
    const r = await importarFuncionariosDaEmpresa(supabase, emp.empresa_soc)
    total += r.registros
    if (r.status === 'erro') erros++

    // Marca a empresa como concluída — é o que permite retomar a varredura
    // sem refazer as 1.300 chamadas quando ela for interrompida.
    await supabase.from('soc_importacoes_funcionarios').upsert({
      empresa_soc: emp.empresa_soc,
      registros: r.registros, status: r.status, detalhe: r.detalhe ?? null,
      finalizado_em: new Date().toISOString(),
    }, { onConflict: 'empresa_soc' })

    if (i % 25 === 0 || r.status === 'erro') {
      console.log(`  [${String(i + 1).padStart(4)}/${lista.length}] ${emp.empresa_soc.padEnd(9)} ` +
        (r.status === 'ok' ? `${String(r.registros).padStart(5)} reg · acum ${total}` : `ERRO: ${r.detalhe}`))
    }
    await new Promise(res => setTimeout(res, 700))
  }
  console.log(`\ntotal: ${total} registros, ${erros} empresa(s) com erro`)
}

main()
