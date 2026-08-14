'use client'

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart,
  Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { DadosEmpresa } from '@/lib/compartilhado/acesso'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

const brlExato = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const mesLabel = (m: string) => {
  const [ano, mes] = m.split('-')
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  return `${nomes[Number(mes) - 1] ?? mes}/${ano.slice(2)}`
}

// Paleta: âmbar para receita/produção (marca), slate para despesa, tons de
// resultado por sinal. Escolhida para funcionar no tema escuro do painel.
const COR_RECEITA = '#f59e0b'
const COR_DESPESA = '#64748b'
const COR_POSITIVO = '#34d399'
const COR_NEGATIVO = '#f87171'

function CardKPI({
  titulo, valor, detalhe, cor,
}: { titulo: string; valor: string; detalhe?: string; cor?: string }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <p className="text-xs uppercase tracking-wider text-slate-500 mb-2">{titulo}</p>
      <p className="text-2xl font-semibold tabular-nums" style={{ color: cor ?? '#e2e8f0' }}>
        {valor}
      </p>
      {detalhe && <p className="text-xs text-slate-500 mt-1">{detalhe}</p>}
    </div>
  )
}

function TooltipCustom({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number; color?: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 shadow-xl">
      <p className="text-xs text-slate-400 mb-1">{label ? mesLabel(label) : ''}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-sm tabular-nums" style={{ color: p.color }}>
          {p.name}: {brlExato(p.value ?? 0)}
        </p>
      ))}
    </div>
  )
}

export default function SafeTClient({ dados, periodo }: { dados: DadosEmpresa; periodo: string }) {
  const totalReceita = dados.serie.reduce((s, p) => s + p.receita, 0)
  const totalDespesa = dados.serie.reduce((s, p) => s + p.despesa, 0)
  const resultado = totalReceita - totalDespesa
  const margem = totalReceita > 0 ? (resultado / totalReceita) * 100 : 0

  const totalTreinos = dados.treinamentos.reduce((s, t) => s + t.quantidade, 0)
  const faturadoTreinos = dados.treinamentos.reduce((s, t) => s + t.faturado, 0)
  const ticketGeral = totalTreinos > 0 ? faturadoTreinos / totalTreinos : 0

  const maxCategoria = Math.max(...dados.receitas.map(r => r.total), 1)
  const maxDespesa = Math.max(...dados.despesas.map(r => r.total), 1)

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* ── Cabeçalho ────────────────────────────────────────────────────── */}
      <header className="border-b border-slate-800 bg-slate-900/50">
        <div className="max-w-6xl mx-auto px-6 py-7 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* Logotipo provisório — trocar pelo arquivo oficial da marca */}
            <div className="w-12 h-12 rounded-xl bg-amber-500 flex items-center justify-center shrink-0">
              <span className="text-slate-950 font-bold text-lg tracking-tight">ST</span>
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-100 leading-tight">
                {dados.nome}
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                {dados.cnpj}
                {dados.cidade && ` · ${dados.cidade}/${dados.estado}`}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-slate-500">Demonstrativo</p>
            <p className="text-sm text-slate-300 font-medium">{periodo}</p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* ── KPIs ───────────────────────────────────────────────────────── */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <CardKPI titulo="Receita" valor={brl(totalReceita)} cor={COR_RECEITA}
                   detalhe={`${dados.serie.length} meses`} />
          <CardKPI titulo="Despesa" valor={brl(totalDespesa)} cor="#cbd5e1" />
          <CardKPI titulo="Resultado" valor={brl(resultado)}
                   cor={resultado >= 0 ? COR_POSITIVO : COR_NEGATIVO} />
          <CardKPI titulo="Margem" valor={`${margem.toFixed(1)}%`}
                   cor={margem >= 0 ? COR_POSITIVO : COR_NEGATIVO} />
        </section>

        {/* ── Evolução ───────────────────────────────────────────────────── */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-slate-300 mb-1">Evolução mensal</h2>
          <p className="text-xs text-slate-500 mb-5">
            Receita e despesa por competência, com o resultado de cada mês
          </p>
          <div className="h-72 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dados.serie}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="mes" tickFormatter={mesLabel} stroke="#64748b"
                       fontSize={11} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={v => brl(v)} stroke="#64748b" fontSize={11}
                       tickLine={false} axisLine={false} width={78} />
                <Tooltip content={<TooltipCustom />} cursor={{ fill: '#1e293b40' }} />
                <Bar dataKey="receita" name="Receita" fill={COR_RECEITA} radius={[3, 3, 0, 0]} />
                <Bar dataKey="despesa" name="Despesa" fill={COR_DESPESA} radius={[3, 3, 0, 0]} />
                <Line type="monotone" dataKey="resultado" name="Resultado"
                      stroke={COR_POSITIVO} strokeWidth={2}
                      dot={{ r: 3, fill: COR_POSITIVO }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* ── Produção ───────────────────────────────────────────────────── */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3 mb-1">
            <h2 className="text-sm font-semibold text-slate-300">Produção — Treinamentos</h2>
            <div className="flex gap-5 text-xs text-slate-400">
              <span><strong className="text-slate-200 tabular-nums">{totalTreinos}</strong> realizados</span>
              <span>ticket médio <strong className="text-slate-200 tabular-nums">{brlExato(ticketGeral)}</strong></span>
            </div>
          </div>
          <p className="text-xs text-slate-500 mb-5">
            Volume de treinamentos faturados e o valor médio de cada um
          </p>
          <div className="h-64 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dados.treinamentos}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="mes" tickFormatter={mesLabel} stroke="#64748b"
                       fontSize={11} tickLine={false} axisLine={false} />
                <YAxis yAxisId="qtd" stroke="#64748b" fontSize={11}
                       tickLine={false} axisLine={false} width={32} />
                <YAxis yAxisId="val" orientation="right" tickFormatter={v => brl(v)}
                       stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} width={72} />
                <Tooltip
                  cursor={{ fill: '#1e293b40' }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0].payload as typeof dados.treinamentos[number]
                    return (
                      <div className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 shadow-xl">
                        <p className="text-xs text-slate-400 mb-1">{mesLabel(String(label))}</p>
                        <p className="text-sm text-amber-400 tabular-nums">{d.quantidade} treinamentos</p>
                        <p className="text-sm text-slate-300 tabular-nums">{brlExato(d.faturado)}</p>
                        <p className="text-xs text-slate-500 tabular-nums">
                          ticket {brlExato(d.ticketMedio)}
                        </p>
                      </div>
                    )
                  }}
                />
                <Bar yAxisId="qtd" dataKey="quantidade" name="Treinamentos"
                     fill={COR_RECEITA} radius={[3, 3, 0, 0]} />
                <Area yAxisId="val" type="monotone" dataKey="faturado" name="Faturado"
                      stroke="#38bdf8" fill="#38bdf820" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* ── Composição ─────────────────────────────────────────────────── */}
        <section className="grid md:grid-cols-2 gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-slate-300 mb-5">Receita por serviço</h2>
            <ul className="space-y-3">
              {dados.receitas.map(r => (
                <li key={r.categoria}>
                  <div className="flex justify-between text-sm mb-1.5 gap-3">
                    <span className="text-slate-300 truncate">{r.categoria}</span>
                    <span className="text-slate-200 tabular-nums shrink-0">{brl(r.total)}</span>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full"
                         style={{ width: `${(r.total / maxCategoria) * 100}%`, background: COR_RECEITA }} />
                  </div>
                </li>
              ))}
              {!dados.receitas.length && (
                <li className="text-sm text-slate-500">Sem receita no período.</li>
              )}
            </ul>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-slate-300 mb-5">Despesa por categoria</h2>
            <ul className="space-y-3">
              {dados.despesas.slice(0, 8).map(r => (
                <li key={r.categoria}>
                  <div className="flex justify-between text-sm mb-1.5 gap-3">
                    <span className="text-slate-300 truncate">{r.categoria}</span>
                    <span className="text-slate-200 tabular-nums shrink-0">{brl(r.total)}</span>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full"
                         style={{ width: `${(r.total / maxDespesa) * 100}%`, background: COR_DESPESA }} />
                  </div>
                </li>
              ))}
              {!dados.despesas.length && (
                <li className="text-sm text-slate-500">Sem despesa no período.</li>
              )}
            </ul>
          </div>
        </section>

        {/* ── Resultado mês a mês ────────────────────────────────────────── */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-slate-300 mb-5">Resultado por mês</h2>
          <div className="h-56 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dados.serie}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="mes" tickFormatter={mesLabel} stroke="#64748b"
                       fontSize={11} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={v => brl(v)} stroke="#64748b" fontSize={11}
                       tickLine={false} axisLine={false} width={78} />
                <Tooltip content={<TooltipCustom />} cursor={{ fill: '#1e293b40' }} />
                <Bar dataKey="resultado" name="Resultado" radius={[3, 3, 0, 0]}>
                  {dados.serie.map((p, i) => (
                    <Cell key={i} fill={p.resultado >= 0 ? COR_POSITIVO : COR_NEGATIVO} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-800 mt-4">
        <div className="max-w-6xl mx-auto px-6 py-5 flex flex-wrap justify-between gap-2 text-xs text-slate-600">
          <span>
            Valores por competência, já sem transferências entre empresas do grupo
            e sem lançamentos cancelados.
          </span>
          {dados.atualizadoEm && (
            <span>
              Dados de{' '}
              {new Date(dados.atualizadoEm).toLocaleString('pt-BR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </span>
          )}
        </div>
      </footer>
    </div>
  )
}
