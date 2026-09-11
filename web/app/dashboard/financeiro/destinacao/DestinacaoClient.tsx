'use client'

// A cascata do lucro: o que a operação gerou e para onde foi.
//
// Cleber definiu a estrutura: "o orçamento da operação tem que ficar no lucro,
// o que dá negativo tem que ser o caixa por causa dos investimentos e
// empréstimos, mas a ideia é poder visualizar tudo para poder destinar o
// dinheiro — deu lucro, para onde vai, empréstimo ou conta atrasada ou
// distribuição".
//
// Duas camadas: a operação responde se o negócio dá lucro; empréstimo,
// parcelamento e investimento são destinação do que sobrou, não despesa de
// operação — por isso ficam abaixo da linha.

import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine, Cell,
} from 'recharts'

export type LinhaDestinacao = {
  mes: number
  receita: number; custo_operacional: number; lucro_operacional: number
  investimentos: number; emprestimos: number; parcelamentos: number; financeiras: number
  sobra: number; lucro_orcado: number; fechado: boolean
}

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)

const tooltipStyle = {
  backgroundColor: '#fff', border: '1px solid #e2e8f0',
  fontSize: 12, borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
}

export default function DestinacaoClient({ linhas, ano }: { linhas: LinhaDestinacao[]; ano: number }) {
  const fechados = linhas.filter(l => l.fechado)
  const abertos = linhas.filter(l => !l.fechado)

  const soma = (ls: LinhaDestinacao[], campo: keyof LinhaDestinacao) =>
    ls.reduce((s, l) => s + Number(l[campo] ?? 0), 0)

  const lucro = soma(fechados, 'lucro_operacional')
  const orcado = soma(fechados, 'lucro_orcado')
  const destinado = soma(fechados, 'investimentos') + soma(fechados, 'emprestimos')
    + soma(fechados, 'parcelamentos') + soma(fechados, 'financeiras')
  const sobra = lucro - destinado

  // O que já está agendado para os meses que ainda não fecharam. Se for quase
  // nada, a tela precisa dizer — senão o futuro parece livre de compromisso.
  const programadoFuturo = soma(abertos, 'investimentos') + soma(abertos, 'emprestimos')
    + soma(abertos, 'parcelamentos') + soma(abertos, 'financeiras')
  const mediaDestinadaMes = fechados.length > 0 ? destinado / fechados.length : 0

  const dados = linhas.map(l => ({
    mes: MESES[l.mes - 1],
    'Lucro da operação': Math.round(l.lucro_operacional),
    'Investimentos': -Math.round(l.investimentos),
    'Empréstimos': -Math.round(l.emprestimos),
    'Parcelamentos': -Math.round(l.parcelamentos),
    'Financeiras': -Math.round(l.financeiras),
    'Sobra': Math.round(l.sobra),
    'Orçado': Math.round(l.lucro_orcado),
    fechado: l.fechado,
  }))

  const cartao = (rot: string, valor: number, sub: string, cor = 'text-slate-800') => (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-[10px] text-slate-400 uppercase tracking-wider">{rot}</p>
      <p className={`text-xl font-bold tabular-nums ${cor}`}>{brl(valor)}</p>
      <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cartao('Lucro da operação', lucro, `${fechados.length} meses fechados`,
          lucro >= 0 ? 'text-emerald-700' : 'text-red-700')}
        {cartao('Orçado para o período', orcado,
          orcado !== 0 ? `realizado é ${((lucro / orcado - 1) * 100).toFixed(0)}% do orçado` : 'sem orçamento')}
        {cartao('Destinado', destinado, 'empréstimo · parcela · investimento')}
        {cartao('Sobrou em caixa', sobra, 'depois de tudo',
          sobra >= 0 ? 'text-emerald-700' : 'text-red-700')}
      </div>

      {abertos.length > 0 && programadoFuturo < mediaDestinadaMes * abertos.length * 0.5 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
          <p className="text-xs text-amber-900">
            <strong>Os meses à frente estão quase sem compromisso lançado.</strong> Para
            {' '}{MESES[abertos[0].mes - 1]}–{MESES[abertos[abertos.length - 1].mes - 1]} há{' '}
            {brl(programadoFuturo)} de empréstimo, parcela e investimento no Conta Azul, contra uma
            média de {brl(mediaDestinadaMes)} por mês nos meses fechados. Empréstimo e parcelamento
            têm parcela conhecida — se não estiverem agendados, o caixa projetado fica otimista.
          </p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-bold text-slate-800 mb-1">Lucro e destinação — {ano}</h2>
        <p className="text-[11px] text-slate-500 mb-4">
          A barra verde é o lucro da operação; as barras abaixo do zero são para onde ele foi.
          A linha preta é o orçado. Meses ainda não fechados aparecem esmaecidos.
        </p>
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={dados} margin={{ top: 8, right: 12, left: 4, bottom: 0 }} stackOffset="sign">
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#64748b' }} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }}
                   tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [brl(Math.abs(Number(v))), String(n)]} />
            <Legend wrapperStyle={{ fontSize: 11 }} iconSize={9} />
            <ReferenceLine y={0} stroke="#475569" />
            <Bar dataKey="Lucro da operação" stackId="a" fill="#059669">
              {dados.map((d, i) => <Cell key={i} fillOpacity={d.fechado ? 1 : 0.3} />)}
            </Bar>
            <Bar dataKey="Investimentos" stackId="a" fill="#8b5cf6">
              {dados.map((d, i) => <Cell key={i} fillOpacity={d.fechado ? 1 : 0.3} />)}
            </Bar>
            <Bar dataKey="Empréstimos" stackId="a" fill="#f59e0b">
              {dados.map((d, i) => <Cell key={i} fillOpacity={d.fechado ? 1 : 0.3} />)}
            </Bar>
            <Bar dataKey="Parcelamentos" stackId="a" fill="#ef4444">
              {dados.map((d, i) => <Cell key={i} fillOpacity={d.fechado ? 1 : 0.3} />)}
            </Bar>
            <Bar dataKey="Financeiras" stackId="a" fill="#64748b">
              {dados.map((d, i) => <Cell key={i} fillOpacity={d.fechado ? 1 : 0.3} />)}
            </Bar>
            <Line type="monotone" dataKey="Orçado" stroke="#1e293b" strokeWidth={2}
                  strokeDasharray="4 3" dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-bold text-slate-800 mb-3">Mês a mês</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 border-b border-slate-200">
                <th className="text-left font-medium py-2">Mês</th>
                <th className="text-right font-medium">Receita</th>
                <th className="text-right font-medium">Custo oper.</th>
                <th className="text-right font-medium">Lucro</th>
                <th className="text-right font-medium">Orçado</th>
                <th className="text-right font-medium">Invest.</th>
                <th className="text-right font-medium">Empr.</th>
                <th className="text-right font-medium">Parcel.</th>
                <th className="text-right font-medium">Sobra</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(l => (
                <tr key={l.mes} className={`border-b border-slate-100 ${l.fechado ? '' : 'opacity-50'}`}>
                  <td className="py-1.5 font-medium text-slate-700">
                    {MESES[l.mes - 1]}
                    {!l.fechado && <span className="ml-1 text-[9px] text-slate-400">aberto</span>}
                  </td>
                  <td className="text-right tabular-nums text-slate-600">{brl(l.receita)}</td>
                  <td className="text-right tabular-nums text-slate-500">{brl(l.custo_operacional)}</td>
                  <td className={`text-right tabular-nums font-semibold ${
                    l.lucro_operacional >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {brl(l.lucro_operacional)}
                  </td>
                  <td className={`text-right tabular-nums ${
                    l.lucro_orcado < 0 ? 'text-amber-700' : 'text-slate-400'}`}>
                    {brl(l.lucro_orcado)}
                  </td>
                  <td className="text-right tabular-nums text-slate-500">{brl(l.investimentos)}</td>
                  <td className="text-right tabular-nums text-slate-500">{brl(l.emprestimos)}</td>
                  <td className="text-right tabular-nums text-slate-500">{brl(l.parcelamentos)}</td>
                  <td className={`text-right tabular-nums font-semibold ${
                    l.sobra >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {brl(l.sobra)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-slate-400 mt-3">
          Orçado em âmbar é mês que o orçamento planeja no vermelho. Acontece porque a receita
          orçada acompanha a sazonalidade de 2025 e boa parte da despesa ficou com valor fixo —
          vale revisar esses meses na tela de Orçamento.
        </p>
      </div>
    </div>
  )
}
