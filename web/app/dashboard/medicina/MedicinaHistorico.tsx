'use client'

// Só os anos ANTERIORES ao espelho do SOC, que começa em 2025.
//
// Este painel mostrava série mensal, atendimentos por unidade e mix de exames
// lendo uma constante copiada da planilha "Controle Atendimentos" — última
// extração 28/05/2026. Todas as três agora vêm do banco (HistoricoSOC e
// DistribuicaoSOC) e andam sozinhas; mantê-las aqui deixaria dois gráficos da
// mesma coisa lado a lado, um vivo e um parado em abril.
//
// O que a planilha ainda tem de exclusivo é 2024 e antes, fora do alcance da
// carga do SOC. É só isso que sobrou.

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
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

export default function MedicinaHistorico({ historico }: Props) {
  // O espelho do SOC cobre 2025 em diante; aqui só entra o que é anterior.
  const PRIMEIRO_ANO_DO_ESPELHO = 2025
  const anteriores = historico.filter(
    h => h.status === 'fechado' && h.consultas_total > 0 && h.ano < PRIMEIRO_ANO_DO_ESPELHO,
  )
  if (anteriores.length === 0) return null

  const serieAnual = anteriores
    .sort((a, b) => a.ano - b.ano)
    .map(h => ({ ano: String(h.ano), consultas: h.consultas_total }))

  const pendentes = historico.filter(h => h.status === 'pendente' && h.ano < PRIMEIRO_ANO_DO_ESPELHO)

  return (
    <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Antes do espelho — consultas por ano
        </h3>
        <span className="text-[10px] text-slate-400">
          Planilha &ldquo;Controle Atendimentos&rdquo; · a carga do SOC começa em {PRIMEIRO_ANO_DO_ESPELHO}
        </span>
      </div>
      <p className="text-[10px] text-slate-400 mb-4">
        Números fechados, digitados à mão — não mudam e não vêm do banco.
        {pendentes.length > 0 && (
          <> Falta importar {pendentes.map(h => h.ano).join(', ')}.</>
        )}
      </p>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={serieAnual} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="ano" tick={{ fontSize: 12, fill: '#64748b' }} />
          <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => [Number(v).toLocaleString('pt-BR'), 'Consultas']} />
          <Bar dataKey="consultas" fill="#94a3b8" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
