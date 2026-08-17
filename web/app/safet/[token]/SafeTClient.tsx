'use client'

import {
  Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart,
  Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { DadosEmpresa } from '@/lib/compartilhado/acesso'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

const brlExato = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

const mesLabel = (m: string) => {
  const [ano, mes] = m.split('-')
  return `${MESES[Number(mes) - 1] ?? mes}/${ano.slice(2)}`
}

const dataCurta = (iso: string) => {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

// Cores extraídas do próprio logotipo (amostragem dos pixels): o azul e o
// amarelo da marca e o verde do capacete. Em tema claro elas podem ser usadas
// como são — no tema escuro anterior precisavam ser clareadas para ter contraste.
const AZUL = '#00549C'
const AMARELO = '#FCC024'
const VERDE = '#18A854'
const VERMELHO = '#DC2626'
const CINZA = '#94A3B8'

// Tons do gráfico no tema claro: grade discreta e eixos legíveis sem competir
// com os dados.
const GRADE = '#E2E8F0'
const EIXO = '#94A3B8'

function CardKPI({
  titulo, valor, detalhe, cor,
}: { titulo: string; valor: string; detalhe?: string; cor?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <p className="text-xs uppercase tracking-wider text-slate-500 mb-2">{titulo}</p>
      <p className="text-2xl font-semibold tabular-nums" style={{ color: cor ?? '#0F172A' }}>
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
    <div className="bg-white border border-slate-300 rounded-lg px-3 py-2 shadow-lg">
      <p className="text-xs text-slate-500 mb-1">{label ? mesLabel(label) : ''}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-sm tabular-nums font-medium" style={{ color: p.color }}>
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
  const maxNr = Math.max(...(prod?.topNormas ?? []).map(n => n.turmas), 1)
  const maxUnidade = Math.max(...(prod?.unidades ?? []).map(u => u.qtd), 1)
  const maxCliente = Math.max(...(prod?.topClientes ?? []).map(c => c.valor), 1)

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* ── Cabeçalho ────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/safet-logo.png" alt="SafeT Treinamentos"
                 width={160} height={57} className="h-11 w-auto block" />
            <div className="border-l border-slate-200 pl-5">
              <h1 className="text-lg font-semibold text-slate-900 leading-tight">
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
            <p className="text-sm text-slate-700 font-medium">{periodo}</p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* ── Divisão societária ─────────────────────────────────────────── */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-6">
            <h2 className="text-sm font-semibold text-slate-900">Resultado da sociedade</h2>
            <span className="text-xs text-slate-500">
              acumulado desde o início · divisão 50% / 50%
            </span>
          </div>

          <div className="grid md:grid-cols-3 gap-6 items-center">
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-500 mb-2">
                Lucro acumulado
              </p>
              <p className="text-3xl font-semibold tabular-nums"
                 style={{ color: resultado >= 0 ? VERDE : VERMELHO }}>
                {brlExato(resultado)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                margem de {margem.toFixed(1)}% sobre a receita
              </p>
            </div>

            <div className="md:col-span-2 grid sm:grid-cols-2 gap-4">
              <div className="rounded-lg p-4 border" style={{ borderColor: `${AZUL}33`, background: `${AZUL}0A` }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: AZUL }} />
                  <p className="text-xs text-slate-600">Sócio · 50%</p>
                </div>
                <p className="text-xl font-semibold tabular-nums" style={{ color: AZUL }}>
                  {brlExato(resultado / 2)}
                </p>
              </div>
              <div className="rounded-lg p-4 border" style={{ borderColor: '#CBD5E1', background: '#F8FAFC' }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-slate-400" />
                  <p className="text-xs text-slate-600">GP SafeWork · 50%</p>
                </div>
                <p className="text-xl font-semibold text-slate-700 tabular-nums">
                  {brlExato(resultado / 2)}
                </p>
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-500 mt-6 pt-4 border-t border-slate-200">
            Resultado apurado por competência (receita menos despesa do período).
            Não considera retiradas ou distribuições já realizadas, nem provisão
            de impostos sobre o lucro.
          </p>
        </section>

        {/* ── KPIs ───────────────────────────────────────────────────────── */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <CardKPI titulo="Receita" valor={brl(totalReceita)}
                   detalhe={`${dados.serie.length} meses de operação`} />
          <CardKPI titulo="Despesa" valor={brl(totalDespesa)} />
          <CardKPI titulo="Lucro" valor={brl(resultado)}
                   cor={resultado >= 0 ? VERDE : VERMELHO} />
          <CardKPI titulo="Margem" valor={`${margem.toFixed(1)}%`}
                   cor={margem >= 0 ? VERDE : VERMELHO} />
        </section>

        {/* ── Balanço por ano ────────────────────────────────────────────── */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900 mb-1">Balanço por exercício</h2>
          <p className="text-xs text-slate-500 mb-5">
            Resultado de cada ano e a cota de 50% correspondente
          </p>
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <th className="text-left font-medium pb-3">Exercício</th>
                  <th className="text-right font-medium pb-3">Receita</th>
                  <th className="text-right font-medium pb-3">Despesa</th>
                  <th className="text-right font-medium pb-3">Lucro</th>
                  <th className="text-right font-medium pb-3">Margem</th>
                  <th className="text-right font-medium pb-3">50% cada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dados.porAno.map(a => (
                  <tr key={a.ano}>
                    <td className="py-3 text-slate-700 font-medium">
                      {a.ano}
                      {a.parcial && (
                        <span className="ml-2 text-[10px] uppercase tracking-wider font-normal"
                              style={{ color: '#B45309' }}>
                          parcial
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-right tabular-nums text-slate-700">{brl(a.receita)}</td>
                    <td className="py-3 text-right tabular-nums text-slate-500">{brl(a.despesa)}</td>
                    <td className="py-3 text-right tabular-nums font-medium"
                        style={{ color: a.lucro >= 0 ? VERDE : VERMELHO }}>
                      {brl(a.lucro)}
                    </td>
                    <td className="py-3 text-right tabular-nums text-slate-500">
                      {a.margem.toFixed(1)}%
                    </td>
                    <td className="py-3 text-right tabular-nums font-medium" style={{ color: AZUL }}>
                      {brl(a.lucro / 2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 font-semibold">
                  <td className="pt-3 text-slate-900">Acumulado</td>
                  <td className="pt-3 text-right tabular-nums text-slate-900">{brl(totalReceita)}</td>
                  <td className="pt-3 text-right tabular-nums text-slate-700">{brl(totalDespesa)}</td>
                  <td className="pt-3 text-right tabular-nums"
                      style={{ color: resultado >= 0 ? VERDE : VERMELHO }}>
                    {brl(resultado)}
                  </td>
                  <td className="pt-3 text-right tabular-nums text-slate-700">{margem.toFixed(1)}%</td>
                  <td className="pt-3 text-right tabular-nums" style={{ color: AZUL }}>
                    {brl(resultado / 2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {/* ── Evolução ───────────────────────────────────────────────────── */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900 mb-1">Evolução mensal</h2>
          <p className="text-xs text-slate-500 mb-5">
            Receita e despesa por competência, com o resultado de cada mês
          </p>
          <div className="h-72 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dados.serie}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRADE} vertical={false} />
                <XAxis dataKey="mes" tickFormatter={mesLabel} stroke={EIXO}
                       fontSize={11} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={v => brl(v)} stroke={EIXO} fontSize={11}
                       tickLine={false} axisLine={false} width={78} />
                <Tooltip content={<TooltipCustom />} cursor={{ fill: '#0F172A08' }} />
                <Bar dataKey="receita" name="Receita" fill={AZUL} radius={[3, 3, 0, 0]} />
                <Bar dataKey="despesa" name="Despesa" fill={CINZA} radius={[3, 3, 0, 0]} />
                <Line type="monotone" dataKey="resultado" name="Resultado"
                      stroke={VERDE} strokeWidth={2} dot={{ r: 3, fill: VERDE }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* ── Produção ───────────────────────────────────────────────────── */}
        {prod && prod.turmasTotal > 0 ? (
          <>
            <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
              <div className="mb-5">
                <h2 className="text-sm font-semibold text-slate-900">Produção — Treinamentos</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Turmas contratadas, por mês
                  {prod.periodoDe && (
                    <> · base de {dataCurta(prod.periodoDe)} a {dataCurta(prod.periodoAte!)}</>
                  )}
                </p>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <CardKPI titulo="Turmas realizadas" valor={String(prod.turmasTotal)} cor={AZUL}
                         detalhe={`em ${prod.totalVendas} contratos`} />
                <CardKPI titulo="Clientes atendidos" valor={String(prod.clientesDistintos)}
                         detalhe={`${prod.clientesNovos} novos`} />
                <CardKPI titulo="Participantes confirmados"
                         valor={String(prod.participantesConfirmados)}
                         detalhe={`${prod.turmasComLotacao} de ${prod.turmasTotal} turmas`} />
                <CardKPI titulo="Volume contratado" valor={brl(prod.totalValor)}
                         detalhe={`média ${brl(prod.turmasTotal ? prod.totalValor / prod.turmasTotal : 0)} por turma`} />
              </div>

              <div className="h-64 -ml-2">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={prod.porMes}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRADE} vertical={false} />
                    <XAxis dataKey="mes" tickFormatter={mesLabel} stroke={EIXO}
                           fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="qtd" stroke={EIXO} fontSize={11}
                           tickLine={false} axisLine={false} width={32} />
                    <YAxis yAxisId="val" orientation="right" tickFormatter={v => brl(v)}
                           stroke={EIXO} fontSize={11} tickLine={false} axisLine={false} width={72} />
                    <Tooltip
                      cursor={{ fill: '#0F172A08' }}
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null
                        const d = payload[0].payload as {
                          turmas: number; participantes: number; valor: number
                        }
                        return (
                          <div className="bg-white border border-slate-300 rounded-lg px-3 py-2 shadow-lg">
                            <p className="text-xs text-slate-500 mb-1">{mesLabel(String(label))}</p>
                            <p className="text-sm font-medium tabular-nums" style={{ color: AZUL }}>
                              {d.turmas} turma{d.turmas === 1 ? '' : 's'}
                            </p>
                            {d.participantes > 0 && (
                              <p className="text-xs text-slate-500 tabular-nums">
                                {d.participantes} participantes confirmados
                              </p>
                            )}
                            <p className="text-sm font-medium tabular-nums text-slate-700">
                              {brlExato(d.valor)}
                            </p>
                          </div>
                        )
                      }}
                    />
                    <Bar yAxisId="qtd" dataKey="turmas" name="Turmas"
                         fill={AZUL} radius={[3, 3, 0, 0]} />
                    <Area yAxisId="val" type="monotone" dataKey="valor" name="Valor"
                          stroke={AMARELO} fill={`${AMARELO}30`} strokeWidth={2} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              <p className="text-xs text-slate-500 mt-5 pt-4 border-t border-slate-200">
                Cada turma contratada conta uma vez — um contrato pode conter
                várias (ex. NR-23 + NR-07 na mesma negociação).
                {prod.turmasComLotacao < prod.turmasTotal && (
                  <>
                    {' '}O número de participantes aparece só nas{' '}
                    {prod.turmasComLotacao} turmas em que o contrato registra a
                    quantidade de vagas; nas outras{' '}
                    {prod.turmasTotal - prod.turmasComLotacao} (turma fechada) a
                    lotação não é registrada.
                  </>
                )}
              </p>
            </section>

            {/* ── Normas e unidades ──────────────────────────────────────── */}
            <section className="grid md:grid-cols-2 gap-6">
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-900 mb-1">
                  Normas mais treinadas
                </h2>
                <p className="text-xs text-slate-500 mb-5">
                  Turmas realizadas de cada NR ou tema
                </p>
                <ul className="space-y-2.5">
                  {prod.topNormas.map(n => (
                    <li key={n.norma} className="flex items-center gap-3">
                      <span className="text-sm text-slate-700 w-36 shrink-0 truncate">{n.norma}</span>
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full"
                             style={{ width: `${(n.turmas / maxNr) * 100}%`, background: AZUL }} />
                      </div>
                      <span className="text-sm text-slate-600 tabular-nums w-8 text-right font-medium">
                        {n.turmas}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-900 mb-1">Por unidade</h2>
                <p className="text-xs text-slate-500 mb-5">
                  Onde os treinamentos foram realizados
                </p>
                <ul className="space-y-3">
                  {prod.unidades.slice(0, 6).map(u => (
                    <li key={u.unidade}>
                      <div className="flex justify-between text-sm mb-1.5 gap-3">
                        <span className="text-slate-700 truncate">
                          {u.unidade.replace(/SafeWork /g, '')}
                        </span>
                        <span className="text-slate-500 tabular-nums shrink-0">
                          {u.qtd} · {brl(u.valor)}
                        </span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full"
                             style={{ width: `${(u.qtd / maxUnidade) * 100}%`, background: AZUL }} />
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="mt-5 pt-4 border-t border-slate-200 flex flex-wrap gap-4 text-xs">
                  {prod.modalidades.map(m => (
                    <span key={m.modalidade} className="text-slate-500">
                      {m.modalidade}:{' '}
                      <strong className="text-slate-800 tabular-nums">{m.qtd}</strong>
                    </span>
                  ))}
                  {prod.cortesias > 0 && (
                    <span className="text-slate-500">
                      Cortesias: <strong className="text-slate-800 tabular-nums">{prod.cortesias}</strong>
                    </span>
                  )}
                </div>
              </div>
            </section>

            {/* ── Principais clientes ────────────────────────────────────── */}
            <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900 mb-1">Principais clientes</h2>
              <p className="text-xs text-slate-500 mb-5">Por volume contratado no período</p>
              <ul className="space-y-3">
                {prod.topClientes.map(c => (
                  <li key={c.cliente}>
                    <div className="flex justify-between text-sm mb-1.5 gap-3">
                      <span className="text-slate-700 truncate">
                        {c.cliente}
                        <span className="text-slate-400 ml-2 text-xs">{c.qtd}x</span>
                      </span>
                      <span className="text-slate-800 tabular-nums shrink-0 font-medium">
                        {brl(c.valor)}
                      </span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full"
                           style={{ width: `${(c.valor / maxCliente) * 100}%`, background: AMARELO }} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : (
          <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900 mb-1">Produção — Treinamentos</h2>
            <p className="text-xs text-slate-500">
              Sem dados de produção importados para este período.
            </p>
          </section>
        )}

        {/* ── Composição ─────────────────────────────────────────────────── */}
        <section className="grid md:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900 mb-5">Receita por serviço</h2>
            <ul className="space-y-3">
              {dados.receitas.map(r => (
                <li key={r.categoria}>
                  <div className="flex justify-between text-sm mb-1.5 gap-3">
                    <span className="text-slate-700 truncate">{r.categoria}</span>
                    <span className="text-slate-800 tabular-nums shrink-0 font-medium">
                      {brl(r.total)}
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full"
                         style={{ width: `${(r.total / maxCategoria) * 100}%`, background: AZUL }} />
                  </div>
                </li>
              ))}
              {!dados.receitas.length && (
                <li className="text-sm text-slate-500">Sem receita no período.</li>
              )}
            </ul>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900 mb-5">Despesa por categoria</h2>
            <ul className="space-y-3">
              {dados.despesas.slice(0, 8).map(r => (
                <li key={r.categoria}>
                  <div className="flex justify-between text-sm mb-1.5 gap-3">
                    <span className="text-slate-700 truncate">{r.categoria}</span>
                    <span className="text-slate-800 tabular-nums shrink-0 font-medium">
                      {brl(r.total)}
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full"
                         style={{ width: `${(r.total / maxDespesa) * 100}%`, background: CINZA }} />
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
        <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900 mb-5">Resultado por mês</h2>
          <div className="h-56 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dados.serie}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRADE} vertical={false} />
                <XAxis dataKey="mes" tickFormatter={mesLabel} stroke={EIXO}
                       fontSize={11} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={v => brl(v)} stroke={EIXO} fontSize={11}
                       tickLine={false} axisLine={false} width={78} />
                <Tooltip content={<TooltipCustom />} cursor={{ fill: '#0F172A08' }} />
                <Bar dataKey="resultado" name="Resultado" radius={[3, 3, 0, 0]}>
                  {dados.serie.map((p, i) => (
                    <Cell key={i} fill={p.resultado >= 0 ? VERDE : VERMELHO} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </main>

      <footer className="bg-white border-t border-slate-200 mt-4">
        <div className="max-w-6xl mx-auto px-6 py-5 flex flex-wrap justify-between gap-2 text-xs text-slate-500">
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
