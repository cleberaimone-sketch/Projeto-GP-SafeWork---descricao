// Carga dos exames COM identificação do trabalhador (máscara 193540).
//
// A máscara é por empresa cliente, então isto é uma varredura: ~1.300 empresas
// com movimento nos últimos 13 meses. Roda daqui e não pela rota porque não
// cabe no limite de tempo do serverless.
//
//   npx tsx --env-file=.env.local scripts/carga-trabalhadores.ts [diasAtras] [limite]
//
// Retomável: empresas já importadas com sucesso ficam registradas em
// soc_importacoes (recurso 'trabalhadores') e são puladas na próxima execução.

import { createClient } from '@supabase/supabase-js'
import { lerPaginado } from '../lib/supabase/paginar'
import { registrarCargaSOC } from '../lib/soc/sync-log'
import { importarTrabalhadoresDaEmpresa } from '../lib/soc/importar'

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

  // Paginado: a tabela já passou de 1.200 registros. Truncada em 1.000, as
  // empresas do fim da lista não constariam como feitas e seriam reimportadas
  // a cada execução — centenas de chamadas a mais ao SOC, sem nenhum erro.
  const feitas = await lerPaginado<{ empresa_soc: string }>((de, ate) =>
    supabase.from('soc_importacoes_empresa')
      .select('empresa_soc').eq('status', 'ok')
      .order('empresa_soc').range(de, ate))
  const jaFeita = new Set(feitas.map(f => String(f.empresa_soc)))

  const pendentes = lista.filter(e => !jaFeita.has(e.empresa_soc))
  if (limite > 0) lista = pendentes.slice(0, limite)
  else lista = pendentes

  console.log(`${lista.length} empresa(s) a importar (de ${(empresas ?? []).length} com movimento em ${diasAtras} dias)\n`)

  const iniciadoEm = new Date().toISOString()
  let total = 0, erros = 0
  const falhas: string[] = []
  for (const [i, emp] of lista.entries()) {
    const r = await importarTrabalhadoresDaEmpresa(supabase, emp.empresa_soc, diasAtras)
    total += r.registros
    if (r.status === 'erro') { erros++; falhas.push(`${emp.empresa_soc}: ${r.detalhe}`) }

    // Marca a empresa como concluída — é o que permite retomar a varredura
    // sem refazer as 1.300 chamadas quando ela for interrompida.
    await supabase.from('soc_importacoes_empresa').upsert({
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
  // Registra em sync_log — sem isto a varredura rodava e não deixava rastro
  // nenhum de quando tinha rodado.
  await registrarCargaSOC(supabase, iniciadoEm, {
    tipo: 'trabalhadores', registros: total, erros,
    // Só as 20 primeiras: uma varredura ruim pode falhar em centenas de
    // empresas, e a mensagem é truncada de qualquer forma.
    detalhes: falhas.slice(0, 20),
    metadados: {
      empresas_processadas: lista.length,
      empresas_com_movimento: empresas.length,
      dias_atras: diasAtras,
      origem: 'script',
    },
  })

  console.log(`\ntotal: ${total} registros, ${erros} empresa(s) com erro`)
}

main()
