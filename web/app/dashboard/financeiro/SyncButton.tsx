'use client'

import { useState } from 'react'

interface EmpresaResult {
  empresa: string
  status: string
  registros?: number
  detalhe?: string
}

export default function SyncButton() {
  const [loading, setLoading] = useState(false)
  const [resultado, setResultado] = useState<EmpresaResult[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function sincronizar() {
    setLoading(true)
    setResultado(null)
    setErro(null)
    try {
      const res = await fetch('/api/conta-azul/sync-manual', { method: 'POST' })
      const data = await res.json()
      if (data.error) {
        setErro(data.error + (data.detalhe ? `: ${data.detalhe}` : ''))
      } else {
        setResultado(data.resumo ?? [])
      }
    } catch {
      setErro('Erro de conexão.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <button
        onClick={sincronizar}
        disabled={loading}
        className="w-full px-4 py-2 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <span className="animate-spin text-base">⟳</span>
            Sincronizando...
          </>
        ) : (
          <>↻ Sincronizar Conta Azul</>
        )}
      </button>

      {erro && (
        <p className="text-xs text-red-400 bg-red-900/20 rounded-lg px-3 py-2">{erro}</p>
      )}

      {resultado && resultado.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-3 space-y-1.5">
          {resultado.map((r, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-gray-300 truncate max-w-[60%]">{r.empresa}</span>
              <span className={r.status === 'sucesso' ? 'text-green-400' : r.status === 'parcial' ? 'text-yellow-400' : 'text-red-400'}>
                {r.status === 'sucesso' ? `✓ ${r.registros} lançamentos` : r.status === 'parcial' ? `~ ${r.registros} (parcial)` : `✗ ${r.detalhe?.slice(0, 40) ?? 'erro'}`}
              </span>
            </div>
          ))}
        </div>
      )}

      {resultado && resultado.length === 0 && (
        <p className="text-xs text-gray-500">Nenhuma empresa autorizada encontrada.</p>
      )}
    </div>
  )
}
