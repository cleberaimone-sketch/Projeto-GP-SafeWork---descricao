import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { setTokenRefreshCallback } from '@/lib/conta-azul/client'
import {
  validarEscopoEmpresa, detectarColisoes,
  type ContaCadastrada, type ResultadoEscopo,
} from '@/lib/conta-azul/escopo'

export const maxDuration = 120

const CLIENT_ID = process.env.CONTA_AZUL_CLIENT_ID!
const CLIENT_SECRET = process.env.CONTA_AZUL_CLIENT_SECRET!

// GET /api/conta-azul/validar-escopo        → HTML legível
// GET /api/conta-azul/validar-escopo?json=1 → JSON
//
// Rode SEMPRE depois de reautorizar, ANTES de sincronizar. As empresas usam uma
// conta master multi-empresa e o token sai escopado para a empresa ativa no
// seletor — autorizar duas em sequência sem trocar grava o token da mesma
// empresa nas duas. Ver lib/conta-azul/escopo.ts.
export async function GET(req: NextRequest) {
  const segredo = req.headers.get('x-cron-secret')
    ?? req.nextUrl.searchParams.get('secret')
  if (segredo !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  // O client pode rotacionar o refresh_token ao renovar o access; sem persistir,
  // conferir o escopo queimaria justamente os tokens que acabaram de ser
  // autorizados.
  setTokenRefreshCallback(async (empresaNome, novoRefresh) => {
    const { error } = await sb
      .from('conta_azul_tokens')
      .update({ refresh_token: novoRefresh, atualizado_em: new Date().toISOString() })
      .eq('empresa_nome', empresaNome)
    if (error) throw new Error(`persistência do token de ${empresaNome}: ${error.message}`)
  })

  const [{ data: tokens }, { data: contas }] = await Promise.all([
    sb.from('conta_azul_tokens').select('empresa_nome, empresa_id, refresh_token'),
    sb.from('contas_bancarias_ativas').select('empresa_id, nome_exibicao, numero_cc, padroes_match'),
  ])

  const porEmpresa = new Map<string, ContaCadastrada[]>()
  for (const c of contas ?? []) {
    const lista = porEmpresa.get(c.empresa_id) ?? []
    lista.push(c as ContaCadastrada)
    porEmpresa.set(c.empresa_id, lista)
  }

  const resultados: ResultadoEscopo[] = []
  // Sequencial de propósito: em paralelo, várias renovações simultâneas do mesmo
  // client_id no Cognito viram rate limit.
  for (const t of tokens ?? []) {
    resultados.push(await validarEscopoEmpresa(
      {
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        refreshToken: t.refresh_token,
        empresaSupabaseId: t.empresa_id ?? '',
        empresaNome: t.empresa_nome,
      },
      porEmpresa.get(t.empresa_id ?? '') ?? [],
    ))
  }

  const colisoes = detectarColisoes(resultados)
  const problemas = resultados.filter(r => !r.ok)

  if (req.nextUrl.searchParams.get('json')) {
    return NextResponse.json({ resultados, colisoes, problemas: problemas.length },
      { headers: { 'Cache-Control': 'no-store' } })
  }

  const linhas = resultados.map(r => `
    <tr style="border-bottom:1px solid #eee">
      <td style="padding:8px 10px;font-size:20px">${r.ok ? '✅' : '❌'}</td>
      <td style="padding:8px 10px;font-weight:600">${r.empresaNome}</td>
      <td style="padding:8px 10px;font-size:13px;color:#555">${r.motivo}</td>
      <td style="padding:8px 10px;font-size:11px;color:#888">${r.contasDoToken.join(' · ') || '—'}</td>
    </tr>`).join('')

  const alerta = problemas.length || colisoes.length
    ? `<div style="background:#FEF3C7;border-left:4px solid #B45309;padding:14px 16px;margin:20px 0;border-radius:4px">
        <strong style="color:#92400E">Atenção — não sincronize antes de corrigir</strong>
        ${problemas.map(p => `<p style="margin:8px 0 0;font-size:13px">
          <strong>${p.empresaNome}</strong>: ${p.motivo}</p>`).join('')}
        ${colisoes.map(c => `<p style="margin:8px 0 0;font-size:13px">
          <strong>Mesmo escopo:</strong> ${c.empresas.join(' e ')} enxergam contas idênticas —
          pelo menos um destes tokens está errado.</p>`).join('')}
        <p style="margin:10px 0 0;font-size:12px;color:#92400E">
          Refaça a autorização: troque a empresa ativa no seletor da conta master,
          confirme na tela que mudou, e só então abra o link da empresa.
        </p>
      </div>`
    : `<div style="background:#D1FAE5;border-left:4px solid #059669;padding:14px 16px;margin:20px 0;border-radius:4px">
        <strong style="color:#065F46">Todos os tokens conferem</strong>
        <p style="margin:6px 0 0;font-size:13px;color:#065F46">Seguro sincronizar.</p>
      </div>`

  return new NextResponse(
    `<html><head><meta charset="utf-8"><title>Escopo dos tokens — Conta Azul</title></head>
     <body style="font-family:system-ui,sans-serif;padding:32px;max-width:1100px;margin:0 auto;color:#111">
       <h1 style="font-size:20px">Escopo dos tokens do Conta Azul</h1>
       <p style="color:#666;font-size:13px">
         Confere, para cada empresa, se o token enxerga as contas bancárias dela.
         Rode depois de reautorizar e antes de sincronizar.
       </p>
       ${alerta}
       <table style="width:100%;border-collapse:collapse;font-size:14px">
         <thead><tr style="text-align:left;border-bottom:2px solid #ddd;font-size:12px;color:#666">
           <th style="padding:8px 10px"></th><th style="padding:8px 10px">Empresa</th>
           <th style="padding:8px 10px">Conferência</th>
           <th style="padding:8px 10px">Contas que o token enxerga</th>
         </tr></thead>
         <tbody>${linhas}</tbody>
       </table>
     </body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  )
}
