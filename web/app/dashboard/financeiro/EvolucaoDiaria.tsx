'use client'

// Evolução Diária da saúde financeira — linhas dia a dia dos snapshots
// (janela móvel 30d: comparável todo dia, sem o "reset" da virada de mês).
// Dados: snapshots_financeiros_diarios (cron 07:30 UTC, pós-sync Conta Azul).

import { useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, ReferenceLine,
} from 'recharts'

export type SnapshotDiario = {
  data: string
  receita_30d: number
  despesa_30d: number
  margem_30d: number
  receita_mes: number
  despesa_mes: number
  saldo_bancario: number
  atrasados_pagar: number
  atrasados_receber: number
  vence_7d: number
  a_receber_7d: number
  analise?: string | null
}

const METRICAS = [
  { key: 'resultado', label: 'Receita × Despesa (30d)' },
  { key: 'margem', label: 'Margem 30d' },
  { key: 'saldo', label: 'Saldo bancário' },
  { key: 'atrasados', label: 'Atrasados' },
] as const
type MetricaKey = typeof METRICAS[number]['key']

const fmtBRL = (v: number) =>
  Math.abs(v) >= 1_000_000 ? `R$ ${(v / 1_000_000).toFixed(1)} mi`
  : Math.abs(v) >= 1_000 ? `R$ ${(v / 1_000).toFixed(0)}k`
  : `R$ ${v.toFixed(0)}`

const fmtDia = (iso: string) => {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

const tooltipStyle = {
  backgroundColor: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  fontSize: 12,
  color: '#1e293b',
}

export default function EvolucaoDiaria({ snapshots }: { snapshots: SnapshotDiario[] }) {
  const [metrica, setMetrica] = useState<MetricaKey>('resultado')
  const [gerando, setGerando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const dados = snapshots.map(s => ({ ...s, dia: fmtDia(s.data) }))
  const analiseHoje = snapshots.length > 0 ? snapshots[snapshots.length - 1].analise : null

  async function gerarAgora() {
    setGerando(true); setMsg(null)
    try {
      const res = await fetch('/api/financeiro/snapshot-diario', { method: 'POST' })
      const j = await res.json()
      setMsg(res.ok ? '✅ Snapshot de hoje gravado — recarregue a página.' : `Erro: ${j.error ?? res.status}`)
    } catch {
      setMsg('Erro de rede ao gerar snapshot.')
    } finally {
      setGerando(false)
    }
  }

  return (
    <section className="bg-white rounded-xl p-4 md:p-5 border border-slate-200">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div>
          <h2 className="text-sm font-bold text-slate-800">📈 Evolução Diária — saúde financeira</h2>
          <p className="text-xs text-slate-500">Janela móvel de 30 dias · atualizado todo dia após o sync (07:30 UTC)</p>
        </div>
        <div className="flex gap-1.5 flex-wrap items-center">
          {METRICAS.map(m => (
            <button
              key={m.key}
              onClick={() => setMetrica(m.key)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                metrica === m.key
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {m.label}
            </button>
          ))}
          <button
            onClick={gerarAgora}
            disabled={gerando}
            title="Recalcula o snapshot de hoje com os dados mais recentes (sobrescreve o ponto do dia)"
            className="px-2.5 py-1 rounded-lg text-xs font-semibold border bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 disabled:opacity-50 transition-colors"
          >
            {gerando ? 'Atualizando…' : '↻ Atualizar hoje'}
          </button>
        </div>
      </div>
      {msg && dados.length >= 2 && <p className="text-xs text-slate-600 mb-2">{msg}</p>}

      {dados.length < 2 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-slate-500 mb-3">
            Coletando dados — a linha aparece a partir de 2 dias de snapshot.
            {dados.length === 1 ? ' (1 dia já gravado)' : ''}
          </p>
          <button
            onClick={gerarAgora}
            disabled={gerando}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold"
          >
            {gerando ? 'Gerando…' : 'Gerar snapshot de hoje'}
          </button>
          {msg && <p className="text-xs text-slate-600 mt-2">{msg}</p>}
        </div>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dados} margin={{ top: 8, right: 12, bottom: 0, left: 8 }}>
              <XAxis dataKey="dia" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} />
              {metrica === 'margem' ? (
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false}
                  tickFormatter={(v: number) => `${v}%`} />
              ) : (
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false}
                  tickFormatter={fmtBRL} width={70} />
              )}
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value, name) =>
                  metrica === 'margem'
                    ? [`${Number(value).toFixed(1)}%`, String(name)]
                    : [Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), String(name)]}
                labelFormatter={(l) => `Dia ${l}`}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {metrica === 'resultado' && (<>
                <Line type="monotone" dataKey="receita_30d" name="Receita 30d" stroke="#059669" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="despesa_30d" name="Despesa 30d" stroke="#dc2626" strokeWidth={2} dot={false} />
              </>)}
              {metrica === 'margem' && (<>
                <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="margem_30d" name="Margem 30d (%)" stroke="#2563eb" strokeWidth={2} dot={false} />
              </>)}
              {metrica === 'saldo' && (<>
                <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="saldo_bancario" name="Saldo bancário" stroke="#7c3aed" strokeWidth={2} dot={false} />
              </>)}
              {metrica === 'atrasados' && (<>
                <Line type="monotone" dataKey="atrasados_pagar" name="Atrasados a pagar" stroke="#dc2626" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="atrasados_receber" name="Inadimplência (a receber)" stroke="#d97706" strokeWidth={2} dot={false} />
              </>)}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {analiseHoje && (
        <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-xs font-bold text-amber-800 mb-1">💬 Análise da Plata (hoje)</p>
          <div className="text-xs text-slate-700 whitespace-pre-line leading-relaxed">{analiseHoje}</div>
        </div>
      )}
    </section>
  )
}
