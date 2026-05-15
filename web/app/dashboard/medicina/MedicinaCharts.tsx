'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts'
import { useState, useMemo } from 'react'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface AgendamentoRaw {
  DATACOMPROMISSO?: string
  NOMEAGENDA?: string
  NOMEEMPRESA?: string
  NOMEFUNCIONARIO?: string
  TIPOCOMPROMISSO?: string
}

export interface AtendimentoRaw {
  DATAFICHA?: string
  UNIDADE?: string
  NOMEEMPRESA?: string
  NOMEFUNCIONARIO?: string
  TIPOFICHA?: string
  SAIASO?: string
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const CLINICAS = ['Medianeira', 'Foz', 'Santa Helena', 'Londrina', 'New Life', 'Credenciada'] as const
type Clinica = typeof CLINICAS[number]

const COR_CLINICA: Record<Clinica, string> = {
  Medianeira:    '#10b981',
  Foz:           '#3b82f6',
  'Santa Helena':'#a855f7',
  Londrina:      '#f59e0b',
  'New Life':    '#f43f5e',
  Credenciada:   '#6b7280',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizarClinica(texto?: string): Clinica {
  if (!texto) return 'Credenciada'
  const t = texto.toUpperCase()
  if (t.includes('MEDIANEIRA'))                       return 'Medianeira'
  if (t.includes('FOZ'))                              return 'Foz'
  if (t.includes('SANTA HELENA') || t.includes(' SH ') || t.includes('S.HELENA')) return 'Santa Helena'
  if (t.includes('LONDRINA'))                         return 'Londrina'
  if (t.includes('NEW LIFE') || t.includes('NEWLIFE'))return 'New Life'
  return 'Credenciada'
}

function parseData(iso?: string): Date | null {
  if (!iso) return null
  // aceita DD/MM/YYYY ou YYYY-MM-DD
  if (iso.includes('/')) {
    const [d, m, y] = iso.split('/')
    return new Date(`${y}-${m}-${d}`)
  }
  return new Date(iso)
}

function chave(d: Date, periodo: 'dia' | 'semana' | 'mes'): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  if (periodo === 'dia') return `${d.getDate().toString().padStart(2, '0')}/${m}`
  if (periodo === 'mes') return `${m}/${y}`
  // semana: número da semana ISO aproximado
  const ini = new Date(y, 0, 1)
  const semana = Math.ceil(((d.getTime() - ini.getTime()) / 86400000 + ini.getDay() + 1) / 7)
  return `S${semana}/${y}`
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  agendamentos: AgendamentoRaw[]
  atendimentos: AtendimentoRaw[]
}

export default function MedicinaCharts({ agendamentos, atendimentos }: Props) {
  const [periodo, setPeriodo] = useState<'dia' | 'semana' | 'mes'>('mes')
  const [clinicasFiltro, setClinicasFiltro] = useState<Set<Clinica>>(new Set(CLINICAS))

  function toggleClinica(c: Clinica) {
    setClinicasFiltro(prev => {
      const next = new Set(prev)
      if (next.has(c)) { next.delete(c) } else { next.add(c) }
      return next
    })
  }

  const { dadosAgend, dadosAtend, dadosFalt } = useMemo(() => {
    const agMap: Record<string, Record<Clinica, number>> = {}
    const atMap: Record<string, Record<Clinica, number>> = {}

    for (const a of agendamentos) {
      const dt = parseData(a.DATACOMPROMISSO)
      if (!dt) continue
      const k = chave(dt, periodo)
      const clinica = normalizarClinica(a.NOMEAGENDA ?? a.NOMEEMPRESA)
      if (!agMap[k]) agMap[k] = {} as Record<Clinica, number>
      agMap[k][clinica] = (agMap[k][clinica] ?? 0) + 1
    }

    for (const a of atendimentos) {
      const dt = parseData(a.DATAFICHA)
      if (!dt) continue
      const k = chave(dt, periodo)
      const clinica = normalizarClinica(a.UNIDADE ?? a.NOMEEMPRESA)
      if (!atMap[k]) atMap[k] = {} as Record<Clinica, number>
      atMap[k][clinica] = (atMap[k][clinica] ?? 0) + 1
    }

    // Períodos únicos ordenados
    const periodos = [...new Set([...Object.keys(agMap), ...Object.keys(atMap)])].sort()

    const dadosAgend = periodos.map(p => {
      const row: Record<string, string | number> = { periodo: p }
      for (const c of CLINICAS) if (clinicasFiltro.has(c)) row[c] = agMap[p]?.[c] ?? 0
      return row
    })

    const dadosAtend = periodos.map(p => {
      const row: Record<string, string | number> = { periodo: p }
      for (const c of CLINICAS) if (clinicasFiltro.has(c)) row[c] = atMap[p]?.[c] ?? 0
      return row
    })

    // Faltantes = passado: agendamentos - atendimentos (≥ 0)
    const hoje = new Date()
    const dadosFalt = periodos
      .filter(p => {
        // só períodos passados
        const dt = periodo === 'dia'
          ? parseData(`${hoje.getFullYear()}-${p.split('/')[1]}-${p.split('/')[0]}`)
          : null
        return dt ? dt < hoje : true
      })
      .map(p => {
        const row: Record<string, string | number> = { periodo: p }
        for (const c of CLINICAS) {
          if (!clinicasFiltro.has(c)) continue
          row[c] = Math.max(0, (agMap[p]?.[c] ?? 0) - (atMap[p]?.[c] ?? 0))
        }
        return row
      })

    return { dadosAgend, dadosAtend, dadosFalt }
  }, [agendamentos, atendimentos, periodo, clinicasFiltro])

  const clinicas = CLINICAS.filter(c => clinicasFiltro.has(c))

  if (agendamentos.length === 0 && atendimentos.length === 0) {
    return (
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 text-center">
        <p className="text-sm text-gray-500">Sem dados para exibir gráficos</p>
        <p className="text-xs text-gray-600 mt-1">Configure as máscaras SOC para visualizar</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Controles */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Período */}
        <div className="flex rounded-lg overflow-hidden border border-gray-700">
          {(['dia', 'semana', 'mes'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              className={`text-xs px-3 py-1.5 transition-colors ${
                periodo === p
                  ? 'bg-emerald-700 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-gray-200'
              }`}
            >
              {p === 'dia' ? 'Dia' : p === 'semana' ? 'Semana' : 'Mês'}
            </button>
          ))}
        </div>

        {/* Filtro por clínica */}
        <div className="flex flex-wrap gap-1.5">
          {CLINICAS.map(c => (
            <button
              key={c}
              onClick={() => toggleClinica(c)}
              className={`text-[10px] px-2 py-1 rounded-full border transition-colors ${
                clinicasFiltro.has(c)
                  ? 'text-white border-transparent'
                  : 'bg-transparent text-gray-500 border-gray-700'
              }`}
              style={clinicasFiltro.has(c) ? { backgroundColor: COR_CLINICA[c], borderColor: COR_CLINICA[c] } : {}}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Gráfico 1 — Agendamentos */}
      <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
          Agendamentos por {periodo === 'dia' ? 'Dia' : periodo === 'semana' ? 'Semana' : 'Mês'}
        </h3>
        {dadosAgend.length === 0 ? (
          <p className="text-xs text-gray-600 text-center py-8">Sem dados de agendamento</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dadosAgend} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="periodo" tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', fontSize: 11, borderRadius: 8 }}
                labelStyle={{ color: '#d1d5db' }}
              />
              <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
              {clinicas.map(c => (
                <Bar key={c} dataKey={c} stackId="a" fill={COR_CLINICA[c]} radius={[2, 2, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Gráfico 2 — Atendimentos realizados */}
      <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
          Atendimentos Realizados por {periodo === 'dia' ? 'Dia' : periodo === 'semana' ? 'Semana' : 'Mês'}
        </h3>
        {dadosAtend.length === 0 ? (
          <p className="text-xs text-gray-600 text-center py-8">Sem dados de atendimento</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dadosAtend} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="periodo" tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', fontSize: 11, borderRadius: 8 }}
                labelStyle={{ color: '#d1d5db' }}
              />
              <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
              {clinicas.map(c => (
                <Bar key={c} dataKey={c} stackId="a" fill={COR_CLINICA[c]} radius={[2, 2, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Gráfico 3 — Faltantes */}
      <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
          Faltantes por {periodo === 'dia' ? 'Dia' : periodo === 'semana' ? 'Semana' : 'Mês'}
        </h3>
        <p className="text-[10px] text-gray-600 mb-4">Agendamentos sem registro de exame correspondente</p>
        {dadosFalt.length === 0 ? (
          <p className="text-xs text-gray-600 text-center py-8">Sem dados de faltantes</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dadosFalt} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="periodo" tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', fontSize: 11, borderRadius: 8 }}
                labelStyle={{ color: '#d1d5db' }}
              />
              <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
              {clinicas.map(c => (
                <Bar key={c} dataKey={c} stackId="a" fill={COR_CLINICA[c]} opacity={0.7} radius={[2, 2, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
