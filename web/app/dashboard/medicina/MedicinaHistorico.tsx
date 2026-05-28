'use client'

import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell, PieChart, Pie,
} from 'recharts'
import type { ResumoAnualMedicina } from '@/lib/medicina/dados'

interface Props {
  historico: ResumoAnualMedicina[]
}

const tooltipStyle = {
  backgroundColor: '#ffffff',
  border: '1px solid #e2e8f0',
  fontSize: 12,
  borderRadius: 8,
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
}

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

const CORES_UNIDADE = [
  '#10b981', '#3b82f6', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
]

const CORES_EXAME: Record<string, string> = {
  'Consultas':       '#10b981',
  'Acuidade Visual': '#3b82f6',
  'Audiometria':     '#8b5cf6',
  'Espirometria':    '#f59e0b',
  'ECG':             '#ef4444',
  'EEG':             '#06b6d4',
}

export default function MedicinaHistorico({ historico }: Props) {
  const fechados = historico.filter(h => h.status !== 'pendente' && h.consultas_total > 0)
  if (fechados.length === 0) {
    return null
  }

  const refRecente = [...fechados].sort((a, b) => b.ano - a.ano)[0]
  const anoAnterior = fechados.find(h => h.ano === refRecente.ano - 1)

  // Série mensal — comparativo do ano de referência com o anterior (se disponível)
  const dadosMensais = MESES.map((m, i) => ({
    mes: m,
    [refRecente.ano]: refRecente.consultas_mensais[i] || null,
    [refRecente.ano - 1]: anoAnterior?.consultas_mensais[i] || null,
  }))

  // Série anual
  const serieAnual = fechados.map(h => ({
    ano: String(h.ano),
    consultas: h.consultas_total,
  }))

  // Distribuição por unidade no ano de referência
  const unidades = Object.entries(refRecente.atendimentos_por_unidade)
    .map(([unidade, atendimentos]) => ({ unidade, atendimentos: atendimentos! }))
    .sort((a, b) => b.atendimentos - a.atendimentos)

  // Mix de exames no ano de referência
  const exames = Object.entries(refRecente.exames_por_tipo)
    .map(([tipo, qty]) => ({ tipo, quantidade: qty! }))
    .sort((a, b) => b.quantidade - a.quantidade)

  const totalUnidades = unidades.reduce((a, b) => a + b.atendimentos, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-slate-500">Histórico Anual — Atendimentos Consolidados</h2>
        <span className="text-[10px] text-slate-400">
          Fonte: planilha &ldquo;Controle Atendimentos&rdquo; · Referência: {refRecente.ano}
        </span>
      </div>

      {/* Linha 1 — Consultas mensais + Total anual */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm lg:col-span-2">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Consultas Mensais — {refRecente.ano}
            {anoAnterior && <span className="ml-1 text-slate-400 normal-case font-normal text-[10px]">vs {anoAnterior.ano}</span>}
          </h3>
          <p className="text-[10px] text-slate-400 mb-4">
            Total {refRecente.ano}: <strong className="text-emerald-700">{refRecente.consultas_total.toLocaleString('pt-BR')}</strong>
            {anoAnterior && (
              <span className="text-slate-500"> · {anoAnterior.ano}: {anoAnterior.consultas_total.toLocaleString('pt-BR')}</span>
            )}
          </p>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={dadosMensais} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="mes" tick={{ fontSize: 12, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => v == null ? '—' : Number(v).toLocaleString('pt-BR')} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {anoAnterior && (
                <Line type="monotone" dataKey={String(anoAnterior.ano)} stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 3" dot={{ r: 3, fill: '#94a3b8' }} />
              )}
              <Line type="monotone" dataKey={String(refRecente.ano)} stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Total anual */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Total Anual — Consultas
          </h3>
          <p className="text-[10px] text-slate-400 mb-4">Série histórica disponível</p>
          {serieAnual.length === 1 ? (
            <div className="flex flex-col items-center justify-center h-[260px]">
              <p className="text-4xl font-bold text-emerald-700 tabular-nums">
                {serieAnual[0].consultas.toLocaleString('pt-BR')}
              </p>
              <p className="text-sm text-slate-500 mt-1">consultas em {serieAnual[0].ano}</p>
              <p className="text-[10px] text-slate-400 mt-4 text-center">
                Outros anos pendentes de importação
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={serieAnual} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="ano" tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => Number(v).toLocaleString('pt-BR')} />
                <Bar dataKey="consultas" fill="#10b981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Linha 2 — Distribuição por unidade + Mix de exames */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Atendimentos por Unidade — {refRecente.ano}
          </h3>
          <p className="text-[10px] text-slate-400 mb-4">
            Total: {totalUnidades.toLocaleString('pt-BR')} atendimentos
          </p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={unidades} layout="vertical" margin={{ top: 4, right: 30, left: 80, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis type="category" dataKey="unidade" tick={{ fontSize: 11, fill: '#475569' }} width={80} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v) => [Number(v).toLocaleString('pt-BR'), 'Atendimentos']}
              />
              <Bar dataKey="atendimentos" radius={[0, 6, 6, 0]}>
                {unidades.map((_, i) => (
                  <Cell key={i} fill={CORES_UNIDADE[i % CORES_UNIDADE.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Mix de Exames — {refRecente.ano}
          </h3>
          <p className="text-[10px] text-slate-400 mb-4">
            Distribuição por tipo de exame
          </p>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={exames}
                dataKey="quantidade"
                nameKey="tipo"
                cx="50%"
                cy="50%"
                outerRadius={90}
                innerRadius={50}
                label={(entry: { tipo?: string; name?: string; percent?: number }) =>
                  `${entry.tipo ?? entry.name ?? ''} ${((entry.percent ?? 0) * 100).toFixed(0)}%`
                }
                labelLine={false}
                fontSize={10}
              >
                {exames.map((e, i) => (
                  <Cell key={i} fill={CORES_EXAME[e.tipo] ?? CORES_UNIDADE[i % CORES_UNIDADE.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v) => [Number(v).toLocaleString('pt-BR'), 'Exames']}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Linha 3 — Status de importação */}
      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Status de Importação por Ano
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {historico.map(h => {
            const ativo = h.status !== 'pendente' && h.consultas_total > 0
            return (
              <div key={h.ano} className={`rounded-lg p-3 border ${ativo ? 'bg-white border-emerald-200' : 'bg-slate-100 border-slate-200'}`}>
                <p className="text-sm font-semibold text-slate-700">{h.ano}</p>
                <p className={`text-[10px] uppercase tracking-wider mt-1 ${
                  ativo ? 'text-emerald-700' : 'text-slate-500'
                }`}>
                  {h.status === 'fechado' ? '✓ Fechado' : h.status === 'em_curso' ? '○ Em curso' : '⋯ Pendente'}
                </p>
                {ativo && (
                  <p className="text-xs text-slate-600 mt-2 tabular-nums">
                    {h.consultas_total.toLocaleString('pt-BR')} consultas
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
