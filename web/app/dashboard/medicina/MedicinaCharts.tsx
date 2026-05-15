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
  NOMEEXAME?: string
  CODEXAME?: string
}

// Retorna true se o exame é uma Consulta Ocupacional / Exame Clínico (= representa um ASO)
function isClinicalExam(a: AtendimentoRaw): boolean {
  if (!a.NOMEEXAME) return true  // sem campo = trata como ASO (fallback sem NOMEEXAME)
  const n = a.NOMEEXAME.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  return n.includes('CONSULTA') || n.includes('CLINICO') || n.includes('ASO')
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const CLINICAS = ['Medianeira', 'Foz', 'Santa Helena', 'Londrina', 'New Life', 'Credenciada'] as const
type Clinica = typeof CLINICAS[number]

// Paleta clínica: cada unidade tem cor estável (consistência em todos os gráficos)
const COR_CLINICA: Record<Clinica, string> = {
  Medianeira:    '#10b981',  // emerald
  Foz:           '#06b6d4',  // cyan
  'Santa Helena':'#a855f7',  // purple
  Londrina:      '#f59e0b',  // amber
  'New Life':    '#ec4899',  // pink (mais distinto da credenciada)
  Credenciada:   '#64748b',  // slate (não-SafeWork = neutro)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizarClinica(texto?: string): Clinica {
  if (!texto) return 'Credenciada'
  // Remove acentos, normaliza espaços, maiúsculas
  const t = texto
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  // New Life PRIMEIRO — caso o nome contenha também "credenciada" ou "rede"
  if (/NEW\s*LIFE|NEWLIFE|N\.LIFE/.test(t)) return 'New Life'

  if (t.includes('MEDIANEIRA'))                                                return 'Medianeira'
  if (/\bFOZ\b/.test(t) || t.includes('IGUACU'))                               return 'Foz'
  if (t.includes('SANTA HELENA') || t.includes('STA HELENA') ||
      /\bSH\b/.test(t) || t.includes('S.H.') || t.includes('S HELENA'))        return 'Santa Helena'
  if (t.includes('LONDRINA'))                                                  return 'Londrina'

  // Default: rede credenciada (qualquer clínica externa não-SafeWork)
  return 'Credenciada'
}

function parseData(iso?: string): Date | null {
  if (!iso) return null
  const s = iso.trim()
  if (!s) return null

  // DD/MM/YYYY (possivelmente com hora depois)
  if (s.includes('/')) {
    const parts = s.split(/[\s/T:.-]/).filter(Boolean)
    if (parts.length >= 3) {
      const d = parseInt(parts[0]), m = parseInt(parts[1]), y = parseInt(parts[2])
      if (!isNaN(d) && !isNaN(m) && !isNaN(y) && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        return new Date(y, m - 1, d)
      }
    }
  }

  // YYYY-MM-DD ou YYYY-MM-DDTHH:...
  const match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (match) return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]))

  // Fallback: deixa o JS tentar
  const d = new Date(s)
  if (!isNaN(d.getTime())) return new Date(d.getFullYear(), d.getMonth(), d.getDate())
  return null
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
  const [periodo, setPeriodo] = useState<'dia' | 'semana' | 'mes'>('dia')
  const [clinicasFiltro, setClinicasFiltro] = useState<Set<Clinica>>(new Set(CLINICAS))
  const [modoTotal, setModoTotal] = useState(false)

  function toggleClinica(c: Clinica) {
    setClinicasFiltro(prev => {
      const next = new Set(prev)
      if (next.has(c)) { next.delete(c) } else { next.add(c) }
      return next
    })
  }

  const { dadosAgend, dadosAtend, dadosFalt, dadosAgendTotal, dadosAtendTotal, dadosFaltTotal } = useMemo(() => {
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

    // Atendimentos = apenas Consulta Ocupacional / Exame Clínico (= ASO realizado)
    for (const a of atendimentos.filter(isClinicalExam)) {
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

    const agg = (rows: Record<string, string | number>[]) =>
      rows.map(row => ({
        periodo: row.periodo,
        Total: CLINICAS.filter(c => clinicasFiltro.has(c)).reduce((s, c) => s + Number(row[c] ?? 0), 0),
      }))

    return {
      dadosAgend, dadosAtend, dadosFalt,
      dadosAgendTotal: agg(dadosAgend),
      dadosAtendTotal: agg(dadosAtend),
      dadosFaltTotal:  agg(dadosFalt),
    }
  }, [agendamentos, atendimentos, periodo, clinicasFiltro])

  const clinicas = CLINICAS.filter(c => clinicasFiltro.has(c))

  if (agendamentos.length === 0 && atendimentos.length === 0) {
    return (
      <div className="bg-gradient-to-br from-slate-900 to-slate-900/40 rounded-xl p-8 border border-slate-800 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-800 mb-3">
          <span className="text-2xl">📊</span>
        </div>
        <p className="text-sm text-slate-300 font-medium">Sem dados para exibir gráficos</p>
        <p className="text-xs text-slate-500 mt-1">Configure as máscaras SOC para visualizar</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Controles */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Período */}
        <div className="flex rounded-lg overflow-hidden border border-slate-700">
          {(['dia', 'semana', 'mes'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              className={`text-xs px-3 py-1.5 transition-colors ${
                periodo === p
                  ? 'bg-emerald-700 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {p === 'dia' ? 'Dia' : p === 'semana' ? 'Semana' : 'Mês'}
            </button>
          ))}
        </div>

        {/* Total / Por Unidade */}
        <button
          onClick={() => setModoTotal(t => !t)}
          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
            modoTotal
              ? 'bg-blue-700 border-blue-600 text-white'
              : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
          }`}
        >
          {modoTotal ? 'Total ✓' : 'Total'}
        </button>

        {/* Filtro por clínica — só exibe quando não está em modo total */}
        {!modoTotal && (
          <div className="flex flex-wrap gap-1.5">
            {CLINICAS.map(c => (
              <button
                key={c}
                onClick={() => toggleClinica(c)}
                className={`text-[10px] px-2 py-1 rounded-full border transition-colors ${
                  clinicasFiltro.has(c)
                    ? 'text-white border-transparent'
                    : 'bg-transparent text-slate-500 border-slate-700'
                }`}
                style={clinicasFiltro.has(c) ? { backgroundColor: COR_CLINICA[c], borderColor: COR_CLINICA[c] } : {}}
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Gráfico 1 — Agendamentos */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-900/60 rounded-xl p-5 border border-slate-800/80">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
          Agendamentos por {periodo === 'dia' ? 'Dia' : periodo === 'semana' ? 'Semana' : 'Mês'}
          {modoTotal && <span className="ml-2 text-blue-400 normal-case font-normal">— Total</span>}
        </h3>
        {dadosAgend.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-xs text-slate-400 font-medium">Nenhum agendamento no período</p>
            <p className="text-[10px] text-slate-600 mt-1">Verifique se há consultas marcadas na agenda SOC</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={modoTotal ? dadosAgendTotal : dadosAgend} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="periodo" tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} allowDecimals={false} />
              <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', fontSize: 11, borderRadius: 8 }} labelStyle={{ color: '#d1d5db' }} />
              <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
              {modoTotal
                ? <Bar dataKey="Total" fill="#10b981" radius={[4, 4, 0, 0]} />
                : clinicas.map(c => <Bar key={c} dataKey={c} stackId="a" fill={COR_CLINICA[c]} radius={[2, 2, 0, 0]} />)
              }
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Gráfico 2 — Atendimentos realizados */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-900/60 rounded-xl p-5 border border-slate-800/80">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
          ASOs Realizados por {periodo === 'dia' ? 'Dia' : periodo === 'semana' ? 'Semana' : 'Mês'}
          {modoTotal && <span className="ml-2 text-blue-400 normal-case font-normal">— Total</span>}
        </h3>
        {dadosAtend.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-xs text-slate-400 font-medium">Nenhum ASO realizado no período</p>
            <p className="text-[10px] text-slate-600 mt-1">Filtrando consultas clínicas / exames ocupacionais</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={modoTotal ? dadosAtendTotal : dadosAtend} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="periodo" tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} allowDecimals={false} />
              <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', fontSize: 11, borderRadius: 8 }} labelStyle={{ color: '#d1d5db' }} />
              <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
              {modoTotal
                ? <Bar dataKey="Total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                : clinicas.map(c => <Bar key={c} dataKey={c} stackId="a" fill={COR_CLINICA[c]} radius={[2, 2, 0, 0]} />)
              }
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Gráfico 3 — Faltantes */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-900/60 rounded-xl p-5 border border-slate-800/80">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
          Faltantes por {periodo === 'dia' ? 'Dia' : periodo === 'semana' ? 'Semana' : 'Mês'}
          {modoTotal && <span className="ml-2 text-blue-400 normal-case font-normal">— Total</span>}
        </h3>
        <p className="text-[10px] text-slate-600 mb-4">Agendamentos sem registro de exame correspondente</p>
        {dadosFalt.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-xs text-emerald-400 font-medium">✓ Nenhuma falta no período</p>
            <p className="text-[10px] text-slate-600 mt-1">Todos os agendamentos foram realizados</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={modoTotal ? dadosFaltTotal : dadosFalt} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="periodo" tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} allowDecimals={false} />
              <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', fontSize: 11, borderRadius: 8 }} labelStyle={{ color: '#d1d5db' }} />
              <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
              {modoTotal
                ? <Bar dataKey="Total" fill="#f43f5e" opacity={0.8} radius={[4, 4, 0, 0]} />
                : clinicas.map(c => <Bar key={c} dataKey={c} stackId="a" fill={COR_CLINICA[c]} opacity={0.7} radius={[2, 2, 0, 0]} />)
              }
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
