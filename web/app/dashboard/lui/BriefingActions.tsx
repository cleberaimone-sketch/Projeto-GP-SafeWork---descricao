'use client'

import { useState } from 'react'

interface Props {
  briefingHojeExiste: boolean
}

export default function BriefingActions({ briefingHojeExiste }: Props) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'erro'>('idle')
  const [msg, setMsg] = useState('')
  const [preview, setPreview] = useState('')

  async function dispararBriefing(forcar = false) {
    setStatus('loading')
    setMsg('')
    setPreview('')
    try {
      const url = forcar ? '/api/lui/briefing?forcar=1' : '/api/lui/briefing'
      const res = await fetch(url)
      const data = await res.json()

      if (data.duplicado) {
        setStatus('ok')
        setMsg('Briefing já foi gerado hoje. Use "Forçar reenvio" para gerar novamente.')
        return
      }
      if (!res.ok || !data.ok) {
        setStatus('erro')
        setMsg(data.error ?? 'Erro ao gerar briefing')
        return
      }
      setStatus('ok')
      setMsg(data.enviado
        ? '✓ Briefing gerado e enviado via WhatsApp!'
        : '✓ Briefing gerado (WhatsApp não configurado)')
      if (data.briefing) setPreview(data.briefing.slice(0, 400))
    } catch (e) {
      setStatus('erro')
      setMsg('Erro de conexão')
      console.error(e)
    }
  }

  return (
    <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Briefing Manual</h3>

      <div className="space-y-2">
        <button
          onClick={() => dispararBriefing(false)}
          disabled={status === 'loading'}
          className="w-full text-xs bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white py-2.5 rounded-lg transition-colors font-medium"
        >
          {status === 'loading' ? '⏳ Gerando...' : '🌅 Gerar briefing agora'}
        </button>

        {briefingHojeExiste && (
          <button
            onClick={() => dispararBriefing(true)}
            disabled={status === 'loading'}
            className="w-full text-xs bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 py-2 rounded-lg transition-colors"
          >
            Forçar reenvio (já existe hoje)
          </button>
        )}
      </div>

      {status !== 'idle' && (
        <div className={`mt-3 rounded-lg p-3 text-xs ${
          status === 'loading' ? 'bg-blue-950/40 text-blue-300' :
          status === 'ok'      ? 'bg-green-950/40 text-green-300' :
                                 'bg-red-950/40 text-red-300'
        }`}>
          <p>{msg}</p>
          {preview && (
            <div className="mt-2 pt-2 border-t border-gray-700">
              <p className="text-gray-400 font-medium mb-1 text-[10px] uppercase tracking-wider">Preview</p>
              <p className="text-gray-300 whitespace-pre-wrap leading-relaxed">{preview}…</p>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-gray-800">
        <p className="text-[10px] text-gray-600">Cron automático: diariamente às 7h</p>
        <p className="text-[10px] text-gray-600">Consolida: Plata + Lari + Dieguito</p>
      </div>
    </div>
  )
}
