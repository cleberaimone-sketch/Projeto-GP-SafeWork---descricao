'use client'

import { useState, useRef, useEffect } from 'react'

interface Msg {
  role: 'user' | 'assistant'
  content: string
}

interface Props {
  initialMessages?: Msg[]
}

export default function CarlitosChat({ initialMessages = [] }: Props) {
  const [msgs, setMsgs] = useState<Msg[]>(initialMessages)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs])

  async function send() {
    const texto = input.trim()
    if (!texto || loading) return
    setInput('')
    const newMsgs: Msg[] = [...msgs, { role: 'user', content: texto }]
    setMsgs(newMsgs)
    setLoading(true)
    try {
      const res = await fetch('/api/agentes/carlitos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pergunta: texto, historico: msgs }),
      })
      const data = await res.json()
      setMsgs([...newMsgs, { role: 'assistant', content: data.resposta ?? data.error ?? 'Erro' }])
    } catch {
      setMsgs([...newMsgs, { role: 'assistant', content: '⚠️ Erro de conexão.' }])
    } finally {
      setLoading(false)
    }
  }

  const SUGESTOES = [
    'Quais processos estão travados hoje?',
    'Como está o roadmap do SafeChat?',
    'Onde está o gargalo do onboarding?',
    'Status da migração Conta Azul → Unisyst?',
  ]

  return (
    <div className="flex flex-col h-[520px] bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {msgs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-700 text-white flex items-center justify-center text-xl font-bold mb-3 shadow-lg">Ca</div>
            <p className="text-slate-700 text-sm font-semibold">E aí, Cleber! Sou o Carlitos, processos e tech.</p>
            <p className="text-slate-500 text-xs mt-1 mb-4">Pergunte sobre SafeHelp, gargalos de processo ou o time</p>
            <div className="grid grid-cols-1 gap-1.5 w-full max-w-xs">
              {SUGESTOES.map(s => (
                <button
                  key={s}
                  onClick={() => { setInput(s); setTimeout(() => send(), 50) }}
                  className="text-xs text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg px-3 py-1.5 text-left transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'assistant' && (
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-700 text-white flex items-center justify-center text-[10px] font-bold mr-2 mt-0.5 shrink-0 shadow-sm">Ca</div>
            )}
            <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
              m.role === 'user'
                ? 'bg-indigo-700 text-white rounded-br-none'
                : 'bg-slate-100 text-slate-900 rounded-bl-none border border-slate-200'
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-700 text-white flex items-center justify-center text-[10px] font-bold mr-2 mt-0.5 shadow-sm">Ca</div>
            <div className="bg-slate-100 rounded-xl rounded-bl-none px-4 py-2.5 text-slate-500 text-sm border border-slate-200">
              <span className="animate-pulse">···</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="p-3 border-t border-slate-200 flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="Pergunte ao Carlitos sobre processos/tech..."
          className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500"
          disabled={loading}
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          className="px-4 py-2 bg-indigo-700 hover:bg-indigo-800 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
        >
          Enviar
        </button>
      </div>
    </div>
  )
}
