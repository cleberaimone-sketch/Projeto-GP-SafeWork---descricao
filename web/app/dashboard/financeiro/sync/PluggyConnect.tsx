'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

type PluggyItem = {
  pluggy_item_id: string
  empresa_id: string | null
  instituicao_nome: string | null
  instituicao_imagem: string | null
  status: string | null
  last_updated_at: string | null
  updated_at: string
}

type PluggyAccount = {
  pluggy_item_id: string
  empresa_id: string | null
  pluggy_account_id: string
  subtipo: string | null
  numero: string | null
  marca: string | null
  saldo: number
  atualizado_em: string
}

type Empresa = { id: string; nome_curto: string }

interface Props {
  empresas: Empresa[]
}

export default function PluggyConnect({ empresas }: Props) {
  const [items, setItems]         = useState<PluggyItem[]>([])
  const [accounts, setAccounts]   = useState<PluggyAccount[]>([])
  const [loading, setLoading]     = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [syncing, setSyncing]     = useState(false)
  const [erro, setErro]           = useState('')
  const [empresaSel, setEmpresaSel] = useState<string>('')
  const popupRef = useRef<Window | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/pluggy/items')
      const data = await res.json()
      setItems(data.items ?? [])
      setAccounts(data.accounts ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Escuta mensagem do popup de callback
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type === 'pluggy_connected') {
        setConnecting(false)
        load()
      }
      if (e.data?.type === 'pluggy_error') {
        setConnecting(false)
        setErro(e.data.message ?? 'Erro na conexão Pluggy')
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [load])

  async function conectar() {
    setErro('')
    setConnecting(true)
    try {
      const tokenRes = await fetch('/api/pluggy/connect-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const tokenData = await tokenRes.json()
      if (!tokenRes.ok) {
        setErro(tokenData.error ?? 'Erro ao gerar token Pluggy')
        setConnecting(false)
        return
      }

      // Salva empresaId para o callback recuperar
      sessionStorage.setItem('pluggy_empresa_id', empresaSel)

      const token   = tokenData.accessToken
      const callback = `${window.location.origin}/dashboard/financeiro/sync/pluggy-callback`
      const url = `https://connect.pluggy.ai/?connectToken=${encodeURIComponent(token)}&token=${encodeURIComponent(token)}&redirectUrl=${encodeURIComponent(callback)}`
      console.log('[Pluggy] token:', token?.slice(0, 30), '...  URL:', url.slice(0, 120))

      const popup = window.open(url, 'pluggy_connect', 'width=520,height=800,left=200,top=100')
      popupRef.current = popup

      if (!popup) {
        setErro('Popup bloqueado pelo navegador — permita popups para este site e tente novamente.')
        setConnecting(false)
        return
      }

      // Detecta quando o popup fecha sem ter postMessage (ex: usuário fechou manualmente)
      const t = setInterval(() => {
        if (popup.closed) {
          clearInterval(t)
          setConnecting(false)
          load()
        }
      }, 800)
    } catch (err) {
      setErro((err as Error).message)
      setConnecting(false)
    }
  }

  async function sincronizar(itemId?: string) {
    setSyncing(true)
    setErro('')
    try {
      const res = await fetch('/api/pluggy/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itemId ? { itemId } : {}),
      })
      const data = await res.json()
      if (!res.ok) setErro(data.error ?? 'Erro no sync')
      await load()
    } finally {
      setSyncing(false)
    }
  }

  async function desconectar(itemId: string, banco: string) {
    if (!confirm(`Desconectar conta do ${banco}?\n\nIsso vai remover os saldos vinculados.`)) return
    setErro('')
    const res = await fetch(`/api/pluggy/items/${itemId}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) setErro(data.error ?? 'Erro ao desconectar')
    await load()
  }

  const empresaMap: Record<string, string> = {}
  for (const e of empresas) empresaMap[e.id] = e.nome_curto

  const fmtBRL = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 })

  const fmtData = (s: string | null) =>
    s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

  const statusBadge = (status: string | null) => {
    if (!status) return { txt: 'sem status', cor: 'bg-slate-100 text-slate-600 border-slate-200' }
    if (status === 'UPDATED')             return { txt: '✓ atualizado',     cor: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
    if (status === 'UPDATING')            return { txt: '⏳ atualizando',   cor: 'bg-blue-50 text-blue-700 border-blue-200' }
    if (status === 'LOGIN_ERROR')         return { txt: '✕ login expirou',  cor: 'bg-red-50 text-red-700 border-red-200' }
    if (status === 'WAITING_USER_INPUT')  return { txt: '👤 ação necessária', cor: 'bg-amber-50 text-amber-700 border-amber-200' }
    if (status === 'OUTDATED')            return { txt: '⚠ desatualizado',  cor: 'bg-amber-50 text-amber-700 border-amber-200' }
    return { txt: status.toLowerCase(), cor: 'bg-slate-100 text-slate-600 border-slate-200' }
  }

  const contasPorItem: Record<string, PluggyAccount[]> = {}
  for (const a of accounts) {
    if (!contasPorItem[a.pluggy_item_id]) contasPorItem[a.pluggy_item_id] = []
    contasPorItem[a.pluggy_item_id].push(a)
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Open Finance · Pluggy</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Saldos bancários reais via Open Banking. Abre em popup — permita popups neste site.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <button
              onClick={() => sincronizar()}
              disabled={syncing}
              className="text-xs px-3 py-2 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg font-semibold text-slate-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              {syncing ? '⏳ Sincronizando...' : '↻ Atualizar saldos'}
            </button>
          )}
          <select
            value={empresaSel}
            onChange={e => setEmpresaSel(e.target.value)}
            className="text-xs px-2 py-2 bg-white border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Sem empresa vinculada</option>
            {empresas.map(e => <option key={e.id} value={e.id}>{e.nome_curto}</option>)}
          </select>
          <button
            onClick={conectar}
            disabled={connecting}
            className="text-xs px-3 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg font-semibold disabled:opacity-50 transition-colors shadow-sm"
          >
            {connecting ? '⏳ Conectando...' : '+ Conectar conta'}
          </button>
        </div>
      </div>

      {erro && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
          {erro}
        </div>
      )}

      {connecting && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 animate-pulse">
          🔗 Conectando banco no popup — finalize o fluxo lá e retorne aqui.
        </div>
      )}

      {loading ? (
        <p className="text-xs text-slate-500 py-4 text-center animate-pulse">Carregando conexões...</p>
      ) : items.length === 0 ? (
        <div className="py-8 text-center bg-slate-50 rounded-lg border border-dashed border-slate-300">
          <p className="text-sm text-slate-600 font-medium">Nenhum banco conectado</p>
          <p className="text-xs text-slate-500 mt-1">
            Clique em <span className="font-semibold">+ Conectar conta</span>, selecione a empresa e faça login no banco
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => {
            const contas = contasPorItem[item.pluggy_item_id] ?? []
            const status = statusBadge(item.status)
            const saldoTotal = contas
              .filter(c => c.subtipo === 'CHECKING_ACCOUNT' || c.subtipo === 'SAVINGS_ACCOUNT')
              .reduce((s, c) => s + (c.saldo ?? 0), 0)

            return (
              <div key={item.pluggy_item_id} className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between p-3 bg-slate-50 border-b border-slate-200">
                  <div className="flex items-center gap-3">
                    {item.instituicao_imagem && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.instituicao_imagem} alt={item.instituicao_nome ?? ''} className="w-8 h-8 rounded" />
                    )}
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{item.instituicao_nome}</p>
                      <p className="text-[10px] text-slate-500">
                        {item.empresa_id ? empresaMap[item.empresa_id] ?? 'Empresa desconhecida' : 'Sem empresa vinculada'}
                        {' · '}Atualizado {fmtData(item.last_updated_at ?? item.updated_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${status.cor}`}>
                      {status.txt}
                    </span>
                    <button
                      onClick={() => sincronizar(item.pluggy_item_id)}
                      disabled={syncing}
                      className="text-[10px] px-2 py-1 bg-white hover:bg-slate-100 border border-slate-300 rounded text-slate-700 disabled:opacity-50"
                    >
                      ↻
                    </button>
                    <button
                      onClick={() => desconectar(item.pluggy_item_id, item.instituicao_nome ?? 'banco')}
                      className="text-[10px] px-2 py-1 bg-white hover:bg-red-50 border border-slate-300 hover:border-red-300 rounded text-slate-700 hover:text-red-700"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {contas.length > 0 ? (
                  <ul className="divide-y divide-slate-100">
                    {contas.map(c => (
                      <li key={c.pluggy_account_id} className="px-3 py-2 flex items-center justify-between text-xs">
                        <span className="text-slate-700 font-medium">
                          {c.subtipo === 'CHECKING_ACCOUNT' ? 'CC' :
                           c.subtipo === 'SAVINGS_ACCOUNT'  ? 'Poupança' :
                           c.subtipo === 'CREDIT_CARD'      ? 'Cartão' : c.subtipo}
                          {c.numero && ` · ${c.numero}`}
                        </span>
                        <span className={`tabular-nums font-semibold ${c.saldo < 0 ? 'text-red-700' : 'text-slate-900'}`}>
                          {fmtBRL(c.saldo)}
                        </span>
                      </li>
                    ))}
                    <li className="px-3 py-2 flex items-center justify-between text-xs bg-blue-50/50 border-t border-blue-100">
                      <span className="text-blue-800 font-semibold">Saldo CC + Poupança</span>
                      <span className={`tabular-nums font-bold ${saldoTotal < 0 ? 'text-red-700' : 'text-blue-800'}`}>
                        {fmtBRL(saldoTotal)}
                      </span>
                    </li>
                  </ul>
                ) : (
                  <p className="text-xs text-slate-500 px-3 py-3">Sem contas — aguardando primeira sincronização</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
