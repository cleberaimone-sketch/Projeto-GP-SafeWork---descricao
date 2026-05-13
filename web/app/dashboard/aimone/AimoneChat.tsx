'use client'

import { useState, useRef, useEffect } from 'react'

interface Msg { role: 'user' | 'assistant'; content: string }
interface Props { initialMessages?: Msg[] }

export default function AimoneChat({ initialMessages = [] }: Props) {
  const [msgs, setMsgs] = useState<Msg[]>(initialMessages)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  async function send() {
    const texto = input.trim()
    if (!texto || loading) return
    setInput('')
    const newMsgs: Msg[] = [...msgs, { role: 'user', content: texto }]
    setMsgs(newMsgs)
    setLoading(true)
    try {
      const res = await fetch('/api/agentes/aimone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto, historico: msgs }),
      })
      const data = await res.json()
      setMsgs([...newMsgs, { role: 'assistant', content: data.resposta ?? data.error ?? 'Erro' }])
    } catch {
      setMsgs([...newMsgs, { role: 'assistant', content: '⚠️ Erro de conexão.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-[520px] bg-gray-900 rounded-xl border border-gray-800">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {msgs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-12 h-12 rounded-full bg-violet-900/50 flex items-center justify-center text-2xl mb-3">🧩</div>
            <p className="text-gray-400 text-sm">Olá, Cleber. Como posso te ajudar hoje?</p>
            <p className="text-gray-600 text-xs mt-1">Pergunte sobre suas mensagens, organização ou automação</p>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'assistant' && (
              <div className="w-6 h-6 rounded-full bg-violet-900 flex items-center justify-center text-xs mr-2 mt-0.5 shrink-0">A</div>
            )}
            <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
              m.role === 'user' ? 'bg-violet-600 text-white rounded-br-none' : 'bg-gray-800 text-gray-100 rounded-bl-none'
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="w-6 h-6 rounded-full bg-violet-900 flex items-center justify-center text-xs mr-2 mt-0.5">A</div>
            <div className="bg-gray-800 rounded-xl rounded-bl-none px-4 py-2.5 text-gray-400 text-sm">
              <span className="animate-pulse">···</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="p-3 border-t border-gray-800 flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="Pergunte ao Aimone..."
          className="flex-1 bg-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:ring-1 focus:ring-violet-500"
          disabled={loading}
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 rounded-lg text-sm font-medium transition-colors"
        >
          Enviar
        </button>
      </div>
    </div>
  )
}
