import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createService } from '@supabase/supabase-js'
import { parseDreContabilidade } from '@/lib/financeiro/dre-import'

export const runtime = 'nodejs'
export const maxDuration = 60

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/safework|safe\s*work|\bsw\b/g, '')
    .replace(/[^a-z0-9]/g, '').trim()
}

export async function POST(req: NextRequest) {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const form = await req.formData()
  const file = form.get('arquivo') as File | null
  if (!file) return NextResponse.json({ error: 'Arquivo não enviado.' }, { status: 400 })

  let parse
  try {
    parse = parseDreContabilidade(await file.arrayBuffer())
  } catch (e) {
    return NextResponse.json({ error: `Falha ao ler o DRE: ${(e as Error).message}` }, { status: 422 })
  }
  if (!parse.empresas.length) return NextResponse.json({ error: parse.aviso ?? 'DRE não reconhecido.' }, { status: 422 })
  if (!parse.ano) return NextResponse.json({ error: 'Não consegui detectar o ano do DRE (cabeçalho tipo "Jan/25").' }, { status: 422 })

  const ano = parse.ano
  const sb = createService(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // Dashboard: receita/despesa operacional por empresa (mesma fonte do Mapa de Empresas)
  const { data: rpc, error: rpcErr } = await sb.rpc('fn_financeiro_por_empresa', { p_de: `${ano}-01-01`, p_ate: `${ano}-12-31` })
  if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 })
  const { data: empresas } = await sb.from('empresas').select('id, nome_curto')

  const nomePorId: Record<string, string> = {}
  const idPorNorm: Record<string, string> = {}
  for (const e of empresas ?? []) { nomePorId[e.id] = e.nome_curto; idPorNorm[norm(e.nome_curto)] = e.id }

  const dashPorId: Record<string, { rec: number; desp: number }> = {}
  for (const row of (rpc ?? []) as { empresa_id: string; tipo: string; total: number }[]) {
    if (!dashPorId[row.empresa_id]) dashPorId[row.empresa_id] = { rec: 0, desp: 0 }
    if (row.tipo === 'receita') dashPorId[row.empresa_id].rec += Number(row.total)
    else                        dashPorId[row.empresa_id].desp += Number(row.total)
  }

  const itens = parse.empresas.map(e => {
    const id = idPorNorm[norm(e.empresa_nome)] ?? null
    const dash = id ? dashPorId[id] : null
    const dashReceita = dash ? dash.rec : null
    const dashLucro   = dash ? dash.rec - dash.desp : null
    return {
      empresa: e.empresa_nome,
      vinculada: !!id,
      dreReceita: e.receita,
      dashReceita,
      difReceita: dashReceita === null ? null : e.receita - dashReceita,
      dreLucro: e.lucro,
      dashLucro,
      difLucro: dashLucro === null ? null : e.lucro - dashLucro,
    }
  })

  const consolidado = itens.reduce((a, i) => ({
    dreReceita: a.dreReceita + i.dreReceita,
    dashReceita: a.dashReceita + (i.dashReceita ?? 0),
    dreLucro: a.dreLucro + i.dreLucro,
    dashLucro: a.dashLucro + (i.dashLucro ?? 0),
  }), { dreReceita: 0, dashReceita: 0, dreLucro: 0, dashLucro: 0 })

  return NextResponse.json({ ano, itens, consolidado })
}
