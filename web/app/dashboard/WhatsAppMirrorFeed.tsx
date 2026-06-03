'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface MensagemMirror {
  id: string
  contato_numero: string
  contato_nome: string
  mensagem: string
  direcao: 'entrada' | 'saida'
  tipo: string
  lida: boolean
  created_at: string
}

interface Props {
  mensagensIniciais: MensagemMirror[]
}

const ICONE_TIPO: Record<string, string> = {
  audio:     '🎙️',
  imagem:    '🖼️',
  documento: '📄',
  texto:     '',
}

function relTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60)   return 'agora'
  if (diff < 3600) return `${Math.floor(diff / 60)}min`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/)
  if (p.length >= 2) return (p[0][0] + p[1][0]).toUpperCase()
  return nome.slice(0, 2).toUpperCase()
}

const CORES = [
  'bg-emerald-600', 'bg-blue-600', 'bg-violet-600',
  'bg-amber-600',   'bg-rose-600', 'bg-teal-600',
]
function corContato(nome: string): string {
  let hash = 0
  for (let i = 0; i < nome.length; i++) hash = nome.charCodeAt(i) + ((hash << 5) - hash)
  return CORES[Math.abs(hash) % CORES.length]
}

export default function WhatsAppMirrorFeed({ mensagensIniciais }: Props) {
  const [mensagens, setMensagens] = useState<MensagemMirror[]>(mensagensIniciais)
  const [novas, setNovas] = useState(0)
  const sb = createClient()
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const channel = sb
      .channel('wpp-mirror')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mensagens_wpp_mirror' },
        (payload) => {
          const nova = payload.new as MensagemMirror
          setMensagens(prev => [nova, ...prev].slice(0, 50))
          setNovas(n => n + 1)
          // marca como não lida por 3s e limpa o badge
          setTimeout(() => setNovas(0), 3000)
        }
      )
      .subscribe()

    return () => { sb.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (mensagens.length === 0) {
    return (
      <div className="py-4 text-center">
        <p className="text-[11px]" style={{ color: 'var(--ink-4)' }}>
          Nenhuma mensagem SafeWork capturada ainda.
          Configure o webhook da linha <span className="font-mono">45 9 9909-9009</span>.
        </p>
      </div>
    )
  }

  return (
    <div ref={containerRef}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <p className="eyebrow" style={{ color: 'var(--ink-3)' }}>
            WhatsApp Corporativo — espelho ao vivo
          </p>
          {novas > 0 && (
            <span className="text-[10px] bg-emerald-500 text-white px-1.5 py-0.5 rounded-full font-bold animate-pulse">
              +{novas}
            </span>
          )}
        </div>
        <p className="text-[11px]" style={{ color: 'var(--ink-4)' }}>
          {mensagens.length} mensagem{mensagens.length !== 1 ? 's' : ''} · filtrando &ldquo;safe&rdquo;
        </p>
      </div>

      <div className="space-y-0" style={{ borderTop: '1px solid var(--rule)' }}>
        {mensagens.map((m) => (
          <div
            key={m.id}
            className="flex items-start gap-3 py-3 group"
            style={{ borderBottom: '1px solid var(--rule)' }}
          >
            {/* Avatar */}
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 ${corContato(m.contato_nome || m.contato_numero)}`}>
              {m.contato_nome ? iniciais(m.contato_nome) : '#'}
            </div>

            {/* Conteúdo */}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold truncate" style={{ color: 'var(--ink)' }}>
                  {m.contato_nome || m.contato_numero}
                </span>
                <span className="text-[10px] shrink-0 tabular-nums" style={{ color: 'var(--ink-4)' }}>
                  {relTime(m.created_at)}
                </span>
              </div>
              <p className="text-xs truncate mt-0.5" style={{ color: 'var(--ink-3)' }}>
                {m.direcao === 'saida' && (
                  <span className="mr-1 text-[10px]" style={{ color: 'var(--ink-4)' }}>↗</span>
                )}
                {ICONE_TIPO[m.tipo] && <span className="mr-1">{ICONE_TIPO[m.tipo]}</span>}
                {m.mensagem}
              </p>
            </div>

            {/* Indicador de entrada/saída */}
            <div className={`w-1 h-1 rounded-full shrink-0 mt-2 ${m.direcao === 'entrada' ? 'bg-emerald-500' : 'bg-blue-400'}`} />
          </div>
        ))}
      </div>
    </div>
  )
}
