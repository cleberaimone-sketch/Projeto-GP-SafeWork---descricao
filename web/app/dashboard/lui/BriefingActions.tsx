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
    <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
      <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">Briefing Manual</h3>

      <div className="space-y-2">
        <button
          onClick={() => dispararBriefing(false)}
          disabled={status === 'loading'}
          className="w-full text-xs bg-blue-700 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 rounded-lg transition-colors font-semibold shadow-sm"
        >
          {status === 'loading' ? '⏳ Gerando...' : '🌅 Gerar briefing agora'}
        </button>

        {briefingHojeExiste && (
          <button
            onClick={() => dispararBriefing(true)}
            disabled={status === 'loading'}
            className="w-full text-xs bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 py-2 rounded-lg transition-colors border border-slate-200 font-medium"
          >
            Forçar reenvio (já existe hoje)
          </button>
        )}
      </div>

      {status !== 'idle' && (
        <div className={`mt-3 rounded-lg p-3 text-xs border ${
          status === 'loading' ? 'bg-blue-50 text-blue-800 border-blue-200' :
          status === 'ok'      ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                                 'bg-red-50 text-red-800 border-red-200'
        }`}>
          <p className="font-medium">{msg}</p>
          {preview && (
            <div className="mt-2 pt-2 border-t border-current/20">
              <p className="font-bold mb-1 text-[10px] uppercase tracking-wider opacity-80">Preview</p>
              <p className="whitespace-pre-wrap leading-relaxed opacity-90">{preview}…</p>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-slate-200">
        <p className="text-[10px] text-slate-500">Cron automático: diariamente às 7h</p>
        <p className="text-[10px] text-slate-500">Consolida: Plata + Lari + Dieguito</p>
      </div>
    </div>
  )
}
