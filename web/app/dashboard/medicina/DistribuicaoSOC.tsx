'use client'

// Onde os atendimentos acontecem e o que é feito neles — do espelho do SOC.
//
// Estas duas séries vinham de uma constante em lib/medicina/dados.ts, copiada
// à mão da planilha "Controle Atendimentos". A última extração é de 28/05/2026,
// então o painel mostrava a distribuição de janeiro a abril e parava — sem
// dizer que parava. Agora sai do banco e anda sozinho.

import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Cell, PieChart, Pie,
} from 'recharts'

export type LinhaUnidade = { categoria: 'propria' | 'credenciada' | 'indefinido'; unidade: string; consultas: number }
export type LinhaTipo    = { tipo: string; quantidade: number }

const tooltipStyle = {
  backgroundColor: '#ffffff', border: '1px solid #e2e8f0',
  fontSize: 12, borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
}

// Própria em verde, credenciada em azul, indefinido em âmbar — a cor já diz a
// categoria sem precisar de legenda.
const COR_CATEGORIA: Record<LinhaUnidade['categoria'], string> = {
  propria: '#10b981',
  credenciada: '#3b82f6',
  indefinido: '#f59e0b',
}

const ROTULO_CATEGORIA: Record<LinhaUnidade['categoria'], string> = {
  propria: 'Unidades próprias',
  credenciada: 'Rede credenciada',
  indefinido: 'Sem prestador identificado',
}

const CORES_EXAME = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444',
                     '#06b6d4', '#ec4899', '#84cc16', '#a855f7', '#14b8a6']

const num = (v: number) => v.toLocaleString('pt-BR')

export default function DistribuicaoSOC({ unidades, tipos, ano, mesCorrente }: {
  unidades: LinhaUnidade[]
  tipos: LinhaTipo[]
  ano: number
  /** 1-12. O ano está em curso e o rodapé precisa dizer isso. */
  mesCorrente: number
}) {
  if (!unidades.length && !tipos.length) return null

  const totalConsultas = unidades.reduce((s, u) => s + u.consultas, 0)

  const porCategoria = (['propria', 'credenciada', 'indefinido'] as const).map(cat => ({
    categoria: cat,
    consultas: unidades.filter(u => u.categoria === cat).reduce((s, u) => s + u.consultas, 0),
    locais: unidades.filter(u => u.categoria === cat).length,
  })).filter(c => c.consultas > 0)

  // A rede credenciada tem ~180 cidades: listar todas viraria um gráfico
  // ilegível. As próprias aparecem inteiras (são poucas e é onde a gestão
  // atua), a credenciada entra pelas maiores e o resto vira uma linha só —
  // que continua somando, para as partes fecharem com o total.
  const proprias = unidades.filter(u => u.categoria === 'propria')
    .sort((a, b) => b.consultas - a.consultas)
  const outras = unidades.filter(u => u.categoria !== 'propria')
    .sort((a, b) => b.consultas - a.consultas)
  const TOPO = 8
  const topoOutras = outras.slice(0, TOPO)
  const cauda = outras.slice(TOPO)
  const somaCauda = cauda.reduce((s, u) => s + u.consultas, 0)

  const barras = [
    ...proprias.map(u => ({ nome: u.unidade, consultas: u.consultas, cor: COR_CATEGORIA.propria })),
    ...topoOutras.map(u => ({
      nome: u.unidade,
      consultas: u.consultas,
      cor: COR_CATEGORIA[u.categoria],
    })),
    ...(somaCauda > 0
      ? [{ nome: `outros ${cauda.length} locais`, consultas: somaCauda, cor: '#cbd5e1' }]
      : []),
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-500">
          Onde e o quê — distribuição de {ano}
        </h2>
        <span className="text-[10px] text-slate-400">
          Espelho do SOC · janeiro a {['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][mesCorrente - 1]} · atualiza todo dia às 4h30
        </span>
      </div>

      {/* Resumo por categoria — a leitura de uma linha só */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {porCategoria.map(c => (
          <div key={c.categoria} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full" style={{ background: COR_CATEGORIA[c.categoria] }} />
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                {ROTULO_CATEGORIA[c.categoria]}
              </p>
            </div>
            <p className="text-2xl font-bold text-slate-800 tabular-nums">{num(c.consultas)}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {totalConsultas > 0 && `${((c.consultas / totalConsultas) * 100).toFixed(1)}% · `}
              {c.locais} {c.locais === 1 ? 'local' : 'locais'}
            </p>
          </div>
        ))}
      </div>

      {porCategoria.some(c => c.categoria === 'indefinido') && (
        <p className="text-[11px] text-amber-700 -mt-3">
          &ldquo;Sem prestador identificado&rdquo; são atendimentos cujo cadastro no SOC não é uma
          clínica — marcadores como <em>Atendimento JÁ PAGO</em>, <em>PRESTADOR VALOR R$0,00</em>,
          <em> AGUARDANDO SAFE HELP LIBERAR PRESTADOR</em> ou prestador em branco. Ficam à parte
          de propósito: jogá-los na rede credenciada faria a rede parecer maior do que é.
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Consultas por local — {ano}
          </h3>
          <p className="text-[10px] text-slate-400 mb-4">
            {num(totalConsultas)} consultas ocupacionais · verde é unidade própria
          </p>
          <ResponsiveContainer width="100%" height={Math.max(280, barras.length * 26)}>
            <BarChart data={barras} layout="vertical" margin={{ top: 4, right: 40, left: 100, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis type="category" dataKey="nome" tick={{ fontSize: 11, fill: '#475569' }} width={100} />
              <Tooltip contentStyle={tooltipStyle}
                       formatter={(v) => [num(Number(v)), 'Consultas']} />
              <Bar dataKey="consultas" radius={[0, 5, 5, 0]}>
                {barras.map((b, i) => <Cell key={i} fill={b.cor} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Mix de exames — {ano}
          </h3>
          <p className="text-[10px] text-slate-400 mb-4">
            Os {tipos.length} tipos mais realizados, incluindo a consulta
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={tipos} dataKey="quantidade" nameKey="tipo"
                   cx="50%" cy="50%" outerRadius={95} innerRadius={55}
                   label={(e: { percent?: number; name?: string }) =>
                     (e.percent ?? 0) >= 0.05 ? `${((e.percent ?? 0) * 100).toFixed(0)}%` : ''}
                   labelLine={false} fontSize={10}>
                {tipos.map((_, i) => <Cell key={i} fill={CORES_EXAME[i % CORES_EXAME.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle}
                       formatter={(v, n) => [num(Number(v)), String(n)]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3">
            {tipos.slice(0, 10).map((t, i) => (
              <div key={t.tipo} className="flex items-center gap-1.5 text-[10px] text-slate-500 min-w-0">
                <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: CORES_EXAME[i % CORES_EXAME.length] }} />
                <span className="truncate" title={t.tipo}>{t.tipo}</span>
                <span className="ml-auto tabular-nums shrink-0">{num(t.quantidade)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
