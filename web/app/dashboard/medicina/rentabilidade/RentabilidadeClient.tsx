'use client'

// Consulta realizada × custo do médico × receita, unidade por unidade.
//
// Os três números viviam em telas separadas e a pergunta que importa só aparece
// quando ficam juntos: quanto custa uma consulta em cada unidade. Em 2026 isso
// vai de R$ 4,16 a R$ 33,21 entre unidades e meses — variação que nenhum dos
// três números mostra sozinho.

import { useState } from 'react'
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from 'recharts'

export type LinhaAtendimento = {
  unidade: string; mes: number
  consultas: number; exames: number
  custo_medico: number; custo_clinicas: number; receita: number
}

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
const brlCent = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
const num = (v: number) => v.toLocaleString('pt-BR')

const tooltipStyle = {
  backgroundColor: '#fff', border: '1px solid #e2e8f0',
  fontSize: 12, borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
}

export default function RentabilidadeClient({ linhas, ano, mesesFechados }: {
  linhas: LinhaAtendimento[]
  ano: number
  mesesFechados: number
}) {
  const unidades = [...new Set(linhas.map(l => l.unidade))].sort()
  const [unidade, setUnidade] = useState<string>('todas')

  const doRecorte = unidade === 'todas' ? linhas : linhas.filter(l => l.unidade === unidade)
  const fechadas = doRecorte.filter(l => l.mes <= mesesFechados)

  // Por mês, para o gráfico.
  const porMes = MESES.slice(0, mesesFechados).map((rot, i) => {
    const doMes = fechadas.filter(l => l.mes === i + 1)
    const consultas = doMes.reduce((s, l) => s + l.consultas, 0)
    const custo = doMes.reduce((s, l) => s + Number(l.custo_medico), 0)
    return {
      mes: rot,
      Consultas: consultas,
      'Custo médico': Math.round(custo),
      // Só faz sentido onde há os dois lados: mês sem consulta ou sem
      // honorário lançado daria uma razão que não descreve nada.
      'R$ por consulta': consultas > 0 && custo > 0 ? Number((custo / consultas).toFixed(2)) : null,
    }
  })

  // Resumo por unidade — a comparação que responde onde a consulta sai cara.
  const resumo = unidades.map(u => {
    const dela = linhas.filter(l => l.unidade === u && l.mes <= mesesFechados)
    const consultas = dela.reduce((s, l) => s + l.consultas, 0)
    const custo = dela.reduce((s, l) => s + Number(l.custo_medico), 0)
    const receita = dela.reduce((s, l) => s + Number(l.receita), 0)
    // Meses em que houve atendimento e nenhum honorário: a razão fica otimista
    // porque o numerador está incompleto, e a tela precisa dizer isso.
    const lacunas = dela.filter(l => l.consultas > 0 && Number(l.custo_medico) === 0).length
    return {
      unidade: u, consultas, custo, receita, lacunas,
      custoPorConsulta: consultas > 0 ? custo / consultas : null,
      receitaPorConsulta: consultas > 0 ? receita / consultas : null,
    }
  }).sort((a, b) => b.consultas - a.consultas)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setUnidade('todas')}
          className={`px-3 py-1.5 text-xs rounded-lg ${unidade === 'todas'
            ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
          Todas as unidades
        </button>
        {unidades.map(u => (
          <button key={u} onClick={() => setUnidade(u)}
            className={`px-3 py-1.5 text-xs rounded-lg ${unidade === u
              ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {u}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-bold text-slate-800 mb-1">Consultas e custo médico — {ano}</h2>
        <p className="text-[11px] text-slate-500 mb-4">
          Barra é consulta realizada (SOC), linha é o custo do médico dividido pelas consultas
          do mês. Só os {mesesFechados} meses fechados.
        </p>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={porMes} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#64748b' }} />
            <YAxis yAxisId="qtd" tick={{ fontSize: 10, fill: '#94a3b8' }} />
            <YAxis yAxisId="rs" orientation="right" tick={{ fontSize: 10, fill: '#94a3b8' }}
                   tickFormatter={(v: number) => `R$${v}`} />
            <Tooltip contentStyle={tooltipStyle}
                     formatter={(v, n) => String(n) === 'R$ por consulta'
                       ? [v === null ? '—' : brlCent(Number(v)), String(n)]
                       : String(n) === 'Custo médico'
                         ? [brl(Number(v)), String(n)]
                         : [num(Number(v)), String(n)]} />
            <Legend wrapperStyle={{ fontSize: 11 }} iconSize={9} />
            <Bar yAxisId="qtd" dataKey="Consultas" fill="#059669" radius={[3, 3, 0, 0]} />
            <Line yAxisId="rs" type="monotone" dataKey="R$ por consulta" stroke="#8b5cf6"
                  strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-bold text-slate-800 mb-1">Comparação entre unidades</h2>
        <p className="text-[11px] text-slate-500 mb-4">
          Acumulado dos {mesesFechados} meses fechados. <strong>Receita por consulta</strong> é a
          receita INTEIRA da unidade dividida pelas consultas — a unidade fatura exame, treinamento
          e documento além da consulta, então o número serve para comparar unidades entre si, não
          como preço de consulta.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 border-b border-slate-200">
                <th className="text-left font-medium py-2">Unidade</th>
                <th className="text-right font-medium">Consultas</th>
                <th className="text-right font-medium">Custo médico</th>
                <th className="text-right font-medium">R$/consulta</th>
                <th className="text-right font-medium">Receita</th>
                <th className="text-right font-medium">Receita/consulta</th>
              </tr>
            </thead>
            <tbody>
              {resumo.map(r => (
                <tr key={r.unidade} className="border-b border-slate-100">
                  <td className="py-2 font-medium text-slate-700">
                    {r.unidade}
                    {r.lacunas > 0 && (
                      <span className="ml-1.5 text-[10px] text-amber-700"
                            title="Meses com consulta e nenhum honorário médico lançado — o custo por consulta está otimista.">
                        {r.lacunas} {r.lacunas === 1 ? 'mês sem custo' : 'meses sem custo'}
                      </span>
                    )}
                  </td>
                  <td className="text-right tabular-nums text-slate-600">{num(r.consultas)}</td>
                  <td className="text-right tabular-nums text-slate-600">{brl(r.custo)}</td>
                  <td className="text-right tabular-nums font-semibold text-slate-800">
                    {r.custoPorConsulta === null ? '—' : brlCent(r.custoPorConsulta)}
                  </td>
                  <td className="text-right tabular-nums text-slate-600">{brl(r.receita)}</td>
                  <td className="text-right tabular-nums text-slate-600">
                    {r.receitaPorConsulta === null ? '—' : brlCent(r.receitaPorConsulta)}
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
