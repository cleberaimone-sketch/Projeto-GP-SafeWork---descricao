'use client'

import { useState, useRef, useEffect } from 'react'

interface Msg {
  role: 'user' | 'assistant'
  content: string
}

interface Props {
  initialMessages?: Msg[]
}

export default function LuizitoChat({ initialMessages = [] }: Props) {
  const [msgs, setMsgs] = useState<Msg[]>(initialMessages)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs])

  async function send() {
    const pergunta = input.trim()
    if (!pergunta || loading) return
    setInput('')
    const newMsgs: Msg[] = [...msgs, { role: 'user', content: pergunta }]
    setMsgs(newMsgs)
    setLoading(true)
    try {
      const res = await fetch('/api/agentes/luizito', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pergunta, historico: msgs }),
      })
      const data = await res.json()
      setMsgs([...newMsgs, { role: 'assistant', content: data.resposta ?? data.error ?? 'Erro' }])
    } catch {
      setMsgs([...newMsgs, { role: 'assistant', content: '⚠️ Erro de conexão.' }])
    } finally {
      setLoading(false)
    }
  }

  const sugestoes = [
    'Quais clientes têm mais vidas?',
    'Documentos vencendo este mês?',
    'Como está a inadimplência de receita?',
    'Oportunidades de renovação urgentes?',
  ]

  return (
    <div className="flex flex-col h-[540px] bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {msgs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4">
            <div className="w-12 h-12 rounded-full bg-purple-50 border border-purple-200 flex items-center justify-center text-2xl">📈</div>
            <div>
              <p className="text-slate-700 text-sm font-medium">Oi, sou o Luizito — seu gerente comercial.</p>
              <p className="text-slate-500 text-xs mt-1">Pergunte sobre clientes, oportunidades ou receita.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
              {sugestoes.map(s => (
                <button
                  key={s}
                  onClick={() => { setInput(s); }}
                  className="text-left text-xs bg-slate-50 hover:bg-purple-50 border border-slate-200 hover:border-purple-300 rounded-lg px-3 py-2 text-slate-600 transition-colors"
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
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-600 to-purple-900 text-white flex items-center justify-center text-xs mr-2 mt-0.5 shrink-0 shadow-sm">Lu</div>
            )}
            <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap shadow-sm ${
              m.role === 'user'
                ? 'bg-purple-700 text-white rounded-br-none'
                : 'bg-slate-100 text-slate-800 rounded-bl-none border border-slate-200'
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-600 to-purple-900 text-white flex items-center justify-center text-xs mr-2 mt-0.5">Lu</div>
            <div className="bg-slate-100 border border-slate-200 rounded-xl rounded-bl-none px-4 py-2.5 text-slate-500 text-sm">
              <span className="animate-pulse">···</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="p-3 border-t border-slate-200 flex gap-2 bg-slate-50 rounded-b-xl">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="Pergunte ao Luizito..."
          className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
          disabled={loading}
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          className="px-4 py-2 bg-purple-700 hover:bg-purple-800 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
        >
          Enviar
        </button>
      </div>
    </div>
  )
}
