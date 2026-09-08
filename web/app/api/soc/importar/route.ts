// Carga do histórico do SOC para o espelho local.
//
// A máscara de exames aceita 30 dias por chamada, então "puxar de 2025 para cá"
// é varrer ~21 janelas por recurso, com pausa entre elas. Não cabe numa
// execução só de serverless, e por isso a rota é RETOMÁVEL: cada janela é
// registrada em soc_importacoes e as já concluídas são puladas na chamada
// seguinte. Chamar de novo continua de onde parou.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { socConfigurado } from '@/lib/soc/client'
import { importarJanela, janelas, type ResultadoJanela } from '@/lib/soc/importar'

export const maxDuration = 300

/** Início do histórico pedido pelo Cleber: 2025 para cá. */
const INICIO_PADRAO = '2025-01-01'

// Folga antes do limite da função. Sem isto a Vercel mata a execução no meio de
// uma janela e ela fica sem registro de conclusão — retomável, mas desperdiça
// a chamada inteira ao SOC que já tinha sido feita.
const ORCAMENTO_MS = 240_000

// O SOC limita requisições simultâneas; a carga é sequencial e com pausa.
const PAUSA_ENTRE_JANELAS_MS = 1500

function autenticado(req: NextRequest): boolean {
  return (
    req.headers.get('x-vercel-cron') === '1' ||
    req.headers.get('x-cron-secret') === process.env.CRON_SECRET ||
    req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
  )
}

/**
 * Quantos dias para trás o sync diário refaz.
 *
 * Não basta importar "de ontem para cá": o SOC recebe resultado de exame dias
 * depois da ficha, e esses registros caem em janelas que já foram marcadas
 * como concluídas. Sem refazer a cauda, eles nunca entrariam — a carga
 * pularia a janela por já estar "ok" e o dado ficaria fora para sempre.
 */
const DIAS_INCREMENTAL = 45

type Opcoes = {
  de: Date
  ate: Date
  recursos: ('exames' | 'licencas')[]
  refazer: boolean
}

async function executar({ de, ate, recursos, refazer }: Opcoes) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: feitas } = await supabase
    .from('soc_importacoes')
    .select('recurso, data_inicio, data_fim')
    .eq('status', 'ok')
  const jaFeita = new Set((feitas ?? []).map(f => `${f.recurso}|${f.data_inicio}|${f.data_fim}`))

  const inicio = Date.now()
  const resultados: ResultadoJanela[] = []
  let pendentes = 0

  for (const recurso of recursos) {
    for (const j of janelas(de, ate)) {
      const chave = `${recurso}|${j.de.toISOString().slice(0, 10)}|${j.ate.toISOString().slice(0, 10)}`
      if (!refazer && jaFeita.has(chave)) continue

      if (Date.now() - inicio > ORCAMENTO_MS) {
        pendentes++
        continue
      }

      resultados.push(await importarJanela(supabase, recurso, j.de, j.ate))
      await new Promise(r => setTimeout(r, PAUSA_ENTRE_JANELAS_MS))
    }
  }

  const importados = resultados.reduce((s, r) => s + r.registros, 0)
  const comErro = resultados.filter(r => r.status === 'erro')

  return NextResponse.json({
    periodo: `${de.toISOString().slice(0, 10)} → ${ate.toISOString().slice(0, 10)}`,
    janelas_processadas: resultados.length,
    janelas_pendentes: pendentes,
    registros_importados: importados,
    erros: comErro.length,
    // Quem chamou precisa saber que não acabou — a carga continua na próxima.
    concluido: pendentes === 0 && comErro.length === 0,
    detalhe: resultados,
  })
}

// GET — o cron diário. Refaz só a cauda recente, que é barato e é onde os
// registros novos aparecem.
export async function GET(req: NextRequest) {
  if (!autenticado(req)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  if (!socConfigurado()) {
    return NextResponse.json({ error: 'SOC não configurado' }, { status: 400 })
  }
  const ate = new Date()
  const de = new Date(Date.now() - DIAS_INCREMENTAL * 86_400_000)
  return executar({ de, ate, recursos: ['exames', 'licencas'], refazer: true })
}

// POST — carga histórica ou recorte específico.
// Body: { de?, ate?, recurso?: 'exames'|'licencas', refazer?: boolean }
export async function POST(req: NextRequest) {
  if (!autenticado(req)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  if (!socConfigurado()) {
    return NextResponse.json({ error: 'SOC não configurado' }, { status: 400 })
  }
  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  return executar({
    de: new Date(`${(body.de as string) ?? INICIO_PADRAO}T12:00:00`),
    ate: new Date(`${(body.ate as string) ?? new Date().toISOString().slice(0, 10)}T12:00:00`),
    recursos: body.recurso === 'exames' ? ['exames']
            : body.recurso === 'licencas' ? ['licencas']
            : ['exames', 'licencas'],
    // Refazer janelas já concluídas só quando pedido explicitamente.
    refazer: body.refazer === true,
  })
}
