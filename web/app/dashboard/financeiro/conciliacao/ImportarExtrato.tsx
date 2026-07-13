'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  empresas: { id: string; nome_curto: string }[]
}

export default function ImportarExtrato({ empresas }: Props) {
  const router = useRouter()
  const [aberto, setAberto]     = useState(false)
  const [empresa, setEmpresa]   = useState('')
  const [contaNome, setContaNome] = useState('')
  const [arquivo, setArquivo]   = useState<File | null>(null)
  const [busy, setBusy]         = useState(false)
  const [msg, setMsg]           = useState<string | null>(null)
  const [erro, setErro]         = useState<string | null>(null)

  async function enviar() {
    if (!arquivo || !contaNome.trim()) { setErro('Escolha o arquivo e informe o nome da conta.'); return }
    setBusy(true); setErro(null); setMsg(null)
    try {
      const fd = new FormData()
      fd.append('arquivo', arquivo)
      fd.append('conta_nome', contaNome.trim())
      if (empresa) fd.append('empresa_id', empresa)
      const res = await fetch('/api/financeiro/extrato', { method: 'POST', body: fd })
      const d = await res.json()
      if (!res.ok) { setErro(d.error ?? 'Erro ao importar.') }
      else {
        setMsg(`✅ ${d.novos} novos movimentos importados (${d.total} lidos · ${d.duplicados} já existiam).${d.aviso ? ' ⚠️ ' + d.aviso : ''}`)
        setArquivo(null)
        router.refresh()
      }
    } catch (e) { setErro(String(e)) } finally { setBusy(false) }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 mb-6">
      <button
        onClick={() => setAberto(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3 text-left"
      >
        <span className="text-sm font-semibold text-slate-800">📥 Importar extrato (OFX do Itaú/Cora · XLS do Conta Azul)</span>
        <span className="text-slate-400 text-xs">{aberto ? 'fechar ▲' : 'abrir ▼'}</span>
      </button>

      {aberto && (
        <div className="px-5 pb-5 border-t border-slate-100 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Empresa</label>
              <select
                value={empresa}
                onChange={e => setEmpresa(e.target.value)}
                className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800"
              >
                <option value="">Sem vínculo / consolidado</option>
                {empresas.map(e => <option key={e.id} value={e.id}>{e.nome_curto}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Nome da conta</label>
              <input
                type="text"
                value={contaNome}
                onChange={e => setContaNome(e.target.value)}
                placeholder="ex: Conta Azul Digital"
                className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 placeholder-slate-400"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Arquivo (.ofx / .xls / .xlsx)</label>
              <input
                type="file"
                accept=".ofx,.xls,.xlsx,.csv"
                onChange={e => setArquivo(e.target.files?.[0] ?? null)}
                className="w-full mt-1 text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-slate-700 file:text-white file:text-xs file:cursor-pointer"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={enviar}
              disabled={busy}
              className="px-4 py-1.5 text-xs bg-teal-700 hover:bg-teal-600 disabled:opacity-50 rounded-lg text-white font-medium"
            >
              {busy ? 'Importando…' : 'Importar extrato'}
            </button>
            <span className="text-[11px] text-slate-400">Reenviar o mesmo período não duplica.</span>
          </div>

          {(msg || erro) && (
            <div className={`mt-3 text-xs px-3 py-2 rounded-md ${erro ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}>
              {erro || msg}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
