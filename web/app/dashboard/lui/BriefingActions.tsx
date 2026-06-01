'use client'

import { useState } from 'react'

interface Props {
  briefingHojeExiste: boolean
}

export default function BriefingActions({ briefingHojeExiste }: Props) {
  const [briefingStatus, setBriefingStatus] = useState<'idle' | 'loading' | 'ok' | 'erro'>('idle')
  const [briefingMsg, setBriefingMsg] = useState('')
  const [briefingPreview, setBriefingPreview] = useState('')

  const [alertasStatus, setAlertasStatus] = useState<'idle' | 'loading' | 'ok' | 'erro'>('idle')
  const [alertasMsg, setAlertasMsg] = useState('')

  async function dispararBriefing(forcar = false) {
    setBriefingStatus('loading')
    setBriefingMsg('')
    setBriefingPreview('')
    try {
      const url = forcar ? '/api/lui/briefing?forcar=1' : '/api/lui/briefing'
      const res = await fetch(url)
      const data = await res.json()

      if (data.duplicado) {
        setBriefingStatus('ok')
        setBriefingMsg('Briefing já foi gerado hoje. Use "Forçar reenvio" para gerar novamente.')
        return
      }
      if (!res.ok || !data.ok) {
        setBriefingStatus('erro')
        setBriefingMsg(data.error ?? 'Erro ao gerar briefing')
        return
      }
      setBriefingStatus('ok')
      setBriefingMsg(data.enviado
        ? '✓ Briefing gerado e enviado via WhatsApp!'
        : '✓ Briefing gerado (WhatsApp não configurado)')
      if (data.briefing) setBriefingPreview(data.briefing.slice(0, 400))
    } catch (e) {
      setBriefingStatus('erro')
      setBriefingMsg('Erro de conexão')
      console.error(e)
    }
  }

  async function verificarAlertas(forcar = false) {
    setAlertasStatus('loading')
    setAlertasMsg('')
    try {
      const res = await fetch('/api/lui/alertas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forcar }),
      })
      const data = await res.json()

      if (!res.ok) {
        setAlertasStatus('erro')
        setAlertasMsg(data.error ?? 'Erro ao verificar alertas')
        return
      }
      setAlertasStatus('ok')
      if (data.alertas === 0) {
        setAlertasMsg(data.mensagem ?? '✓ Nenhuma condição crítica ativa no momento')
      } else {
        setAlertasMsg(data.enviado
          ? `✓ ${data.alertas} alerta(s) enviado(s) via WhatsApp`
          : `✓ ${data.alertas} alerta(s) identificado(s) (WhatsApp não configurado)`)
      }
    } catch (e) {
      setAlertasStatus('erro')
      setAlertasMsg('Erro de conexão')
      console.error(e)
    }
  }

  return (
    <div className="space-y-4">
      {/* Briefing manual */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">Briefing Manual</h3>

        <div className="space-y-2">
          <button
            onClick={() => dispararBriefing(false)}
            disabled={briefingStatus === 'loading'}
            className="w-full text-xs bg-blue-700 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 rounded-lg transition-colors font-semibold shadow-sm"
          >
            {briefingStatus === 'loading' ? '⏳ Gerando...' : '🌅 Gerar briefing agora'}
          </button>

          {briefingHojeExiste && (
            <button
              onClick={() => dispararBriefing(true)}
              disabled={briefingStatus === 'loading'}
              className="w-full text-xs bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 py-2 rounded-lg transition-colors border border-slate-200 font-medium"
            >
              Forçar reenvio (já existe hoje)
            </button>
          )}
        </div>

        {briefingStatus !== 'idle' && (
          <div className={`mt-3 rounded-lg p-3 text-xs border ${
            briefingStatus === 'loading' ? 'bg-blue-50 text-blue-800 border-blue-200' :
            briefingStatus === 'ok'      ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                                           'bg-red-50 text-red-800 border-red-200'
          }`}>
            <p className="font-medium">{briefingMsg}</p>
            {briefingPreview && (
              <div className="mt-2 pt-2 border-t border-current/20">
                <p className="font-bold mb-1 text-[10px] uppercase tracking-wider opacity-80">Preview</p>
                <p className="whitespace-pre-wrap leading-relaxed opacity-90">{briefingPreview}…</p>
              </div>
            )}
          </div>
        )}

        <div className="mt-3 pt-3 border-t border-slate-200">
          <p className="text-[10px] text-slate-500">Cron automático: diariamente às 7h BRT</p>
          <p className="text-[10px] text-slate-500">Consolida: Plata · Lari · Dieguito · Luizito · Le · Carlitos · Nina (seg)</p>
        </div>
      </div>

      {/* Alertas intradiários */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">Alertas Intradiários</h3>

        <div className="space-y-2">
          <button
            onClick={() => verificarAlertas(false)}
            disabled={alertasStatus === 'loading'}
            className="w-full text-xs bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 rounded-lg transition-colors font-semibold shadow-sm"
          >
            {alertasStatus === 'loading' ? '⏳ Verificando...' : '⚡ Verificar alertas agora'}
          </button>

          <button
            onClick={() => verificarAlertas(true)}
            disabled={alertasStatus === 'loading'}
            className="w-full text-xs bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 py-2 rounded-lg transition-colors border border-slate-200 font-medium"
          >
            Forçar reenvio (ignorar dedup)
          </button>
        </div>

        {alertasStatus !== 'idle' && (
          <div className={`mt-3 rounded-lg p-3 text-xs border ${
            alertasStatus === 'loading' ? 'bg-amber-50 text-amber-800 border-amber-200' :
            alertasStatus === 'ok'      ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                                          'bg-red-50 text-red-800 border-red-200'
          }`}>
            <p className="font-medium">{alertasMsg}</p>
          </div>
        )}

        <div className="mt-3 pt-3 border-t border-slate-200">
          <p className="text-[10px] text-slate-500">Cron automático: 13h e 18h BRT</p>
          <p className="text-[10px] text-slate-500">Verifica: sync errors · despesas vencendo · inadimplência</p>
        </div>
      </div>
    </div>
  )
}
