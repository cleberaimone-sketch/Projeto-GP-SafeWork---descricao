'use client'

import { useMemo, useState } from 'react'

export type FilaItem = {
  id: string
  empresa_id: string
  empresa_nome: string
  categoria: string
  descricao: string
  valor: number
  data_vencimento: string
  diasAteVencer: number
  intocavel: boolean
  decisao: 'pagar' | 'adiar' | null
}

export type EmpresaCaixa = {
  empresa_id: string
  nome: string
  saldo: number
  vence: number
  gap: number
  temSaldo: boolean
}

type Resumo = { totalVence: number; totalTenho: number; totalAporte: number; nVermelho: number; totalFila: number }

interface Props {
  tabelaPronta: boolean
  resumo: Resumo
  empresas: EmpresaCaixa[]
  fila: FilaItem[]
  hojeISO: string
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const fmt2 = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
function fmtVenc(iso: string, dias: number): { txt: string; venc: boolean } {
  if (!iso) return { txt: '—', venc: false }
  const [a, m, d] = iso.split('-')
  const data = `${d}/${m}`
  if (dias < 0) return { txt: `${data} · há ${Math.abs(dias)}d`, venc: true }
  if (dias === 0) return { txt: `${data} · hoje`, venc: true }
  return { txt: `${data} · em ${dias}d`, venc: false }
}

export default function CaixaClient({ tabelaPronta, resumo, empresas, fila, hojeISO }: Props) {
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [empresa, setEmpresa] = useState('')
  const [soIntocaveis, setSoIntocaveis] = useState(false)
  const [soVencidos, setSoVencidos] = useState(false)
  const [busca, setBusca] = useState('')

  const lista = useMemo(() => {
    let arr = fila
    if (empresa) arr = arr.filter(f => f.empresa_id === empresa)
    if (soIntocaveis) arr = arr.filter(f => f.intocavel)
    if (soVencidos) arr = arr.filter(f => f.diasAteVencer < 0)
    if (busca.trim()) {
      const q = busca.toLowerCase()
      arr = arr.filter(f => f.descricao.toLowerCase().includes(q) || f.categoria.toLowerCase().includes(q) || f.empresa_nome.toLowerCase().includes(q))
    }
    return arr
  }, [fila, empresa, soIntocaveis, soVencidos, busca])

  const totalSel = useMemo(() => fila.filter(f => sel.has(f.id)).reduce((s, f) => s + f.valor, 0), [fila, sel])
  const saldoApos = resumo.totalTenho - totalSel

  function toggle(id: string) {
    setSel(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function marcarVisiveis(marcar: boolean) {
    setSel(prev => {
      const n = new Set(prev)
      for (const f of lista) marcar ? n.add(f.id) : n.delete(f.id)
      return n
    })
  }
  const empresasComFila = useMemo(() => Array.from(new Set(fila.map(f => f.empresa_id)))
    .map(id => ({ id, nome: fila.find(f => f.empresa_id === id)!.empresa_nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome)), [fila])

  return (
    <>
      {!tabelaPronta && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 mb-4 text-xs text-amber-800">
          A simulação abaixo já funciona. Para <strong>salvar decisões e gerar lista</strong>, aplique a migration <code className="bg-white/60 px-1 rounded">20260723120000_caixa_do_dia.sql</code> no SQL Editor.
        </div>
      )}
      {/* Faixa de topo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Vence (hoje + 7d)</p>
          <p className="text-lg font-bold text-slate-800 tabular-nums mt-1">{fmt(resumo.totalVence)}</p>
          <p className="text-[10px] text-slate-500 mt-1">{resumo.totalFila} contas a pagar</p>
        </div>
        <div className={`rounded-xl border p-4 ${resumo.totalTenho >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
          <p className={`text-[10px] uppercase tracking-wider font-semibold ${resumo.totalTenho >= 0 ? 'text-emerald-800' : 'text-red-800'}`}>Tenho (saldo)</p>
          <p className={`text-lg font-bold tabular-nums mt-1 ${resumo.totalTenho >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{fmt(resumo.totalTenho)}</p>
          <p className="text-[10px] text-slate-500 mt-1">saldo bancário consolidado</p>
        </div>
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
          <p className="text-[10px] text-amber-800 uppercase tracking-wider font-semibold">Falta (aporte total)</p>
          <p className="text-lg font-bold text-amber-700 tabular-nums mt-1">{fmt(resumo.totalAporte)}</p>
          <p className="text-[10px] text-slate-500 mt-1">soma do que falta por empresa</p>
        </div>
        <div className={`rounded-xl border p-4 ${resumo.nVermelho > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Empresas no vermelho</p>
          <p className={`text-lg font-bold tabular-nums mt-1 ${resumo.nVermelho > 0 ? 'text-red-700' : 'text-slate-800'}`}>{resumo.nVermelho}</p>
          <p className="text-[10px] text-slate-500 mt-1">não cobrem o que vence</p>
        </div>
      </div>

      {/* Cartões por empresa */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {empresas.map(e => {
          const cobre = e.gap <= 0
          return (
            <div key={e.empresa_id} className={`rounded-xl border p-4 ${cobre ? 'bg-white border-slate-200' : 'bg-red-50/40 border-red-200'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-slate-800">{e.nome}</span>
                {cobre
                  ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">cobre</span>
                  : <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-800">falta {fmt(e.gap)}</span>}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div><p className="text-[9px] text-slate-400 uppercase">Saldo</p><p className={`text-xs font-bold tabular-nums ${e.saldo >= 0 ? 'text-slate-700' : 'text-red-700'}`}>{e.temSaldo ? fmt(e.saldo) : '—'}</p></div>
                <div><p className="text-[9px] text-slate-400 uppercase">Vence</p><p className="text-xs font-bold text-slate-700 tabular-nums">{fmt(e.vence)}</p></div>
                <div><p className="text-[9px] text-slate-400 uppercase">Aporte</p><p className={`text-xs font-bold tabular-nums ${e.gap > 0 ? 'text-amber-700' : 'text-slate-300'}`}>{e.gap > 0 ? fmt(e.gap) : '—'}</p></div>
              </div>
              {!e.temSaldo && <p className="text-[9px] text-amber-600 mt-2">⚠ sem saldo real (conectar no Pluggy)</p>}
            </div>
          )
        })}
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {empresasComFila.length > 1 && (
          <select value={empresa} onChange={e => setEmpresa(e.target.value)} className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800">
            <option value="">Todas as empresas</option>
            {empresasComFila.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        )}
        <button onClick={() => setSoVencidos(v => !v)} className={`px-3 py-1.5 text-xs rounded-lg border ${soVencidos ? 'bg-red-600 border-red-500 text-white' : 'bg-white border-slate-200 text-slate-600'}`}>Só vencidos</button>
        <button onClick={() => setSoIntocaveis(v => !v)} className={`px-3 py-1.5 text-xs rounded-lg border ${soIntocaveis ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-200 text-slate-600'}`}>🔒 Só intocáveis</button>
        <input type="text" placeholder="Buscar fornecedor/categoria…" value={busca} onChange={e => setBusca(e.target.value)} className="flex-1 min-w-[180px] bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400" />
        <span className="text-[10px] text-slate-500">{lista.length} de {fila.length}</span>
      </div>

      {/* Fila */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-24">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50/80">
              <tr>
                <th className="px-3 py-2 w-8"><input type="checkbox" onChange={e => marcarVisiveis(e.target.checked)} checked={lista.length > 0 && lista.every(f => sel.has(f.id))} /></th>
                <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Vencimento</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Empresa</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Fornecedor / descrição</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Categoria</th>
                <th className="text-right px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Valor</th>
                <th className="text-right px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Prioridade</th>
              </tr>
            </thead>
            <tbody>
              {lista.map(f => {
                const v = fmtVenc(f.data_vencimento, f.diasAteVencer)
                const marcado = sel.has(f.id)
                return (
                  <tr key={f.id} className={`border-t border-slate-200/70 hover:bg-slate-100/30 ${marcado ? 'bg-emerald-50/40' : ''}`}>
                    <td className="px-3 py-2"><input type="checkbox" checked={marcado} onChange={() => toggle(f.id)} /></td>
                    <td className={`px-3 py-2 tabular-nums whitespace-nowrap ${v.venc ? 'text-red-700 font-medium' : 'text-slate-600'}`}>{v.txt}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{f.empresa_nome}</td>
                    <td className="px-3 py-2 text-slate-800 max-w-[260px] truncate" title={f.descricao}>{f.descricao}</td>
                    <td className="px-3 py-2 text-slate-500 max-w-[200px] truncate" title={f.categoria}>{f.categoria}</td>
                    <td className="px-3 py-2 text-right font-medium text-slate-800 tabular-nums whitespace-nowrap">{fmt2(f.valor)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {f.intocavel
                        ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-white">🔒 Intocável</span>
                        : <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">negociável</span>}
                    </td>
                  </tr>
                )
              })}
              {lista.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Nada a pagar neste filtro 🎉</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Barra de ação fixa */}
      {sel.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] z-20">
          <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-3 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-5 text-xs">
              <span className="text-slate-600"><strong className="text-slate-900">{sel.size}</strong> selecionadas</span>
              <span className="text-slate-600">Total <strong className="text-slate-900 tabular-nums">{fmt2(totalSel)}</strong></span>
              <span className={saldoApos >= 0 ? 'text-emerald-700' : 'text-red-700'}>Saldo após pagar <strong className="tabular-nums">{fmt2(saldoApos)}</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setSel(new Set())} className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700">Limpar</button>
              <span className="text-[10px] text-slate-400">Marcar e gerar lista: próxima fase</span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
