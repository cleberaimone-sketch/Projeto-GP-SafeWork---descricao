import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import EmprestimosClient from './EmprestimosClient'
import type { TipoEmprestimo, EmprestimoLanc, KpisEmprestimos, MesCronograma, MesHistorico, ResumoPorTipo, ResumoPorEmpresa } from './EmprestimosClient'

interface SP { empresa?: string }

function toISO(d: Date) { return d.toISOString().split('T')[0] }

// Classifica empréstimos por categoria (mais granular que regras.ts)
function classificarEmprestimo(categoria: string | null | undefined): TipoEmprestimo | null {
  if (!categoria) return null
  const c = categoria.toLowerCase()

  // Juros sobre parcelamentos é despesa financeira, não principal — vamos contar separado
  if (/juros\s+sobre\s+parcelamento/.test(c))            return 'juros_parcelamento'
  if (/parcelamento/.test(c))                            return 'parcelamento'
  if (/empr[eé]stimo.*s[oó]cio|s[oó]cio.*empr[eé]stimo/.test(c)) return 'socios'
  if (/empr[eé]stimo.*banco|banco.*empr[eé]stimo/.test(c))       return 'bancos'
  if (/empr[eé]stimo.*terceiro|terceiro.*empr[eé]stimo/.test(c)) return 'terceiros'
  if (/m[uú]tuo\s+entre\s+contas/.test(c))               return 'mutuo_grupo'
  if (/empr[eé]stimo/.test(c))                           return 'outros'
  return null
}

const TIPO_LABEL: Record<TipoEmprestimo, string> = {
  socios:              'Sócios',
  bancos:              'Bancos',
  terceiros:           'Terceiros',
  mutuo_grupo:         'Mútuo entre Contas',
  parcelamento:        'Parcelamentos',
  juros_parcelamento:  'Juros de Parcelamentos',
  outros:              'Outros',
}

export default async function EmprestimosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const filters = await searchParams
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) redirect('/login')

  const sb = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const anoAtual = hoje.getFullYear()

  // ── Queries ───────────────────────────────────────────────────────────────
  // Puxa TODOS os lançamentos cuja categoria parece empréstimo/parcelamento
  // (filtro feito server-side via regex SQL para limitar payload)
  const [{ data: empresas }, { data: rawLancamentos }] = await Promise.all([
    sb.from('empresas').select('id, nome_curto').order('nome_curto'),
    (() => {
      let q = sb
        .from('lancamentos_financeiros')
        .select('id, empresa_id, tipo, descricao, categoria, valor, data_vencimento, data_pagamento, status')
        .neq('status', 'cancelado')
        .or('categoria.ilike.*mprestimo*,categoria.ilike.*mpréstimo*,categoria.ilike.*parcelamento*,categoria.ilike.*mútuo*,categoria.ilike.*mutuo*')
      if (filters.empresa) q = q.eq('empresa_id', filters.empresa)
      return q
    })(),
  ])

  const empresaMap: Record<string, string> = {}
  for (const e of empresas ?? []) empresaMap[e.id] = e.nome_curto

  const lancamentos: EmprestimoLanc[] = (rawLancamentos ?? [])
    .map(l => {
      const tipoEmp = classificarEmprestimo(l.categoria)
      if (!tipoEmp) return null
      return {
        id: l.id,
        empresa_id: l.empresa_id,
        empresa_nome: l.empresa_id ? (empresaMap[l.empresa_id] ?? '—') : '—',
        tipo: l.tipo as 'receita' | 'despesa',
        tipoEmp,
        tipoEmpLabel: TIPO_LABEL[tipoEmp],
        descricao: l.descricao ?? '(sem descrição)',
        categoria: l.categoria ?? '—',
        valor: l.valor ?? 0,
        data_vencimento: l.data_vencimento,
        data_pagamento: l.data_pagamento,
        status: l.status ?? 'pendente',
      } as EmprestimoLanc
    })
    .filter((l): l is EmprestimoLanc => l !== null)

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const inAberto      = lancamentos.filter(l => l.status === 'pendente' || l.status === 'vencido')
  const aPagar        = inAberto.filter(l => l.tipo === 'despesa' && l.tipoEmp !== 'juros_parcelamento')
  const aReceber      = inAberto.filter(l => l.tipo === 'receita')
  const jurosAberto   = inAberto.filter(l => l.tipoEmp === 'juros_parcelamento' && l.tipo === 'despesa')

  // Pagos / Recebidos
  const pagos         = lancamentos.filter(l => l.status === 'pago' || l.status === 'parcial')
  const pagosNoAno    = pagos.filter(l => (l.data_pagamento ?? '').startsWith(String(anoAtual)))
  const pagosNoMes    = pagos.filter(l => {
    const k = `${anoAtual}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
    return (l.data_pagamento ?? '').startsWith(k)
  })

  // Próximos 30 dias a pagar
  const d30 = new Date(hoje); d30.setDate(hoje.getDate() + 30)
  const proximos30 = aPagar.filter(l => l.data_vencimento && l.data_vencimento >= toISO(hoje) && l.data_vencimento <= toISO(d30))

  // Total já pago (principal): toda saída paga de empréstimo/parcelamento principal
  const totalPagoPrincipal = pagos.filter(l => l.tipo === 'despesa' && l.tipoEmp !== 'juros_parcelamento')
    .reduce((s, l) => s + l.valor, 0)

  // Total já recebido (entradas de empréstimo)
  const totalRecebido = pagos.filter(l => l.tipo === 'receita')
    .reduce((s, l) => s + l.valor, 0)

  // Juros pagos no ano
  const jurosPagosAno = pagos.filter(l => l.tipoEmp === 'juros_parcelamento' && l.tipo === 'despesa' && (l.data_pagamento ?? '').startsWith(String(anoAtual)))
    .reduce((s, l) => s + l.valor, 0)

  const kpis: KpisEmprestimos = {
    saldoAberto:         aPagar.reduce((s, l) => s + l.valor, 0),
    qtdAberto:           aPagar.length,
    jurosAberto:         jurosAberto.reduce((s, l) => s + l.valor, 0),
    aReceber:            aReceber.reduce((s, l) => s + l.valor, 0),
    qtdAReceber:         aReceber.length,
    pagoNoMes:           pagosNoMes.filter(l => l.tipo === 'despesa').reduce((s, l) => s + l.valor, 0),
    pagoNoAno:           pagosNoAno.filter(l => l.tipo === 'despesa').reduce((s, l) => s + l.valor, 0),
    proximos30:          proximos30.reduce((s, l) => s + l.valor, 0),
    qtdProximos30:       proximos30.length,
    totalPagoHistorico:  totalPagoPrincipal,
    totalRecebidoHist:   totalRecebido,
    jurosPagosAno:       jurosPagosAno,
  }

  // ── Resumo por tipo (composição) ──────────────────────────────────────────
  const tipoMap: Record<TipoEmprestimo, { aberto: number; pago: number; qtdAberto: number }> = {
    socios:             { aberto: 0, pago: 0, qtdAberto: 0 },
    bancos:             { aberto: 0, pago: 0, qtdAberto: 0 },
    terceiros:          { aberto: 0, pago: 0, qtdAberto: 0 },
    mutuo_grupo:        { aberto: 0, pago: 0, qtdAberto: 0 },
    parcelamento:       { aberto: 0, pago: 0, qtdAberto: 0 },
    juros_parcelamento: { aberto: 0, pago: 0, qtdAberto: 0 },
    outros:             { aberto: 0, pago: 0, qtdAberto: 0 },
  }
  for (const l of lancamentos) {
    if (l.tipo !== 'despesa') continue
    if (l.status === 'pendente' || l.status === 'vencido') {
      tipoMap[l.tipoEmp].aberto += l.valor
      tipoMap[l.tipoEmp].qtdAberto += 1
    } else if (l.status === 'pago' || l.status === 'parcial') {
      tipoMap[l.tipoEmp].pago += l.valor
    }
  }
  const resumoPorTipo: ResumoPorTipo[] = (Object.keys(tipoMap) as TipoEmprestimo[])
    .map(t => ({
      tipo: t,
      label: TIPO_LABEL[t],
      aberto: tipoMap[t].aberto,
      pago: tipoMap[t].pago,
      qtdAberto: tipoMap[t].qtdAberto,
    }))
    .filter(r => r.aberto > 0 || r.pago > 0)
    .sort((a, b) => b.aberto - a.aberto)

  // ── Resumo por empresa ────────────────────────────────────────────────────
  const empMap: Record<string, { nome: string; aberto: number; pago: number; qtdAberto: number }> = {}
  for (const l of lancamentos) {
    if (l.tipo !== 'despesa') continue
    const key = l.empresa_id ?? 'sem'
    if (!empMap[key]) empMap[key] = { nome: l.empresa_nome, aberto: 0, pago: 0, qtdAberto: 0 }
    if (l.status === 'pendente' || l.status === 'vencido') {
      empMap[key].aberto += l.valor
      empMap[key].qtdAberto += 1
    } else if (l.status === 'pago' || l.status === 'parcial') {
      empMap[key].pago += l.valor
    }
  }
  const resumoPorEmpresa: ResumoPorEmpresa[] = Object.values(empMap)
    .filter(e => e.aberto > 0 || e.pago > 0)
    .sort((a, b) => b.aberto - a.aberto)

  // ── Cronograma próximos 12 meses ──────────────────────────────────────────
  const cronograma: MesCronograma[] = []
  for (let i = 0; i < 12; i++) {
    const m = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1)
    const inicio = toISO(new Date(m.getFullYear(), m.getMonth(), 1))
    const fim    = toISO(new Date(m.getFullYear(), m.getMonth() + 1, 0))
    const nomeMes = m.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })

    const items = aPagar.filter(l => l.data_vencimento && l.data_vencimento >= inicio && l.data_vencimento <= fim)
    const principal = items.reduce((s, l) => s + l.valor, 0)
    const juros = jurosAberto.filter(l => l.data_vencimento && l.data_vencimento >= inicio && l.data_vencimento <= fim)
      .reduce((s, l) => s + l.valor, 0)

    cronograma.push({
      mesKey: inicio.slice(0, 7),
      nomeMes,
      principal,
      juros,
      qtd: items.length,
      total: principal + juros,
    })
  }

  // ── Histórico 12 meses (entradas e saídas pagas) ──────────────────────────
  const histMap: Record<string, MesHistorico> = {}
  for (let i = -11; i <= 0; i++) {
    const m = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1)
    const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`
    histMap[key] = {
      mesKey: key,
      nomeMes: m.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
      entradas: 0,
      saidas: 0,
      juros: 0,
      saldoLiquido: 0,
    }
  }
  for (const l of pagos) {
    const key = (l.data_pagamento ?? '').slice(0, 7)
    if (!histMap[key]) continue
    if (l.tipo === 'receita')                                    histMap[key].entradas += l.valor
    else if (l.tipoEmp === 'juros_parcelamento')                 histMap[key].juros    += l.valor
    else                                                          histMap[key].saidas   += l.valor
  }
  for (const k in histMap) {
    histMap[k].saldoLiquido = histMap[k].entradas - histMap[k].saidas - histMap[k].juros
  }
  const historico: MesHistorico[] = Object.values(histMap).sort((a, b) => a.mesKey.localeCompare(b.mesKey))

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white">
        <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6">
          <div className="flex items-center gap-3 mb-2">
            <a href="/dashboard/financeiro" className="text-blue-200/80 text-sm hover:text-white">← Financeiro</a>
            <span className="text-blue-300">·</span>
            <a href="/dashboard" className="text-blue-200/80 text-sm hover:text-white">Centro de Comando</a>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Empréstimos & Parcelamentos</h1>
          <p className="text-blue-100/90 text-sm">{lancamentos.length.toLocaleString('pt-BR')} lançamentos · {inAberto.length} em aberto</p>
        </div>
      </div>
      <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6 md:py-8">
        <Suspense>
          <EmprestimosClient
            kpis={kpis}
            resumoPorTipo={resumoPorTipo}
            resumoPorEmpresa={resumoPorEmpresa}
            cronograma={cronograma}
            historico={historico}
            lancamentos={lancamentos}
            empresas={empresas ?? []}
            empresaSelecionada={filters.empresa ?? ''}
          />
        </Suspense>
      </div>
    </main>
  )
}
