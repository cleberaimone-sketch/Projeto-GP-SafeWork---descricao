'use client'

import { useState, useEffect, useCallback } from 'react'

interface Memoria {
  id: string
  tipo: 'decisao' | 'fato' | 'pendencia' | 'alerta' | 'aprendizado'
  titulo: string
  conteudo: string
  relevancia: number
  created_at: string
}

const TIPO_CONFIG = {
  alerta:      { label: 'Alertas',      bg: 'bg-red-50 border-red-200',          text: 'text-red-800',     dot: 'bg-red-500' },
  pendencia:   { label: 'Pendências',   bg: 'bg-amber-50 border-amber-200',      text: 'text-amber-800',   dot: 'bg-amber-500' },
  decisao:     { label: 'Decisões',     bg: 'bg-blue-50 border-blue-200',        text: 'text-blue-800',    dot: 'bg-blue-500' },
  aprendizado: { label: 'Aprendizados', bg: 'bg-purple-50 border-purple-200',    text: 'text-purple-800',  dot: 'bg-purple-500' },
  fato:        { label: 'Fatos',        bg: 'bg-slate-50 border-slate-200',      text: 'text-slate-800',   dot: 'bg-slate-400' },
} as const

const TIPO_ORDER: Memoria['tipo'][] = ['alerta', 'pendencia', 'decisao', 'aprendizado', 'fato']

interface Props {
  agente: string
}

export default function MemoriasPanel({ agente }: Props) {
  const [memorias, setMemorias] = useState<Memoria[]>([])
  const [loading, setLoading] = useState(true)
  const [migrationNeeded, setMigrationNeeded] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<{ tipo: Memoria['tipo']; titulo: string; conteudo: string; relevancia: number }>({
    tipo: 'fato', titulo: '', conteudo: '', relevancia: 3,
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/agentes/memorias?agente=${agente}`)
      const data = await res.json()
      if (data.migration_needed) {
        setMigrationNeeded(true)
      } else {
        setMemorias(data.memorias ?? [])
        setMigrationNeeded(false)
      }
    } catch {
      // silencioso
    } finally {
      setLoading(false)
    }
  }, [agente])

  useEffect(() => { load() }, [load])

  async function deletar(id: string) {
    setDeleting(id)
    try {
      await fetch(`/api/agentes/memorias?id=${id}`, { method: 'DELETE' })
      setMemorias(prev => prev.filter(m => m.id !== id))
    } finally {
      setDeleting(null)
    }
  }

  async function adicionar() {
    if (!form.titulo.trim() || !form.conteudo.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/agentes/memorias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agente, ...form }),
      })
      if (res.ok) {
        setForm({ tipo: 'fato', titulo: '', conteudo: '', relevancia: 3 })
        setShowForm(false)
        await load()
      }
    } finally {
      setSaving(false)
    }
  }

  const porTipo = TIPO_ORDER
    .map(tipo => ({ tipo, lista: memorias.filter(m => m.tipo === tipo) }))
    .filter(g => g.lista.length > 0)

  if (migrationNeeded) {
    return (
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">Memórias do Agente</h3>
        <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
          <p className="text-xs text-amber-800 font-semibold mb-1">Migration pendente</p>
          <p className="text-[10px] text-slate-700 leading-relaxed">
            A tabela <code className="text-amber-900 bg-amber-100 px-1 rounded">memorias_agentes</code> ainda não foi criada.
            Aplique a migration no Supabase Studio para ativar memórias de longo prazo.
          </p>
          <a
            href="https://supabase.com/dashboard/project/jdnwsmbxnjwoswcdktpx/sql/new"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-2 text-[10px] text-amber-800 hover:text-amber-900 font-semibold hover:underline"
          >
            Abrir SQL Editor →
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Memórias</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-[10px] px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 transition-colors border border-slate-200 font-medium"
        >
          {showForm ? '✕ Fechar' : '+ Nova'}
        </button>
      </div>

      {showForm && (
        <div className="mb-3 p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
          <select
            value={form.tipo}
            onChange={e => setForm(f => ({ ...f, tipo: e.target.value as Memoria['tipo'] }))}
            className="w-full text-xs bg-white border border-slate-300 rounded px-2 py-1.5 text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            {TIPO_ORDER.map(t => (
              <option key={t} value={t}>{TIPO_CONFIG[t].label.slice(0, -1) === 'Alerta' ? 'Alerta' : TIPO_CONFIG[t].label.slice(0, -1)}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Título curto"
            value={form.titulo}
            onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
            className="w-full text-xs bg-white border border-slate-300 rounded px-2 py-1.5 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <textarea
            placeholder="Descrição detalhada"
            value={form.conteudo}
            onChange={e => setForm(f => ({ ...f, conteudo: e.target.value }))}
            rows={2}
            className="w-full text-xs bg-white border border-slate-300 rounded px-2 py-1.5 text-slate-800 placeholder-slate-400 resize-none focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500 font-medium">Relevância:</span>
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                onClick={() => setForm(f => ({ ...f, relevancia: n }))}
                className={`w-5 h-5 rounded-full text-[9px] font-bold flex items-center justify-center transition-colors ${
                  n <= form.relevancia ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <button
            onClick={adicionar}
            disabled={saving || !form.titulo.trim() || !form.conteudo.trim()}
            className="w-full text-xs bg-blue-700 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white py-1.5 rounded transition-colors font-semibold shadow-sm"
          >
            {saving ? 'Salvando...' : 'Salvar memória'}
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-4 text-center">
          <p className="text-xs text-slate-500 animate-pulse">Carregando memórias...</p>
        </div>
      ) : memorias.length === 0 ? (
        <div className="py-4 text-center">
          <p className="text-xs text-slate-500">Nenhuma memória ainda</p>
          <p className="text-[10px] text-slate-400 mt-0.5">São extraídas automaticamente das conversas</p>
        </div>
      ) : (
        <div className="space-y-3">
          {porTipo.map(({ tipo, lista }) => (
            <div key={tipo}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${TIPO_CONFIG[tipo].dot}`} />
                <span className="text-[10px] text-slate-700 uppercase tracking-wider font-bold">
                  {TIPO_CONFIG[tipo].label}
                </span>
                <span className="text-[9px] text-slate-400">({lista.length})</span>
              </div>
              <div className="space-y-1">
                {lista.map(m => (
                  <div
                    key={m.id}
                    className={`rounded-lg px-2.5 py-2 border ${TIPO_CONFIG[m.tipo].bg} group relative`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className={`text-[11px] font-semibold leading-tight ${TIPO_CONFIG[m.tipo].text}`}>
                          {m.titulo}
                        </p>
                        <p className="text-[10px] text-slate-600 mt-0.5 leading-relaxed line-clamp-2">
                          {m.conteudo}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex gap-0.5">
                            {[1, 2, 3, 4, 5].map(n => (
                              <div
                                key={n}
                                className={`w-1 h-1 rounded-full ${n <= m.relevancia ? 'bg-slate-700' : 'bg-slate-300'}`}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => deletar(m.id)}
                        disabled={deleting === m.id}
                        className="shrink-0 opacity-0 group-hover:opacity-100 text-[10px] text-slate-400 hover:text-red-600 transition-all mt-0.5 disabled:opacity-30"
                        title="Excluir memória"
                      >
                        {deleting === m.id ? '⏳' : '✕'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-slate-200">
        <p className="text-[10px] text-slate-500">
          {memorias.length} memória{memorias.length !== 1 ? 's' : ''} · extraídas das conversas
        </p>
      </div>
    </div>
  )
}
