'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface MesItem {
  mesKey: string
  nomeMes: string
  ehMesAtual: boolean
  ehFuturo: boolean
  receitaPrev: number
  receitaReal: number
  despesaPrev: number
  despesaReal: number
  saldoPrev: number
  saldoReal: number
  qtdReceitaPrev: number
  qtdReceitaReal: number
  qtdDespesaPrev: number
  qtdDespesaReal: number
}

export interface SemanaForecast {
  semanaIdx: number
  label: string
  dataInicio: string
  entradas: number
  saidas: number
  saldoSemana: number
  saldoAcumulado: number
  qtdEntradas: number
  qtdSaidas: number
}

export interface BancoItem {
  empresa: string
  banco: string
  numero: string
  saldo: number
  fonte: string
  temMatch: boolean
}

export interface LancamentoItem {
  id: string
  data: string
  descricao: string
  categoria: string
  empresa: string
  tipo: 'receita' | 'despesa'
  valor: number
  diasAteVencer: number
}

interface Props {
  meses: MesItem[]
  semanas: SemanaForecast[]
  bancos: BancoItem[]
  proximosLancamentos: LancamentoItem[]
  saldoAtual: number
  empresas: { id: string; nome_curto: string }[]
  empresaSelecionada: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function FluxoCaixaDetalhado({
  meses, semanas, bancos, proximosLancamentos, saldoAtual, empresas, empresaSelecionada,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [aba, setAba] = useState<'mensal' | 'semanal' | 'bancos' | 'lancamentos'>('mensal')

  function setEmpresa(empresaId: string) {
    const p = new URLSearchParams(searchParams.toString())
    if (empresaId) p.set('empresa', empresaId)
    else p.delete('empresa')
    router.push(`/dashboard/financeiro/fluxo-caixa?${p.toString()}`)
  }

  // ── KPIs do topo ─────────────────────────────────────────────────────────
  const mesAtual = meses.find(m => m.ehMesAtual)
  const entradasFuturas    = meses.filter(m => m.ehFuturo).reduce((s, m) => s + m.receitaPrev, 0)
  const saidasFuturas      = meses.filter(m => m.ehFuturo).reduce((s, m) => s + m.despesaPrev, 0)
  const saldoProj30        = semanas.slice(0, 4).reduce((s, sem) => s + sem.saldoSemana, 0) + saldoAtual
  const semanasNegativas   = semanas.filter(s => s.saldoAcumulado < 0).length

  return (
    <>

      {/* Filtro de empresa */}
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <label className="text-xs text-slate-400">Empresa:</label>
        <select
          value={empresaSelecionada}
          onChange={e => setEmpresa(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200"
        >
          <option value="">Todas (consolidado)</option>
          {empresas.map(e => <option key={e.id} value={e.id}>{e.nome_curto}</option>)}
        </select>
      </div>

      {/* KPIs Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard
          label="Saldo Atual"
          valor={fmt(saldoAtual)}
          cor={saldoAtual >= 0 ? 'emerald' : 'red'}
          subtitulo="Somatório das contas ativas"
        />
        <KpiCard
          label="Mês Atual — Realizado"
          valor={mesAtual ? fmt(mesAtual.saldoReal) : 'R$ 0'}
          cor={mesAtual && mesAtual.saldoReal >= 0 ? 'emerald' : 'red'}
          subtitulo={mesAtual ? `${fmt(mesAtual.receitaReal)} ent · ${fmt(mesAtual.despesaReal)} sai` : ''}
        />
        <KpiCard
          label="Próximos 30 dias — Projetado"
          valor={fmt(saldoProj30)}
          cor={saldoProj30 >= 0 ? 'emerald' : 'red'}
          subtitulo={`saldo + ${semanas.slice(0,4).length} semanas`}
        />
        <KpiCard
          label="6 Meses Futuro"
          valor={fmt(entradasFuturas - saidasFuturas)}
          cor={(entradasFuturas - saidasFuturas) >= 0 ? 'emerald' : 'amber'}
          subtitulo={`${fmt(entradasFuturas)} ent · ${fmt(saidasFuturas)} sai`}
        />
      </div>

      {/* Alerta de semanas negativas */}
      {semanasNegativas > 0 && (
        <div className="bg-red-950/40 border border-red-900/50 rounded-lg px-4 py-3 mb-6 flex items-center gap-3">
          <span className="text-2xl">🚨</span>
          <div>
            <p className="text-sm font-semibold text-red-300">
              {semanasNegativas} {semanasNegativas === 1 ? 'semana' : 'semanas'} com saldo projetado negativo nas próximas 13 semanas
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Veja a aba <button className="underline" onClick={() => setAba('semanal')}>Forecast 13 Semanas</button> para identificar quando e quanto.
            </p>
          </div>
        </div>
      )}

      {/* Abas */}
      <div className="flex items-center gap-2 mb-4 border-b border-slate-800">
        {[
          { id: 'mensal',       label: '📅 Mensal (Previsto vs Realizado)' },
          { id: 'semanal',      label: '🗓️ Forecast 13 Semanas'            },
          { id: 'bancos',       label: '🏦 Contas Bancárias'                 },
          { id: 'lancamentos',  label: '📋 Próximos Lançamentos (90 dias)' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setAba(t.id as typeof aba)}
            className={`px-4 py-2 text-xs font-medium transition-colors border-b-2 ${
              aba === t.id
                ? 'text-white border-emerald-500'
                : 'text-slate-500 border-transparent hover:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Conteúdo das abas */}
      {aba === 'mensal'      && <AbaMensal meses={meses} />}
      {aba === 'semanal'     && <AbaSemanal semanas={semanas} saldoAtual={saldoAtual} />}
      {aba === 'bancos'      && <AbaBancos bancos={bancos} />}
      {aba === 'lancamentos' && <AbaLancamentos lancamentos={proximosLancamentos} />}

    </>
  )
}

// ─── Cards de KPI ────────────────────────────────────────────────────────────

function KpiCard({ label, valor, cor, subtitulo }: {
  label: string; valor: string; cor: 'emerald' | 'red' | 'amber'; subtitulo: string
}) {
  const corClasse = {
    emerald: 'text-emerald-400',
    red:     'text-red-400',
    amber:   'text-amber-400',
  }[cor]
  return (
    <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
      <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">{label}</h3>
      <p className={`text-xl font-bold tabular-nums ${corClasse}`}>{valor}</p>
      <p className="text-[10px] text-slate-600 mt-1">{subtitulo}</p>
    </div>
  )
}

// ─── Aba Mensal: Previsto vs Realizado ───────────────────────────────────────

function AbaMensal({ meses }: { meses: MesItem[] }) {
  // Total de cada coluna
  const totReceitaPrev = meses.reduce((s, m) => s + m.receitaPrev, 0)
  const totReceitaReal = meses.reduce((s, m) => s + m.receitaReal, 0)
  const totDespesaPrev = meses.reduce((s, m) => s + m.despesaPrev, 0)
  const totDespesaReal = meses.reduce((s, m) => s + m.despesaReal, 0)

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
      <div className="p-4 border-b border-slate-800">
        <h3 className="text-sm font-semibold text-white">Previsto vs Realizado por mês</h3>
        <p className="text-[10px] text-slate-500 mt-0.5">
          <span className="text-slate-400">Previsto</span> = lançamentos pendentes/vencidos (regime competência) ·
          <span className="text-slate-400 ml-1">Realizado</span> = lançamentos efetivamente pagos (regime caixa)
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-950/50">
            <tr>
              <th className="text-left px-4 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Mês</th>
              <th className="text-right px-2 py-2 font-semibold text-emerald-600 uppercase tracking-wider text-[10px]" colSpan={2}>Receita</th>
              <th className="text-right px-2 py-2 font-semibold text-red-600 uppercase tracking-wider text-[10px]" colSpan={2}>Despesa</th>
              <th className="text-right px-2 py-2 font-semibold text-amber-500 uppercase tracking-wider text-[10px]" colSpan={2}>Saldo</th>
            </tr>
            <tr className="text-[9px] text-slate-600">
              <th></th>
              <th className="text-right px-2 pb-2">Previsto</th>
              <th className="text-right px-2 pb-2">Realizado</th>
              <th className="text-right px-2 pb-2">Previsto</th>
              <th className="text-right px-2 pb-2">Realizado</th>
              <th className="text-right px-2 pb-2">Previsto</th>
              <th className="text-right px-2 pb-2">Realizado</th>
            </tr>
          </thead>
          <tbody>
            {meses.map(m => (
              <tr key={m.mesKey} className={`border-t border-slate-800/60 hover:bg-slate-800/30 ${m.ehMesAtual ? 'bg-emerald-950/20' : m.ehFuturo ? 'opacity-70' : ''}`}>
                <td className="px-4 py-2 capitalize">
                  <span className={`${m.ehMesAtual ? 'text-emerald-400 font-bold' : 'text-slate-200'}`}>{m.nomeMes}</span>
                  {m.ehMesAtual && <span className="ml-2 text-[9px] text-emerald-500 font-medium uppercase">atual</span>}
                  {m.ehFuturo   && <span className="ml-2 text-[9px] text-slate-600 font-medium uppercase">futuro</span>}
                </td>
                <td className="px-2 py-2 text-right text-slate-400 tabular-nums">
                  {m.receitaPrev > 0 ? <><span>{fmt(m.receitaPrev)}</span><span className="text-[9px] text-slate-600 ml-1">({m.qtdReceitaPrev})</span></> : '—'}
                </td>
                <td className="px-2 py-2 text-right text-emerald-400 tabular-nums font-medium">
                  {m.receitaReal > 0 ? <><span>{fmt(m.receitaReal)}</span><span className="text-[9px] text-slate-600 ml-1">({m.qtdReceitaReal})</span></> : '—'}
                </td>
                <td className="px-2 py-2 text-right text-slate-400 tabular-nums">
                  {m.despesaPrev > 0 ? <><span>{fmt(m.despesaPrev)}</span><span className="text-[9px] text-slate-600 ml-1">({m.qtdDespesaPrev})</span></> : '—'}
                </td>
                <td className="px-2 py-2 text-right text-red-400 tabular-nums font-medium">
                  {m.despesaReal > 0 ? <><span>{fmt(m.despesaReal)}</span><span className="text-[9px] text-slate-600 ml-1">({m.qtdDespesaReal})</span></> : '—'}
                </td>
                <td className={`px-2 py-2 text-right tabular-nums ${m.saldoPrev >= 0 ? 'text-amber-400/70' : 'text-red-400/70'}`}>
                  {m.saldoPrev !== 0 ? fmt(m.saldoPrev) : '—'}
                </td>
                <td className={`px-2 py-2 text-right tabular-nums font-bold ${m.saldoReal >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {(m.saldoReal !== 0 || m.receitaReal || m.despesaReal) ? fmt(m.saldoReal) : '—'}
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-slate-700 bg-slate-950/50">
              <td className="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider">Total</td>
              <td className="px-2 py-3 text-right text-slate-300 tabular-nums font-bold">{fmt(totReceitaPrev)}</td>
              <td className="px-2 py-3 text-right text-emerald-400 tabular-nums font-bold">{fmt(totReceitaReal)}</td>
              <td className="px-2 py-3 text-right text-slate-300 tabular-nums font-bold">{fmt(totDespesaPrev)}</td>
              <td className="px-2 py-3 text-right text-red-400 tabular-nums font-bold">{fmt(totDespesaReal)}</td>
              <td className={`px-2 py-3 text-right tabular-nums font-bold ${(totReceitaPrev - totDespesaPrev) >= 0 ? 'text-amber-400' : 'text-red-400'}`}>{fmt(totReceitaPrev - totDespesaPrev)}</td>
              <td className={`px-2 py-3 text-right tabular-nums font-bold ${(totReceitaReal - totDespesaReal) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(totReceitaReal - totDespesaReal)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Aba Semanal: Rolling 13-Week Forecast ───────────────────────────────────

function AbaSemanal({ semanas, saldoAtual }: { semanas: SemanaForecast[]; saldoAtual: number }) {
  const minSaldo = Math.min(saldoAtual, ...semanas.map(s => s.saldoAcumulado))
  const maxSaldo = Math.max(saldoAtual, ...semanas.map(s => s.saldoAcumulado))
  const range = maxSaldo - minSaldo || 1

  function barPos(v: number): number {
    return ((v - minSaldo) / range) * 100
  }

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
      <div className="p-4 border-b border-slate-800">
        <h3 className="text-sm font-semibold text-white">Forecast 13 semanas — entradas, saídas e saldo projetado</h3>
        <p className="text-[10px] text-slate-500 mt-0.5">
          Saldo acumulado parte de {fmt(saldoAtual)} (saldo atual) e soma o líquido de cada semana.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-950/50">
            <tr>
              <th className="text-left  px-4 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">#</th>
              <th className="text-left  px-2 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Semana</th>
              <th className="text-right px-2 py-2 font-semibold text-emerald-600 uppercase tracking-wider text-[10px]">Entradas</th>
              <th className="text-right px-2 py-2 font-semibold text-red-600 uppercase tracking-wider text-[10px]">Saídas</th>
              <th className="text-right px-2 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Líquido</th>
              <th className="text-right px-2 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Saldo</th>
              <th className="text-left  px-4 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px] w-40">Projeção</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-slate-800/60 bg-slate-950/30">
              <td className="px-4 py-2 text-slate-600">—</td>
              <td className="px-2 py-2 text-slate-400 font-medium">Hoje</td>
              <td colSpan={3}></td>
              <td className={`px-2 py-2 text-right tabular-nums font-bold ${saldoAtual >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(saldoAtual)}</td>
              <td className="px-4 py-2">
                <div className="relative h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="absolute top-0 left-0 h-full" style={{ width: `${barPos(saldoAtual)}%`, backgroundColor: saldoAtual >= 0 ? '#10b981' : '#ef4444' }} />
                </div>
              </td>
            </tr>
            {semanas.map(s => {
              const negativo = s.saldoAcumulado < 0
              return (
                <tr key={s.semanaIdx} className={`border-t border-slate-800/60 hover:bg-slate-800/30 ${negativo ? 'bg-red-950/20' : ''}`}>
                  <td className="px-4 py-2 text-slate-600 tabular-nums">{s.semanaIdx}</td>
                  <td className="px-2 py-2 text-slate-300">{s.label}</td>
                  <td className="px-2 py-2 text-right text-emerald-400/70 tabular-nums">
                    {s.entradas > 0 ? <><span>{fmt(s.entradas)}</span><span className="text-[9px] text-slate-600 ml-1">({s.qtdEntradas})</span></> : '—'}
                  </td>
                  <td className="px-2 py-2 text-right text-red-400/70 tabular-nums">
                    {s.saidas > 0 ? <><span>{fmt(s.saidas)}</span><span className="text-[9px] text-slate-600 ml-1">({s.qtdSaidas})</span></> : '—'}
                  </td>
                  <td className={`px-2 py-2 text-right tabular-nums ${s.saldoSemana >= 0 ? 'text-amber-400/70' : 'text-red-400/70'}`}>
                    {s.saldoSemana !== 0 ? fmt(s.saldoSemana) : '—'}
                  </td>
                  <td className={`px-2 py-2 text-right tabular-nums font-bold ${negativo ? 'text-red-400' : 'text-emerald-400'}`}>
                    {fmt(s.saldoAcumulado)}
                  </td>
                  <td className="px-4 py-2">
                    <div className="relative h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className="absolute top-0 left-0 h-full" style={{ width: `${barPos(s.saldoAcumulado)}%`, backgroundColor: negativo ? '#ef4444' : '#10b981' }} />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Aba Bancos: Posição por conta ───────────────────────────────────────────

function AbaBancos({ bancos }: { bancos: BancoItem[] }) {
  const total = bancos.reduce((s, b) => s + b.saldo, 0)
  const positivos = bancos.filter(b => b.saldo > 0)
  const negativos = bancos.filter(b => b.saldo < 0)
  const totPos = positivos.reduce((s, b) => s + b.saldo, 0)
  const totNeg = negativos.reduce((s, b) => s + b.saldo, 0)

  return (
    <div className="space-y-4">
      {/* Resumo */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-emerald-950/30 border border-emerald-900/40 rounded-xl p-4">
          <h3 className="text-[10px] text-emerald-300 uppercase tracking-wider font-semibold">Em conta (positivo)</h3>
          <p className="text-xl text-emerald-400 font-bold tabular-nums mt-2">{fmt(totPos)}</p>
          <p className="text-[10px] text-slate-500 mt-1">{positivos.length} {positivos.length === 1 ? 'conta' : 'contas'}</p>
        </div>
        <div className="bg-red-950/30 border border-red-900/40 rounded-xl p-4">
          <h3 className="text-[10px] text-red-300 uppercase tracking-wider font-semibold">Contas no vermelho</h3>
          <p className="text-xl text-red-400 font-bold tabular-nums mt-2">{fmt(totNeg)}</p>
          <p className="text-[10px] text-slate-500 mt-1">{negativos.length} {negativos.length === 1 ? 'conta' : 'contas'}</p>
        </div>
        <div className={`bg-slate-900 border ${total >= 0 ? 'border-emerald-800/40' : 'border-red-800/40'} rounded-xl p-4`}>
          <h3 className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Saldo Consolidado</h3>
          <p className={`text-xl font-bold tabular-nums mt-2 ${total >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(total)}</p>
          <p className="text-[10px] text-slate-500 mt-1">{bancos.length} contas no total</p>
        </div>
      </div>

      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-950/50">
              <tr>
                <th className="text-left  px-4 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Empresa</th>
                <th className="text-left  px-2 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Conta</th>
                <th className="text-left  px-2 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Número</th>
                <th className="text-right px-2 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Saldo</th>
                <th className="text-left  px-4 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Fonte</th>
              </tr>
            </thead>
            <tbody>
              {bancos.map((b, i) => (
                <tr key={i} className={`border-t border-slate-800/60 hover:bg-slate-800/30 ${!b.temMatch ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-2 text-slate-300">{b.empresa}</td>
                  <td className="px-2 py-2 text-slate-200">{b.banco}</td>
                  <td className="px-2 py-2 text-slate-500 tabular-nums">{b.numero}</td>
                  <td className={`px-2 py-2 text-right tabular-nums font-medium ${b.saldo > 0 ? 'text-emerald-400' : b.saldo < 0 ? 'text-red-400' : 'text-slate-500'}`}>{fmt(b.saldo)}</td>
                  <td className="px-4 py-2 text-[10px] text-slate-600 uppercase">
                    {b.temMatch ? b.fonte : <span className="text-amber-500/70">⚠ sem match</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Aba Lançamentos: próximos 90 dias ───────────────────────────────────────

function AbaLancamentos({ lancamentos }: { lancamentos: LancamentoItem[] }) {
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'receita' | 'despesa'>('todos')
  const filtrados = filtroTipo === 'todos' ? lancamentos : lancamentos.filter(l => l.tipo === filtroTipo)

  const totalReceita = filtrados.filter(l => l.tipo === 'receita').reduce((s, l) => s + l.valor, 0)
  const totalDespesa = filtrados.filter(l => l.tipo === 'despesa').reduce((s, l) => s + l.valor, 0)

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
      <div className="p-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Lançamentos previstos — próximos 90 dias</h3>
          <p className="text-[10px] text-slate-500 mt-0.5">
            {filtrados.length} lançamento(s) · entradas {fmt(totalReceita)} · saídas {fmt(totalDespesa)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(['todos', 'receita', 'despesa'] as const).map(t => (
            <button
              key={t}
              onClick={() => setFiltroTipo(t)}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                filtroTipo === t
                  ? 'bg-slate-700 text-white'
                  : 'bg-slate-950 text-slate-500 hover:text-slate-300'
              }`}
            >
              {t === 'todos' ? 'Todos' : t === 'receita' ? '↗ Entradas' : '↘ Saídas'}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto max-h-[600px]">
        <table className="w-full text-xs">
          <thead className="bg-slate-950/50 sticky top-0">
            <tr>
              <th className="text-left  px-4 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Vencimento</th>
              <th className="text-left  px-2 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Empresa</th>
              <th className="text-left  px-2 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Descrição</th>
              <th className="text-left  px-2 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Categoria</th>
              <th className="text-right px-2 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Dias</th>
              <th className="text-right px-4 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Valor</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map(l => (
              <tr key={l.id} className="border-t border-slate-800/60 hover:bg-slate-800/30">
                <td className="px-4 py-2 text-slate-400 tabular-nums">
                  {new Date(l.data + 'T00:00:00').toLocaleDateString('pt-BR')}
                </td>
                <td className="px-2 py-2 text-slate-500 truncate max-w-[100px]">{l.empresa}</td>
                <td className="px-2 py-2 text-slate-200 truncate max-w-[300px]">{l.descricao}</td>
                <td className="px-2 py-2 text-slate-600 truncate max-w-[180px]">{l.categoria}</td>
                <td className="px-2 py-2 text-right text-slate-500 tabular-nums">
                  {l.diasAteVencer === 0 ? <span className="text-amber-400">hoje</span> : `+${l.diasAteVencer}d`}
                </td>
                <td className={`px-4 py-2 text-right tabular-nums font-medium ${l.tipo === 'receita' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {l.tipo === 'receita' ? '+' : '-'}{fmt(l.valor)}
                </td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-600 text-xs">Nenhum lançamento previsto neste período</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
