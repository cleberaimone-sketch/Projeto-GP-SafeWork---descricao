import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import FluxoCaixaDetalhado from './FluxoCaixaDetalhado'
import type { MesItem, SemanaForecast, BancoItem, LancamentoItem } from './FluxoCaixaDetalhado'
import {
  carregarCategoriasExcluidas,
  isTransferenciaInterna,
} from '@/lib/financeiro/regras'

interface SP { empresa?: string }

function toISO(d: Date) { return d.toISOString().split('T')[0] }

// Helpers de semana
function inicioSemana(d: Date): Date {
  const x = new Date(d)
  const dow = x.getDay()  // 0=domingo, 1=segunda
  const diff = (dow + 6) % 7  // distância à segunda
  x.setDate(x.getDate() - diff)
  x.setHours(0, 0, 0, 0)
  return x
}
function addDias(d: Date, n: number): Date {
  const x = new Date(d); x.setDate(x.getDate() + n); return x
}
function isoSemana(d: Date): string {
  return toISO(inicioSemana(d))
}

export default async function FluxoCaixaPage({ searchParams }: { searchParams: Promise<SP> }) {
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
  const hojeISO = toISO(hoje)

  // Janela: 12 meses para trás + 6 à frente (regime competência) e
  //         12 meses para trás + 6 à frente (regime caixa via data_pagamento)
  const inicioJanela = new Date(hoje.getFullYear(), hoje.getMonth() - 12, 1)
  const fimJanela    = new Date(hoje.getFullYear(), hoje.getMonth() + 7, 0)
  const inicioISO    = toISO(inicioJanela)
  const fimISO       = toISO(fimJanela)

  // ── Queries paralelas ────────────────────────────────────────────────────
  const [
    { data: empresas },
    { data: saldosAtivos },
    { data: lancRaw },
    excluidas,
  ] = await Promise.all([
    sb.from('empresas').select('id, nome_curto').order('nome_curto'),
    sb.from('v_saldos_ativos').select('*').order('nome_exibicao'),
    sb.from('lancamentos_financeiros')
      .select('id, tipo, status, valor, descricao, categoria, data_vencimento, data_pagamento, empresa_id')
      .neq('status', 'cancelado')
      .or(`data_vencimento.gte.${inicioISO},data_pagamento.gte.${inicioISO}`)
      .order('data_vencimento', { ascending: true }),
    carregarCategoriasExcluidas(sb),
  ])

  const empresaMap: Record<string, string> = {}
  for (const e of empresas ?? []) empresaMap[e.id] = e.nome_curto

  // Filtra transferências internas (não são fluxo de caixa real)
  const lancamentos = (lancRaw ?? []).filter(
    l => !isTransferenciaInterna(l.categoria, excluidas)
  )

  // Filtra por empresa, se selecionada
  const lancFiltrados = filters.empresa
    ? lancamentos.filter(l => l.empresa_id === filters.empresa)
    : lancamentos

  // ── Tabela mensal: Previsto vs Realizado ──────────────────────────────────
  // Janela: 9 meses para trás + 3 à frente (12 total)
  type MesData = {
    receitaPrev: number; receitaReal: number
    despesaPrev: number; despesaReal: number
    qtdReceitaPrev: number; qtdReceitaReal: number
    qtdDespesaPrev: number; qtdDespesaReal: number
  }
  const mesMap: Record<string, MesData> = {}

  // Inicializa 12 meses (9 atrás + atual + 3 à frente) para garantir continuidade visual
  for (let i = -9; i <= 3; i++) {
    const m = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1)
    const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`
    mesMap[key] = {
      receitaPrev: 0, receitaReal: 0, despesaPrev: 0, despesaReal: 0,
      qtdReceitaPrev: 0, qtdReceitaReal: 0, qtdDespesaPrev: 0, qtdDespesaReal: 0,
    }
  }

  for (const l of lancFiltrados) {
    const valor   = l.valor ?? 0
    const isPago  = l.status === 'pago' || l.status === 'parcial'
    const isPrev  = l.status === 'pendente' || l.status === 'vencido'

    // Realizado: cai no mês do PAGAMENTO
    if (isPago && l.data_pagamento) {
      const keyReal = l.data_pagamento.slice(0, 7)
      if (mesMap[keyReal]) {
        if (l.tipo === 'receita') {
          mesMap[keyReal].receitaReal     += valor
          mesMap[keyReal].qtdReceitaReal  += 1
        } else if (l.tipo === 'despesa') {
          mesMap[keyReal].despesaReal     += valor
          mesMap[keyReal].qtdDespesaReal  += 1
        }
      }
    }

    // Previsto: cai no mês do VENCIMENTO (só se ainda não foi pago)
    if (isPrev && l.data_vencimento) {
      const keyPrev = l.data_vencimento.slice(0, 7)
      if (mesMap[keyPrev]) {
        if (l.tipo === 'receita') {
          mesMap[keyPrev].receitaPrev     += valor
          mesMap[keyPrev].qtdReceitaPrev  += 1
        } else if (l.tipo === 'despesa') {
          mesMap[keyPrev].despesaPrev     += valor
          mesMap[keyPrev].qtdDespesaPrev  += 1
        }
      }
    }
  }

  const meses: MesItem[] = Object.entries(mesMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => {
      const [ano, m] = key.split('-')
      const nomeMes = new Date(Number(ano), Number(m) - 1, 1)
        .toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
      return {
        mesKey: key,
        nomeMes,
        ehMesAtual: key === `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`,
        ehFuturo:   key > `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`,
        receitaPrev: v.receitaPrev,
        receitaReal: v.receitaReal,
        despesaPrev: v.despesaPrev,
        despesaReal: v.despesaReal,
        saldoPrev:   v.receitaPrev - v.despesaPrev,
        saldoReal:   v.receitaReal - v.despesaReal,
        qtdReceitaPrev: v.qtdReceitaPrev,
        qtdReceitaReal: v.qtdReceitaReal,
        qtdDespesaPrev: v.qtdDespesaPrev,
        qtdDespesaReal: v.qtdDespesaReal,
      }
    })

  // ── Rolling 13-Week Forecast ──────────────────────────────────────────────
  const saldoAtual = (saldosAtivos ?? []).reduce((sum, s) => sum + (s.saldo ?? 0), 0)

  type SemanaData = { entradas: number; saidas: number; qtdEnt: number; qtdSai: number }
  const semanaMap: Record<string, SemanaData> = {}

  // Inicializa 13 semanas a partir desta semana
  const semanaInicio = inicioSemana(hoje)
  for (let i = 0; i < 13; i++) {
    const sIni = addDias(semanaInicio, i * 7)
    semanaMap[isoSemana(sIni)] = { entradas: 0, saidas: 0, qtdEnt: 0, qtdSai: 0 }
  }

  for (const l of lancFiltrados) {
    if (l.status === 'pago' || l.status === 'parcial' || l.status === 'cancelado') continue
    if (!l.data_vencimento) continue
    const d = new Date(l.data_vencimento + 'T00:00:00')
    if (d < semanaInicio) continue
    const limite = addDias(semanaInicio, 13 * 7)
    if (d >= limite) continue

    const k = isoSemana(d)
    if (!semanaMap[k]) continue

    const valor = l.valor ?? 0
    if (l.tipo === 'receita') {
      semanaMap[k].entradas += valor
      semanaMap[k].qtdEnt   += 1
    } else if (l.tipo === 'despesa') {
      semanaMap[k].saidas += valor
      semanaMap[k].qtdSai += 1
    }
  }

  let saldoAcum = saldoAtual
  const semanas: SemanaForecast[] = Object.entries(semanaMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([inicio, v], idx) => {
      const ini = new Date(inicio + 'T00:00:00')
      const fim = addDias(ini, 6)
      const saldoSemana = v.entradas - v.saidas
      saldoAcum += saldoSemana
      return {
        semanaIdx: idx + 1,
        label: `${String(ini.getDate()).padStart(2, '0')}/${String(ini.getMonth() + 1).padStart(2, '0')} – ${String(fim.getDate()).padStart(2, '0')}/${String(fim.getMonth() + 1).padStart(2, '0')}`,
        dataInicio: inicio,
        entradas: v.entradas,
        saidas: v.saidas,
        saldoSemana,
        saldoAcumulado: saldoAcum,
        qtdEntradas: v.qtdEnt,
        qtdSaidas:   v.qtdSai,
      }
    })

  // ── Detalhamento por banco ────────────────────────────────────────────────
  const bancos: BancoItem[] = (saldosAtivos ?? []).map(s => ({
    empresa: empresaMap[s.empresa_id] ?? '—',
    banco:   s.nome_exibicao,
    numero:  s.numero_cc,
    saldo:   s.saldo ?? 0,
    fonte:   s.fonte_saldo ?? s.fonte_dados,
    temMatch: s.banco_origem !== null,
  })).sort((a, b) => b.saldo - a.saldo)

  // ── Top lançamentos pendentes próximos 90 dias (para tabela detalhada) ────
  const fim90 = addDias(hoje, 90)
  const fim90ISO = toISO(fim90)
  const proximosLanc: LancamentoItem[] = lancFiltrados
    .filter(l => {
      if (l.status === 'pago' || l.status === 'parcial' || l.status === 'cancelado') return false
      if (!l.data_vencimento) return false
      return l.data_vencimento >= hojeISO && l.data_vencimento <= fim90ISO
    })
    .map(l => ({
      id: l.id,
      data: l.data_vencimento!,
      descricao: l.descricao ?? '(sem descrição)',
      categoria: l.categoria ?? '—',
      empresa: empresaMap[l.empresa_id] ?? '—',
      tipo: l.tipo as 'receita' | 'despesa',
      valor: l.valor ?? 0,
      diasAteVencer: Math.round((new Date(l.data_vencimento! + 'T00:00:00').getTime() - hoje.getTime()) / 86400000),
    }))
    .sort((a, b) => a.data.localeCompare(b.data))

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6 md:p-8">

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <a href="/dashboard/financeiro" className="text-slate-500 text-sm hover:text-slate-300">← Financeiro</a>
          <span className="text-slate-700">·</span>
          <a href="/dashboard" className="text-slate-500 text-sm hover:text-slate-300">Centro de Comando</a>
        </div>
        <h1 className="text-2xl font-bold mt-2">Fluxo de Caixa Detalhado</h1>
        <p className="text-slate-400 text-sm">
          Previsto vs Realizado · {lancFiltrados.length.toLocaleString('pt-BR')} lançamentos analisados · saldo atual <span className={saldoAtual >= 0 ? 'text-emerald-400' : 'text-red-400'}>{saldoAtual.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}</span>
        </p>
      </div>

      <Suspense>
        <FluxoCaixaDetalhado
          meses={meses}
          semanas={semanas}
          bancos={bancos}
          proximosLancamentos={proximosLanc}
          saldoAtual={saldoAtual}
          empresas={empresas ?? []}
          empresaSelecionada={filters.empresa ?? ''}
        />
      </Suspense>

    </main>
  )
}
