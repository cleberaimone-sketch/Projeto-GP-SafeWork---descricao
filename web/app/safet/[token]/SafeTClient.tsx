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

// Paleta tirada da marca SafeT (azul, amarelo e o verde do capacete), clareada
// o suficiente para ter contraste no fundo escuro — o azul original (#1560AC)
// desaparece sobre slate-950.
const COR_MARCA = '#60a5fa'    // azul SafeT
const COR_RECEITA = '#fbbf24'  // amarelo da faixa "TREINAMENTOS"
const COR_DESPESA = '#64748b'
const COR_POSITIVO = '#34d399' // verde do capacete
const COR_NEGATIVO = '#f87171'

const dataCurta = (iso: string) => {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

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

  const prod = dados.producao

  const maxCategoria = Math.max(...dados.receitas.map(r => r.total), 1)
  const maxDespesa = Math.max(...dados.despesas.map(r => r.total), 1)
  const maxNr = Math.max(...(prod?.topNrs ?? []).map(n => n.qtd), 1)
  const maxUnidade = Math.max(...(prod?.unidades ?? []).map(u => u.qtd), 1)
  const maxCliente = Math.max(...(prod?.topClientes ?? []).map(c => c.valor), 1)

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* ── Cabeçalho ────────────────────────────────────────────────────── */}
      <header className="border-b border-slate-800 bg-slate-900/50">
        <div className="max-w-6xl mx-auto px-6 py-7 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* O logotipo é azul sobre fundo claro; num chip branco ele mantém
                o contraste da marca em vez de sumir no fundo escuro da página. */}
            <div className="bg-white rounded-lg px-3 py-2 shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/safet-logo.png" alt="SafeT Treinamentos"
                   width={132} height={47}
                   className="h-9 w-auto block" />
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
            <p className="text-xs uppercase tracking-wider text-slate-500">
              Demonstrativo da sociedade
            </p>
            <p className="text-sm text-slate-300 font-medium">{periodo}</p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* ── Divisão societária ─────────────────────────────────────────── */}
        <section className="bg-gradient-to-br from-slate-900 to-slate-900/40 border border-amber-500/20 rounded-xl p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-6">
            <h2 className="text-sm font-semibold text-slate-200">
              Resultado da sociedade
            </h2>
            <span className="text-xs text-slate-500">
              acumulado desde o início · divisão 50% / 50%
            </span>
          </div>

          <div className="grid md:grid-cols-3 gap-5 items-center">
            <div className="md:col-span-1">
              <p className="text-xs uppercase tracking-wider text-slate-500 mb-2">
                Lucro acumulado
              </p>
              <p className="text-3xl font-semibold tabular-nums"
                 style={{ color: resultado >= 0 ? COR_POSITIVO : COR_NEGATIVO }}>
                {brlExato(resultado)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                margem de {margem.toFixed(1)}% sobre a receita
              </p>
            </div>

            <div className="md:col-span-2 grid sm:grid-cols-2 gap-4">
              <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <p className="text-xs text-slate-400">Sócio · 50%</p>
                </div>
                <p className="text-xl font-semibold text-amber-400 tabular-nums">
                  {brlExato(resultado / 2)}
                </p>
              </div>
              <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-sky-400" />
                  <p className="text-xs text-slate-400">GP SafeWork · 50%</p>
                </div>
                <p className="text-xl font-semibold text-sky-400 tabular-nums">
                  {brlExato(resultado / 2)}
                </p>
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-600 mt-5 pt-4 border-t border-slate-800">
            Resultado apurado por competência (receita menos despesa do período).
            Não considera retiradas ou distribuições já realizadas, nem provisão
            de impostos sobre o lucro.
          </p>
        </section>

        {/* ── KPIs ───────────────────────────────────────────────────────── */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <CardKPI titulo="Receita" valor={brl(totalReceita)} cor={COR_RECEITA}
                   detalhe={`${dados.serie.length} meses de operação`} />
          <CardKPI titulo="Despesa" valor={brl(totalDespesa)} cor="#cbd5e1" />
          <CardKPI titulo="Lucro" valor={brl(resultado)}
                   cor={resultado >= 0 ? COR_POSITIVO : COR_NEGATIVO} />
          <CardKPI titulo="Margem" valor={`${margem.toFixed(1)}%`}
                   cor={margem >= 0 ? COR_POSITIVO : COR_NEGATIVO} />
        </section>

        {/* ── Balanço por ano ────────────────────────────────────────────── */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-slate-300 mb-1">Balanço por exercício</h2>
          <p className="text-xs text-slate-500 mb-5">
            Resultado de cada ano e a cota de 50% correspondente
          </p>
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-slate-500 border-b border-slate-800">
                  <th className="text-left font-medium pb-3">Exercício</th>
                  <th className="text-right font-medium pb-3">Receita</th>
                  <th className="text-right font-medium pb-3">Despesa</th>
                  <th className="text-right font-medium pb-3">Lucro</th>
                  <th className="text-right font-medium pb-3">Margem</th>
                  <th className="text-right font-medium pb-3">50% cada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {dados.porAno.map(a => (
                  <tr key={a.ano}>
                    <td className="py-3 text-slate-300">
                      {a.ano}
                      {a.parcial && (
                        <span className="ml-2 text-[10px] uppercase tracking-wider text-amber-500/80">
                          parcial
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-right tabular-nums text-slate-300">{brl(a.receita)}</td>
                    <td className="py-3 text-right tabular-nums text-slate-400">{brl(a.despesa)}</td>
                    <td className="py-3 text-right tabular-nums font-medium"
                        style={{ color: a.lucro >= 0 ? COR_POSITIVO : COR_NEGATIVO }}>
                      {brl(a.lucro)}
                    </td>
                    <td className="py-3 text-right tabular-nums text-slate-400">
                      {a.margem.toFixed(1)}%
                    </td>
                    <td className="py-3 text-right tabular-nums text-amber-400">
                      {brl(a.lucro / 2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-700 font-medium">
                  <td className="pt-3 text-slate-200">Acumulado</td>
                  <td className="pt-3 text-right tabular-nums text-slate-200">{brl(totalReceita)}</td>
                  <td className="pt-3 text-right tabular-nums text-slate-300">{brl(totalDespesa)}</td>
                  <td className="pt-3 text-right tabular-nums"
                      style={{ color: resultado >= 0 ? COR_POSITIVO : COR_NEGATIVO }}>
                    {brl(resultado)}
                  </td>
                  <td className="pt-3 text-right tabular-nums text-slate-300">{margem.toFixed(1)}%</td>
                  <td className="pt-3 text-right tabular-nums text-amber-400">{brl(resultado / 2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
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
        {prod && prod.totalVendas > 0 ? (
          <>
            <section className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-3 mb-5">
                <div>
                  <h2 className="text-sm font-semibold text-slate-300">Produção — Treinamentos</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Turmas vendidas pelo comercial, por mês
                    {prod.periodoDe && (
                      <> · base de {dataCurta(prod.periodoDe)} a {dataCurta(prod.periodoAte!)}</>
                    )}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <CardKPI titulo="Treinamentos" valor={String(prod.totalVendas)} cor={COR_MARCA} />
                <CardKPI titulo="Clientes atendidos" valor={String(prod.clientesDistintos)}
                         detalhe={`${prod.clientesNovos} novos`} />
                <CardKPI titulo="Ticket médio"
                         valor={brl(prod.totalVendas ? prod.totalValor / prod.totalVendas : 0)} />
                <CardKPI titulo="Volume vendido" valor={brl(prod.totalValor)} cor={COR_RECEITA} />
              </div>

              <div className="h-64 -ml-2">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={prod.porMes}>
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
                        const d = payload[0].payload as { quantidade: number; valor: number }
                        return (
                          <div className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 shadow-xl">
                            <p className="text-xs text-slate-400 mb-1">{mesLabel(String(label))}</p>
                            <p className="text-sm tabular-nums" style={{ color: COR_MARCA }}>
                              {d.quantidade} treinamento{d.quantidade === 1 ? '' : 's'}
                            </p>
                            <p className="text-sm text-amber-400 tabular-nums">{brlExato(d.valor)}</p>
                          </div>
                        )
                      }}
                    />
                    <Bar yAxisId="qtd" dataKey="quantidade" name="Treinamentos"
                         fill={COR_MARCA} radius={[3, 3, 0, 0]} />
                    <Area yAxisId="val" type="monotone" dataKey="valor" name="Valor"
                          stroke={COR_RECEITA} fill={`${COR_RECEITA}18`} strokeWidth={2} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* ── NRs e unidades ─────────────────────────────────────────── */}
            <section className="grid md:grid-cols-2 gap-6">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                <h2 className="text-sm font-semibold text-slate-300 mb-1">
                  Normas mais treinadas
                </h2>
                <p className="text-xs text-slate-500 mb-5">
                  Quantas turmas de cada NR ou tema
                </p>
                <ul className="space-y-2.5">
                  {prod.topNrs.map(n => (
                    <li key={n.nr} className="flex items-center gap-3">
                      <span className="text-sm text-slate-300 w-40 shrink-0 truncate">{n.nr}</span>
                      <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full"
                             style={{ width: `${(n.qtd / maxNr) * 100}%`, background: COR_MARCA }} />
                      </div>
                      <span className="text-sm text-slate-400 tabular-nums w-8 text-right">{n.qtd}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                <h2 className="text-sm font-semibold text-slate-300 mb-1">Por unidade</h2>
                <p className="text-xs text-slate-500 mb-5">
                  Onde os treinamentos foram realizados
                </p>
                <ul className="space-y-3">
                  {prod.unidades.slice(0, 6).map(u => (
                    <li key={u.unidade}>
                      <div className="flex justify-between text-sm mb-1.5 gap-3">
                        <span className="text-slate-300 truncate">
                          {u.unidade.replace(/SafeWork /g, '')}
                        </span>
                        <span className="text-slate-400 tabular-nums shrink-0">
                          {u.qtd} · {brl(u.valor)}
                        </span>
                      </div>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full"
                             style={{ width: `${(u.qtd / maxUnidade) * 100}%`, background: COR_MARCA }} />
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="mt-5 pt-4 border-t border-slate-800 flex flex-wrap gap-4 text-xs">
                  {prod.modalidades.map(m => (
                    <span key={m.modalidade} className="text-slate-400">
                      {m.modalidade}:{' '}
                      <strong className="text-slate-200 tabular-nums">{m.qtd}</strong>
                    </span>
                  ))}
                  {prod.cortesias > 0 && (
                    <span className="text-slate-400">
                      Cortesias: <strong className="text-slate-200 tabular-nums">{prod.cortesias}</strong>
                    </span>
                  )}
                </div>
              </div>
            </section>

            {/* ── Principais clientes ────────────────────────────────────── */}
            <section className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <h2 className="text-sm font-semibold text-slate-300 mb-1">Principais clientes</h2>
              <p className="text-xs text-slate-500 mb-5">
                Por volume contratado no período
              </p>
              <ul className="space-y-3">
                {prod.topClientes.map(c => (
                  <li key={c.cliente}>
                    <div className="flex justify-between text-sm mb-1.5 gap-3">
                      <span className="text-slate-300 truncate">
                        {c.cliente}
                        <span className="text-slate-600 ml-2 text-xs">{c.qtd}x</span>
                      </span>
                      <span className="text-slate-200 tabular-nums shrink-0">{brl(c.valor)}</span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full"
                           style={{ width: `${(c.valor / maxCliente) * 100}%`, background: COR_RECEITA }} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : (
          <section className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-slate-300 mb-1">Produção — Treinamentos</h2>
            <p className="text-xs text-slate-500">
              Sem dados de produção importados para este período.
            </p>
          </section>
        )}

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
