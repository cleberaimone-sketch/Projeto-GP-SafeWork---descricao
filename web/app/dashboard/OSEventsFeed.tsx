'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface OsEvento {
  id: string
  tipo: string
  origem: string
  payload: Record<string, unknown>
  processado: boolean
  created_at: string
}

interface Props {
  eventosIniciais: OsEvento[]
}

const ICONE_TIPO: Record<string, string> = {
  lead_criado:                '◎',
  lead_qualificado:           '◉',
  lead_recuperado:            '◉',
  lead_perdido:               '◌',
  proposta_gerada:            '◈',
  venda_fechada:              '✦',
  pagamento_confirmado:       '✦',
  pagamento_recebido:         '✦',
  cliente_criado:             '◈',
  contrato_gerado:            '◈',
  contrato_assinado:          '✦',
  followup_agendado:          '◎',
  intervencao_humana_criada:  '⚑',
  ordem_servico_aberta:       '◎',
  exame_agendado:             '◎',
  visita_tecnica_agendada:    '◎',
  documento_entregue:         '◈',
  fatura_gerada:              '◎',
  briefing_gerado:            '◈',
  alerta_critico:             '⚑',
}

const COR_TIPO: Record<string, string> = {
  venda_fechada:              'text-emerald-600',
  pagamento_confirmado:       'text-emerald-600',
  pagamento_recebido:         'text-emerald-600',
  contrato_assinado:          'text-emerald-600',
  lead_criado:                'text-blue-500',
  lead_qualificado:           'text-blue-500',
  lead_recuperado:            'text-blue-500',
  proposta_gerada:            'text-blue-500',
  followup_agendado:          'text-blue-400',
  lead_perdido:               'text-slate-400',
  intervencao_humana_criada:  'text-amber-500',
  alerta_critico:             'text-red-600',
}

function relTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60)    return 'agora'
  if (diff < 3600)  return `${Math.floor(diff / 60)}min`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function origemLabel(origem: string): string {
  const map: Record<string, string> = {
    command_center: 'Cmd Center',
    gp_sales_ia:    'Sales IA',
    gp_erp_core:    'ERP Core',
    gp_sst_core:    'SST Core',
    d4sign:         'D4sign',
    conta_azul:     'Conta Azul',
    externo:        'Externo',
  }
  return map[origem] ?? origem
}

export default function OSEventsFeed({ eventosIniciais }: Props) {
  const [eventos, setEventos] = useState<OsEvento[]>(eventosIniciais)
  const [novas, setNovas] = useState(0)
  const sb = createClient()

  useEffect(() => {
    const channel = sb
      .channel('os-eventos')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'os_eventos' },
        (payload) => {
          const ev = payload.new as OsEvento
          setEventos(prev => [ev, ...prev].slice(0, 30))
          setNovas(n => n + 1)
          setTimeout(() => setNovas(0), 4000)
        }
      )
      .subscribe()

    return () => { sb.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (eventos.length === 0) {
    return (
      <div className="py-4 text-center">
        <p className="text-[11px]" style={{ color: 'var(--ink-4)' }}>
          Aguardando eventos do ecossistema.
          Módulos publicam via <span className="font-mono">POST /api/os/eventos</span>.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <p className="eyebrow" style={{ color: 'var(--ink-3)' }}>
            GP SafeWork OS — eventos do ecossistema
          </p>
          {novas > 0 && (
            <span className="text-[10px] bg-violet-500 text-white px-1.5 py-0.5 rounded-full font-bold animate-pulse">
              +{novas}
            </span>
          )}
        </div>
        <p className="text-[11px]" style={{ color: 'var(--ink-4)' }}>
          {eventos.length} evento{eventos.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="space-y-0" style={{ borderTop: '1px solid var(--rule)' }}>
        {eventos.map((ev) => {
          const icone = ICONE_TIPO[ev.tipo] ?? '◌'
          const cor   = COR_TIPO[ev.tipo]  ?? ''
          return (
            <div
              key={ev.id}
              className="flex items-start gap-3 py-2.5"
              style={{ borderBottom: '1px solid var(--rule)' }}
            >
              <span className={`font-mono text-sm shrink-0 mt-0.5 w-4 text-center ${cor || ''}`} style={{ color: cor ? undefined : 'var(--ink-4)' }}>
                {icone}
              </span>

              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <code className={`text-xs font-mono font-medium ${cor}`} style={{ color: cor ? undefined : 'var(--ink)' }}>
                    {ev.tipo}
                  </code>
                  <span className="text-[10px] shrink-0 tabular-nums" style={{ color: 'var(--ink-4)' }}>
                    {relTime(ev.created_at)}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ background: 'var(--paper-2)', color: 'var(--ink-3)' }}>
                    {origemLabel(ev.origem)}
                  </span>
                  {ev.payload && Object.keys(ev.payload).length > 0 && (
                    <span className="text-[10px] truncate" style={{ color: 'var(--ink-4)' }}>
                      {Object.entries(ev.payload)
                        .slice(0, 2)
                        .map(([k, v]) => `${k}: ${String(v)}`)
                        .join(' · ')}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
