import { createClient as sb } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import InadimplentesClient from './InadimplentesClient'
import FiltroPeriodo from '../FiltroPeriodo'
import type { GraficoAnualMes } from '../GraficoAnual'

const NOMES_MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

interface SP { empresa?: string; de?: string; ate?: string; ordem?: string }

export default async function InadimplentesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const filters = await searchParams
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) redirect('/login')

  const supabase = sb(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // Período: ano atual por padrão (permite ver outros anos / mês / tudo via FiltroPeriodo)
  const anoAtual = new Date().getFullYear()
  const de  = filters.de  ?? `${anoAtual}-01-01`
  const ate = filters.ate ?? `${anoAtual}-12-31`

  const [{ data: empresas }, { data: rawLancamentos }] = await Promise.all([
    supabase.from('empresas').select('id, nome_curto').order('nome_curto'),
    (() => {
      let q = supabase
        .from('lancamentos_financeiros')
        .select('id, empresa_id, descricao, categoria, valor, data_vencimento, status')
        .eq('tipo', 'receita')
        .eq('status', 'vencido')
        .gte('data_vencimento', de)
        .lte('data_vencimento', ate)
        .order('data_vencimento', { ascending: true })
      if (filters.empresa) q = q.eq('empresa_id', filters.empresa)
      return q
    })(),
  ])

  const hoje = new Date()
  const empresaMap: Record<string, string> = {}
  for (const e of empresas ?? []) empresaMap[e.id] = e.nome_curto

  const lancamentos = (rawLancamentos ?? []).map(l => ({
    ...l,
    empresa_nome: l.empresa_id ? (empresaMap[l.empresa_id] ?? '—') : '—',
    dias_atraso: l.data_vencimento
      ? Math.floor((hoje.getTime() - new Date(l.data_vencimento + 'T00:00:00').getTime()) / 86400000)
      : 0,
  }))

  // ── Gráfico anual (jan-dez): contas a receber por mês — total, recebido, saldo a receber ──
  // Segue o ANO do filtro de cima (de); por padrão o ano atual.
  const anoGraf = parseInt((de ?? '').slice(0, 4)) || anoAtual
  // Paginado: o ano tem mais de 10 mil receitas e o PostgREST corta em 1000.
  // Sem isto, o gráfico anual desenhava com uma fração dos lançamentos.
  type LancGraf = { valor: number | null; data_vencimento: string | null; data_pagamento: string | null; status: string; categoria: string | null }
  const rawAnoReceber: LancGraf[] = []
  {
    const LOTE = 1000
    for (let off = 0; ; off += LOTE) {
      let q = supabase.from('lancamentos_financeiros')
        .select('valor, data_vencimento, data_pagamento, status, categoria')
        .neq('status', 'cancelado')
        .eq('tipo', 'receita')
        .or(`and(data_vencimento.gte.${anoGraf}-01-01,data_vencimento.lte.${anoGraf}-12-31),and(data_pagamento.gte.${anoGraf}-01-01,data_pagamento.lte.${anoGraf}-12-31)`)
        .order('id')
        .range(off, off + LOTE - 1)
      if (filters.empresa) q = q.eq('empresa_id', filters.empresa)
      const { data } = await q
      if (!data || data.length === 0) break
      rawAnoReceber.push(...(data as LancGraf[]))
      if (data.length < LOTE) break
    }
  }

  const graficoAnual: GraficoAnualMes[] = []
  let acumSaldo = 0
  for (let m = 0; m < 12; m++) {
    const mesKey = `${anoGraf}-${String(m + 1).padStart(2, '0')}`
    // total = o que VENCE no mês ; recebido = o que ENTROU no mês (por data de pagamento)
    const total = rawAnoReceber.filter(l => (l.data_vencimento ?? '').startsWith(mesKey)).reduce((s, l) => s + (l.valor ?? 0), 0)
    const pago  = rawAnoReceber.filter(l => (l.status === 'pago' || l.status === 'parcial') && (l.data_pagamento ?? '').startsWith(mesKey)).reduce((s, l) => s + (l.valor ?? 0), 0)
    // Saldo a receber: soma o que vence e desconta o que foi recebido (sobe ao vencer, desce ao receber)
    acumSaldo += (total - pago)
    graficoAnual.push({ mes: NOMES_MES[m], total, pago, acumulado: acumSaldo })
  }

  // Agrupar por empresa para resumo
  const porEmpresa: Record<string, { nome: string; total: number; qtd: number; max_atraso: number }> = {}
  for (const l of lancamentos) {
    const key = l.empresa_id ?? 'sem-empresa'
    if (!porEmpresa[key]) porEmpresa[key] = { nome: l.empresa_nome, total: 0, qtd: 0, max_atraso: 0 }
    porEmpresa[key].total += l.valor ?? 0
    porEmpresa[key].qtd += 1
    porEmpresa[key].max_atraso = Math.max(porEmpresa[key].max_atraso, l.dias_atraso)
  }

  const resumoPorEmpresa = Object.values(porEmpresa).sort((a, b) => b.total - a.total)
  const totalGeral = lancamentos.reduce((s, l) => s + (l.valor ?? 0), 0)
  const maisAntigo = lancamentos.length > 0
    ? Math.max(...lancamentos.map(l => l.dias_atraso))
    : 0

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white">
        <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6">
          <div className="flex items-center gap-3 mb-2">
            <a href="/dashboard/financeiro" className="text-blue-200/80 text-sm hover:text-white">← Financeiro</a>
            <span className="text-blue-300">·</span>
            <a href="/dashboard" className="text-blue-200/80 text-sm hover:text-white">Centro de Comando</a>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Inadimplência — Títulos Vencidos</h1>
          <p className="text-blue-100/90 text-sm">{lancamentos.length.toLocaleString('pt-BR')} títulos em aberto</p>
        </div>
      </div>
      <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6 md:py-8">
        <Suspense>
          <FiltroPeriodo de={de} ate={ate} anoAtual={anoAtual} />
        </Suspense>
        <Suspense>
          <InadimplentesClient
            lancamentos={lancamentos}
            empresas={empresas ?? []}
            resumoPorEmpresa={resumoPorEmpresa}
            totalGeral={totalGeral}
            maisAntigo={maisAntigo}
            graficoAnual={graficoAnual}
            anoGrafico={anoGraf}
          />
        </Suspense>
      </div>
    </main>
  )
}
