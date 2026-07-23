import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import CaixaClient from './CaixaClient'
import type { FilaItem, EmpresaCaixa, CategoriaPrio } from './CaixaClient'
import { ehIntocavelLancamento, ehIntocavelCategoria, ehIntocavelPorRegra } from '@/lib/financeiro/prioridade'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

function toISO(d: Date) { return d.toISOString().split('T')[0] }

const DIAS = 7  // hoje + 7 dias

export default async function CaixaPage() {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) redirect('/login')

  const sb = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const hojeISO = toISO(hoje)
  const limite = new Date(hoje); limite.setDate(hoje.getDate() + DIAS)
  const limiteISO = toISO(limite)

  // ── Overrides de prioridade + decisões já tomadas (tabelas podem não existir) ──
  const { data: catPrioRaw, error: catErr } = await sb.from('categorias_prioridade').select('categoria, intocavel')
  const tabelaPronta = !catErr
  const overrides: Record<string, boolean> = {}
  for (const c of catPrioRaw ?? []) overrides[c.categoria] = c.intocavel

  const { data: decisoesRaw } = await sb.from('decisoes_pagamento').select('lancamento_id, decisao, prioridade_override')
  const decisaoPorLanc: Record<string, { decisao: string | null; prioridade_override: string | null }> = {}
  for (const d of decisoesRaw ?? []) decisaoPorLanc[d.lancamento_id] = { decisao: d.decisao, prioridade_override: d.prioridade_override }

  // ── Empresas + saldos (por empresa) ───────────────────────────────────────
  const { data: empresas } = await sb.from('empresas').select('id, nome_curto').order('nome_curto')
  const nomeEmpresa: Record<string, string> = {}
  for (const e of empresas ?? []) nomeEmpresa[e.id] = e.nome_curto

  const { data: saldos } = await sb.from('v_saldos_ativos').select('empresa_id, saldo')
  const saldoEmpresa: Record<string, number> = {}
  for (const s of saldos ?? []) {
    if (!s.empresa_id) continue
    saldoEmpresa[s.empresa_id] = (saldoEmpresa[s.empresa_id] ?? 0) + Number(s.saldo ?? 0)
  }

  // ── Despesas abertas até hoje+7d (inclui todos os vencidos) — PAGINADO ─────
  type Row = { id: string; empresa_id: string | null; categoria: string | null; descricao: string | null; valor: number | null; data_vencimento: string | null }
  const abertas: Row[] = []
  const LOTE = 1000
  for (let off = 0; ; off += LOTE) {
    const { data } = await sb.from('lancamentos_financeiros')
      .select('id, empresa_id, categoria, descricao, valor, data_vencimento')
      .eq('tipo', 'despesa')
      .in('status', ['pendente', 'vencido'])
      .lte('data_vencimento', limiteISO)
      .order('id')
      .range(off, off + LOTE - 1)
    if (!data || data.length === 0) break
    abertas.push(...(data as Row[]))
    if (data.length < LOTE) break
  }

  // ── Monta a fila ──────────────────────────────────────────────────────────
  const fila: FilaItem[] = abertas.map(l => {
    const dv = (l.data_vencimento ?? '').slice(0, 10)
    const dias = dv ? Math.round((new Date(dv + 'T00:00:00').getTime() - hoje.getTime()) / 86_400_000) : 0
    const dec = decisaoPorLanc[l.id]
    return {
      id: l.id,
      empresa_id: l.empresa_id ?? '',
      empresa_nome: l.empresa_id ? (nomeEmpresa[l.empresa_id] ?? '—') : '—',
      categoria: l.categoria ?? '—',
      descricao: l.descricao ?? '(sem descrição)',
      valor: Number(l.valor ?? 0),
      data_vencimento: dv,
      diasAteVencer: dias,
      backlogAntigo: dias < -365,   // > 1 ano vencido → provável baixa pendente no Conta Azul
      intocavel: ehIntocavelLancamento(l.categoria, overrides, dec?.prioridade_override),
      decisao: (dec?.decisao ?? null) as FilaItem['decisao'],
    }
  })
  // Ordena: intocável primeiro, depois mais vencido (data mais antiga) primeiro
  fila.sort((a, b) =>
    (a.intocavel === b.intocavel ? 0 : a.intocavel ? -1 : 1) ||
    a.data_vencimento.localeCompare(b.data_vencimento))

  // ── Consolidação por empresa (empresa cobre, matriz socorre) ──────────────
  const venceEmp: Record<string, number> = {}
  for (const f of fila) venceEmp[f.empresa_id] = (venceEmp[f.empresa_id] ?? 0) + f.valor

  const empresasCaixa: EmpresaCaixa[] = (empresas ?? [])
    .map(e => {
      const saldo = saldoEmpresa[e.id] ?? 0
      const vence = venceEmp[e.id] ?? 0
      const gap = Math.max(0, vence - Math.max(0, saldo))
      return { empresa_id: e.id, nome: e.nome_curto, saldo, vence, gap, temSaldo: e.id in saldoEmpresa }
    })
    .filter(e => e.vence > 0 || e.saldo !== 0)
    .sort((a, b) => b.gap - a.gap || b.vence - a.vence)

  const totalVence = fila.reduce((s, f) => s + f.valor, 0)
  const totalTenho = Object.values(saldoEmpresa).reduce((s, v) => s + v, 0)
  const totalAporte = empresasCaixa.reduce((s, e) => s + e.gap, 0)
  const nVermelho = empresasCaixa.filter(e => e.gap > 0).length

  const backlog = fila.filter(f => f.backlogAntigo)
  const totalBacklog = backlog.reduce((s, f) => s + f.valor, 0)
  const resumo = { totalVence, totalTenho, totalAporte, nVermelho, totalFila: fila.length, totalBacklog, qtdBacklog: backlog.length }

  // ── Categorias presentes na fila — para o painel "Ajustar prioridades" ────
  const catMap = new Map<string, number>()
  for (const l of abertas) { const c = l.categoria ?? '—'; catMap.set(c, (catMap.get(c) ?? 0) + Number(l.valor ?? 0)) }
  const categorias: CategoriaPrio[] = Array.from(catMap.entries())
    .map(([categoria, total]) => ({
      categoria,
      total,
      intocavel: ehIntocavelCategoria(categoria, overrides),
      porRegra: ehIntocavelPorRegra(categoria),
      temOverride: Object.prototype.hasOwnProperty.call(overrides, categoria),
    }))
    .sort((a, b) => b.total - a.total)

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white">
        <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6">
          <div className="flex items-center gap-3 mb-2">
            <a href="/dashboard/financeiro" className="text-blue-200/80 text-sm hover:text-white">← Financeiro</a>
            <span className="text-blue-300">·</span>
            <a href="/dashboard" className="text-blue-200/80 text-sm hover:text-white">Centro de Comando</a>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Caixa do Dia</h1>
          <p className="text-blue-100/90 text-sm">O que vence, quanto tenho, quanto falta, quem pago primeiro · hoje + {DIAS} dias</p>
        </div>
      </div>
      <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6 md:py-8">
        <Suspense>
          <CaixaClient
            tabelaPronta={tabelaPronta}
            resumo={resumo}
            empresas={empresasCaixa}
            fila={fila}
            categorias={categorias}
            hojeISO={hojeISO}
          />
        </Suspense>
      </div>
    </main>
  )
}
