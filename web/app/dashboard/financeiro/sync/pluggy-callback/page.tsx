'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

export default function PluggyCallbackPage() {
  const params   = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'ok' | 'erro'>('loading')
  const [msg, setMsg]       = useState('')

  useEffect(() => {
    const itemId    = params.get('itemId')
    const empresaId = sessionStorage.getItem('pluggy_empresa_id') ?? undefined

    if (!itemId) {
      setStatus('erro')
      setMsg('itemId não recebido — tente novamente.')
      window.opener?.postMessage({ type: 'pluggy_error', message: 'itemId ausente' }, window.location.origin)
      return
    }

    fetch('/api/pluggy/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, empresaId: empresaId || null }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          setStatus('ok')
          setMsg(`${data.item?.banco ?? 'Banco'} conectado com sucesso.`)
          window.opener?.postMessage({ type: 'pluggy_connected', itemId }, window.location.origin)
          sessionStorage.removeItem('pluggy_empresa_id')
          setTimeout(() => window.close(), 1500)
        } else {
          setStatus('erro')
          setMsg(data.error ?? 'Erro ao salvar conexão.')
          window.opener?.postMessage({ type: 'pluggy_error', message: data.error }, window.location.origin)
        }
      })
      .catch(e => {
        setStatus('erro')
        setMsg(e.message)
        window.opener?.postMessage({ type: 'pluggy_error', message: e.message }, window.location.origin)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="bg-white rounded-xl border border-slate-200 shadow p-8 max-w-sm w-full text-center">
        {status === 'loading' && (
          <>
            <p className="text-2xl mb-3 animate-spin">⚙️</p>
            <p className="text-sm font-semibold text-slate-800">Salvando conexão...</p>
          </>
        )}
        {status === 'ok' && (
          <>
            <p className="text-3xl mb-3">✅</p>
            <p className="text-sm font-semibold text-slate-800">{msg}</p>
            <p className="text-xs text-slate-500 mt-2">Esta janela vai fechar automaticamente.</p>
          </>
        )}
        {status === 'erro' && (
          <>
            <p className="text-3xl mb-3">❌</p>
            <p className="text-sm font-semibold text-red-700">{msg}</p>
            <button
              onClick={() => window.close()}
              className="mt-4 text-xs px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700"
            >
              Fechar
            </button>
          </>
        )}
      </div>
    </div>
  )
}
