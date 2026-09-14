// Carga do histórico do SOC para o espelho local, direto pela linha de comando.
//
// A rota /api/soc/importar faz o mesmo, mas presa ao limite de tempo do
// serverless. Para a carga inicial — 21 janelas por recurso — rodar daqui é
// mais simples: sem limite de duração e com progresso visível janela a janela.
//
//   npx tsx --env-file=.env.local scripts/carga-soc.ts exames
//   npx tsx --env-file=.env.local scripts/carga-soc.ts licencas 2025-01-01 2026-09-08
//
// É retomável pelo mesmo mecanismo da rota: janela concluída fica registrada em
// soc_importacoes, e a chave natural impede que reimportar duplique.

import { createClient } from '@supabase/supabase-js'
import { importarJanela, janelas } from '../lib/soc/importar'
import { registrarCargaSOC } from '../lib/soc/sync-log'

async function main() {
  const recurso = (process.argv[2] ?? 'exames') as 'exames' | 'licencas'
  const de = new Date(`${process.argv[3] ?? '2025-01-01'}T12:00:00`)
  const ate = new Date(`${process.argv[4] ?? new Date().toISOString().slice(0, 10)}T12:00:00`)

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Faltam credenciais. Rode com: npx tsx --env-file=.env.local scripts/carga-soc.ts')
    process.exit(1)
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const js = janelas(de, ate)
  console.log(`${recurso}: ${js.length} janela(s), ${de.toISOString().slice(0, 10)} → ${ate.toISOString().slice(0, 10)}\n`)

  const iniciadoEm = new Date().toISOString()
  let total = 0, erros = 0
  const falhas: string[] = []
  for (const [i, j] of js.entries()) {
    const r = await importarJanela(supabase, recurso, j.de, j.ate)
    total += r.registros
    if (r.status === 'erro') { erros++; falhas.push(`${r.de}→${r.ate}: ${r.detalhe}`) }
    console.log(`  [${String(i + 1).padStart(2)}/${js.length}] ${r.de} → ${r.ate}  ` +
      (r.status === 'ok' ? `${String(r.registros).padStart(5)} registros` : `ERRO: ${r.detalhe}`))
    // O SOC limita requisições simultâneas; a carga é sequencial e com pausa.
    await new Promise(res => setTimeout(res, 1500))
  }

  // Registra igual à rota: carga rodada da linha de comando conta tanto quanto
  // a do cron, e antes nenhuma das duas aparecia em sync_log.
  await registrarCargaSOC(supabase, iniciadoEm, {
    tipo: recurso, registros: total, erros, detalhes: falhas,
    metadados: {
      periodo: `${de.toISOString().slice(0, 10)} → ${ate.toISOString().slice(0, 10)}`,
      janelas: js.length,
      origem: 'script',
    },
  })

  console.log(`\ntotal: ${total} registros, ${erros} janela(s) com erro`)
}

main()
