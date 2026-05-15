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
  alerta:      { label: 'Alertas',      bg: 'bg-red-950/50 border-red-900/40',      text: 'text-red-300',    dot: 'bg-red-500' },
  pendencia:   { label: 'Pendências',   bg: 'bg-yellow-950/40 border-yellow-900/40', text: 'text-yellow-300', dot: 'bg-yellow-500' },
  decisao:     { label: 'Decisões',     bg: 'bg-blue-950/50 border-blue-900/40',    text: 'text-blue-300',   dot: 'bg-blue-500' },
  aprendizado: { label: 'Aprendizados', bg: 'bg-purple-950/50 border-purple-900/40',text: 'text-purple-300', dot: 'bg-purple-500' },
  fato:        { label: 'Fatos',        bg: 'bg-gray-800 border-gray-700',          text: 'text-gray-300',   dot: 'bg-gray-500' },
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
      <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Memórias do Agente</h3>
        <div className="bg-yellow-950/30 rounded-lg p-3 border border-yellow-900/40">
          <p className="text-xs text-yellow-300 font-medium mb-1">Migration pendente</p>
          <p className="text-[10px] text-gray-400 leading-relaxed">
            A tabela <code className="text-yellow-400">memorias_agentes</code> ainda não foi criada.
            Aplique a migration no Supabase Studio para ativar memórias de longo prazo.
          </p>
          <a
            href="https://supabase.com/dashboard/project/jdnwsmbxnjwoswcdktpx/sql/new"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-2 text-[10px] text-yellow-400 hover:underline"
          >
            Abrir SQL Editor →
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Memórias</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-[10px] px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
        >
          {showForm ? '✕ Fechar' : '+ Nova'}
        </button>
      </div>

      {showForm && (
        <div className="mb-3 p-3 bg-gray-800/60 rounded-lg border border-gray-700 space-y-2">
          <select
            value={form.tipo}
            onChange={e => setForm(f => ({ ...f, tipo: e.target.value as Memoria['tipo'] }))}
            className="w-full text-xs bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-gray-300 focus:outline-none focus:border-gray-500"
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
            className="w-full text-xs bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-gray-300 placeholder-gray-600 focus:outline-none focus:border-gray-500"
          />
          <textarea
            placeholder="Descrição detalhada"
            value={form.conteudo}
            onChange={e => setForm(f => ({ ...f, conteudo: e.target.value }))}
            rows={2}
            className="w-full text-xs bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-gray-300 placeholder-gray-600 resize-none focus:outline-none focus:border-gray-500"
          />
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500">Relevância:</span>
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                onClick={() => setForm(f => ({ ...f, relevancia: n }))}
                className={`w-5 h-5 rounded-full text-[9px] font-bold flex items-center justify-center transition-colors ${
                  n <= form.relevancia ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-500'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <button
            onClick={adicionar}
            disabled={saving || !form.titulo.trim() || !form.conteudo.trim()}
            className="w-full text-xs bg-blue-700 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-1.5 rounded transition-colors font-medium"
          >
            {saving ? 'Salvando...' : 'Salvar memória'}
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-4 text-center">
          <p className="text-xs text-gray-600 animate-pulse">Carregando memórias...</p>
        </div>
      ) : memorias.length === 0 ? (
        <div className="py-4 text-center">
          <p className="text-xs text-gray-600">Nenhuma memória ainda</p>
          <p className="text-[10px] text-gray-700 mt-0.5">São extraídas automaticamente das conversas</p>
        </div>
      ) : (
        <div className="space-y-3">
          {porTipo.map(({ tipo, lista }) => (
            <div key={tipo}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${TIPO_CONFIG[tipo].dot}`} />
                <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
                  {TIPO_CONFIG[tipo].label}
                </span>
                <span className="text-[9px] text-gray-700">({lista.length})</span>
              </div>
              <div className="space-y-1">
                {lista.map(m => (
                  <div
                    key={m.id}
                    className={`rounded-lg px-2.5 py-2 border ${TIPO_CONFIG[m.tipo].bg} group relative`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className={`text-[11px] font-medium leading-tight ${TIPO_CONFIG[m.tipo].text}`}>
                          {m.titulo}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5 leading-relaxed line-clamp-2">
                          {m.conteudo}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex gap-0.5">
                            {[1, 2, 3, 4, 5].map(n => (
                              <div
                                key={n}
                                className={`w-1 h-1 rounded-full ${n <= m.relevancia ? 'bg-gray-400' : 'bg-gray-700'}`}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => deletar(m.id)}
                        disabled={deleting === m.id}
                        className="shrink-0 opacity-0 group-hover:opacity-100 text-[10px] text-gray-600 hover:text-red-400 transition-all mt-0.5 disabled:opacity-30"
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

      <div className="mt-3 pt-3 border-t border-gray-800">
        <p className="text-[10px] text-gray-600">
          {memorias.length} memória{memorias.length !== 1 ? 's' : ''} · extraídas das conversas
        </p>
      </div>
    </div>
  )
}
