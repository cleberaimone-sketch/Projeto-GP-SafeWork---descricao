'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

export type FilaItem = {
  id: string
  empresa_id: string
  empresa_nome: string
  categoria: string
  descricao: string
  valor: number
  data_vencimento: string
  diasAteVencer: number
  backlogAntigo: boolean
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

export type CategoriaPrio = { categoria: string; total: number; intocavel: boolean; porRegra: boolean; temOverride: boolean }

type Resumo = { totalVence: number; totalTenho: number; totalAporte: number; nVermelho: number; totalFila: number; totalBacklog: number; qtdBacklog: number }

interface Props {
  tabelaPronta: boolean
  resumo: Resumo
  empresas: EmpresaCaixa[]
  fila: FilaItem[]
  categorias: CategoriaPrio[]
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

export default function CaixaClient({ tabelaPronta, resumo, empresas, fila, categorias, hojeISO }: Props) {
  const router = useRouter()
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [empresa, setEmpresa] = useState('')
  const [soIntocaveis, setSoIntocaveis] = useState(false)
  const [soVencidos, setSoVencidos] = useState(false)
  const [ocultarBacklog, setOcultarBacklog] = useState(false)
  const [busca, setBusca] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [mostrarLista, setMostrarLista] = useState(false)
  const [mostrarConfig, setMostrarConfig] = useState(false)

  async function salvarCategoria(cat: string, intocavel: boolean) {
    const ok = await api({ acao: 'categoria', categoria: cat, intocavel })
    if (ok) router.refresh()
  }

  async function api(body: Record<string, unknown>): Promise<boolean> {
    setBusy(true); setMsg(null)
    try {
      const r = await fetch('/api/financeiro/caixa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json()
      if (!r.ok) { setMsg(d.error ?? 'Erro ao salvar'); return false }
      return true
    } catch (e) { setMsg(String(e)); return false } finally { setBusy(false) }
  }

  async function decidir(decisao: 'pagar' | 'adiar') {
    const idsSel = fila.filter(f => sel.has(f.id))
    // Adiar não se aplica a intocáveis (pessoas) — pula e avisa
    const alvo = decisao === 'adiar' ? idsSel.filter(f => !f.intocavel) : idsSel
    const pulados = idsSel.length - alvo.length
    if (alvo.length === 0) { setMsg('Nada a adiar — as selecionadas são intocáveis (pessoas).'); return }
    const ok = await api({ acao: 'decidir', ids: alvo.map(f => f.id), decisao, data_prevista: decisao === 'pagar' ? hojeISO : null })
    if (ok) {
      setSel(new Set())
      setMsg(`${alvo.length} marcadas como "${decisao === 'pagar' ? 'vou pagar' : 'adiar'}".${pulados > 0 ? ` ${pulados} intocáveis não foram adiadas.` : ''}`)
      router.refresh()
    }
  }

  async function togglePrioridade(f: FilaItem) {
    // 🔒 intocável ↔ 🔓 negociável, pontual (override na decisão)
    const novo = f.intocavel ? 'normal' : 'intocavel'
    const ok = await api({ acao: 'prioridade', id: f.id, prioridade_override: novo })
    if (ok) router.refresh()
  }

  // ── Lista de pagamento (o que foi marcado como "vou pagar") ───────────────
  const paraPagar = useMemo(() => fila.filter(f => f.decisao === 'pagar'), [fila])
  const gruposPagar = useMemo<[string, FilaItem[]][]>(() => {
    const m: Record<string, FilaItem[]> = {}
    for (const f of paraPagar) (m[f.empresa_nome] ??= []).push(f)
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0]))
  }, [paraPagar])
  const totalPagar = paraPagar.reduce((s, f) => s + f.valor, 0)

  function exportarCSV() {
    const linhas = [['Empresa', 'Vencimento', 'Fornecedor', 'Categoria', 'Valor'].join(';')]
    for (const f of paraPagar) linhas.push([f.empresa_nome, f.data_vencimento, `"${f.descricao.replace(/"/g, '""')}"`, `"${f.categoria}"`, String(f.valor.toFixed(2)).replace('.', ',')].join(';'))
    const blob = new Blob(['﻿' + linhas.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'lista-pagamento.csv'; a.click()
  }
  function imprimir() {
    const w = window.open('', '_blank'); if (!w) return
    let html = `<html><head><title>Lista de Pagamento</title><style>body{font-family:system-ui,sans-serif;font-size:12px;padding:24px;color:#0f172a}h1{font-size:16px}h2{font-size:13px;margin:18px 0 4px;border-bottom:2px solid #cbd5e1;padding-bottom:3px}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #e2e8f0;padding:4px 8px;text-align:left;font-size:11px}.r{text-align:right}.tot{font-weight:bold}</style></head><body>`
    html += `<h1>Lista de Pagamento</h1><p>Gerada em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · ${paraPagar.length} contas</p>`
    for (const [emp, itens] of gruposPagar) {
      const tot = itens.reduce((s, f) => s + f.valor, 0)
      html += `<h2>${emp} — ${fmt2(tot)}</h2><table><tr><th>Venc.</th><th>Fornecedor</th><th>Categoria</th><th class="r">Valor</th></tr>`
      for (const f of itens) html += `<tr><td>${f.data_vencimento.split('-').reverse().join('/')}</td><td>${f.descricao}</td><td>${f.categoria}</td><td class="r">${fmt2(f.valor)}</td></tr>`
      html += `</table>`
    }
    html += `<h2 class="tot">TOTAL GERAL — ${fmt2(totalPagar)}</h2></body></html>`
    w.document.write(html); w.document.close(); w.focus(); w.print()
  }

  const lista = useMemo(() => {
    let arr = fila
    if (empresa) arr = arr.filter(f => f.empresa_id === empresa)
    if (soIntocaveis) arr = arr.filter(f => f.intocavel)
    if (soVencidos) arr = arr.filter(f => f.diasAteVencer < 0)
    if (ocultarBacklog) arr = arr.filter(f => !f.backlogAntigo)
    if (busca.trim()) {
      const q = busca.toLowerCase()
      arr = arr.filter(f => f.descricao.toLowerCase().includes(q) || f.categoria.toLowerCase().includes(q) || f.empresa_nome.toLowerCase().includes(q))
    }
    return arr
  }, [fila, empresa, soIntocaveis, soVencidos, ocultarBacklog, busca])

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

      {msg && (
        <div className="fixed top-4 right-4 z-30 bg-slate-900 text-white text-xs px-4 py-2.5 rounded-lg shadow-xl max-w-sm flex items-start gap-3">
          <span>{msg}</span>
          <button onClick={() => setMsg(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}
      {/* Faixa de topo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Vence (vencidos + 7d)</p>
          <p className="text-lg font-bold text-slate-800 tabular-nums mt-1">{fmt(resumo.totalVence)}</p>
          <p className="text-[10px] text-slate-500 mt-1">
            {resumo.totalFila} contas
            {resumo.qtdBacklog > 0 && <span className="text-amber-600"> · {fmt(resumo.totalBacklog)} é backlog &gt;1 ano</span>}
          </p>
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
        {resumo.qtdBacklog > 0 && (
          <button onClick={() => setOcultarBacklog(v => !v)} className={`px-3 py-1.5 text-xs rounded-lg border ${ocultarBacklog ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-200 text-slate-600'}`}>Ocultar backlog &gt;1 ano ({resumo.qtdBacklog})</button>
        )}
        <input type="text" placeholder="Buscar fornecedor/categoria…" value={busca} onChange={e => setBusca(e.target.value)} className="flex-1 min-w-[180px] bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400" />
        {paraPagar.length > 0 && (
          <button onClick={() => setMostrarLista(true)} className="px-3 py-1.5 text-xs bg-blue-700 hover:bg-blue-800 text-white rounded-lg font-semibold whitespace-nowrap">📋 Lista de pagamento ({paraPagar.length})</button>
        )}
        <button onClick={() => setMostrarConfig(true)} className="px-3 py-1.5 text-xs bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-slate-600 whitespace-nowrap">⚙ Prioridades</button>
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
                    <td className="px-3 py-2 text-slate-800 max-w-[260px] truncate" title={f.descricao}>
                      {f.descricao}
                      {f.backlogAntigo && <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-500 align-middle" title="Vencida há mais de 1 ano — provável baixa pendente no Conta Azul (verificar se já foi paga)">⏳ &gt;1 ano</span>}
                      {f.decisao === 'pagar' && <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 align-middle">✓ vou pagar</span>}
                      {f.decisao === 'adiar' && <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 align-middle">⏸ adiado</span>}
                    </td>
                    <td className="px-3 py-2 text-slate-500 max-w-[200px] truncate" title={f.categoria}>{f.categoria}</td>
                    <td className="px-3 py-2 text-right font-medium text-slate-800 tabular-nums whitespace-nowrap">{fmt2(f.valor)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button
                        onClick={() => togglePrioridade(f)}
                        disabled={busy}
                        title="Clique para alternar intocável / negociável nesta conta"
                        className={`text-[10px] px-2 py-0.5 rounded-full transition-colors disabled:opacity-50 ${f.intocavel ? 'bg-slate-800 text-white hover:bg-slate-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                      >
                        {f.intocavel ? '🔒 Intocável' : 'negociável'}
                      </button>
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
              <button onClick={() => decidir('adiar')} disabled={busy} className="px-3 py-1.5 text-xs bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-lg disabled:opacity-50">Adiar</button>
              <button onClick={() => decidir('pagar')} disabled={busy} className="px-4 py-1.5 text-xs bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg font-medium disabled:opacity-50">{busy ? 'Salvando…' : 'Marcar "vou pagar"'}</button>
            </div>
          </div>
        </div>
      )}
      {/* Modal — Lista de pagamento */}
      {mostrarLista && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-start justify-center overflow-y-auto p-4" onClick={() => setMostrarLista(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full my-8" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
              <h2 className="text-sm font-bold text-slate-900">Lista de Pagamento · {paraPagar.length} contas · {fmt2(totalPagar)}</h2>
              <div className="flex items-center gap-2">
                <button onClick={exportarCSV} className="px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700">CSV</button>
                <button onClick={imprimir} className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-white rounded-lg">Imprimir</button>
                <button onClick={() => setMostrarLista(false)} className="text-slate-400 hover:text-slate-700 px-2">✕</button>
              </div>
            </div>
            <div className="p-5 max-h-[70vh] overflow-y-auto space-y-5">
              {gruposPagar.map(([emp, itens]) => {
                const tot = itens.reduce((s, f) => s + f.valor, 0)
                return (
                  <div key={emp}>
                    <div className="flex items-center justify-between mb-1 pb-1 border-b border-slate-200">
                      <span className="text-xs font-bold text-slate-800">{emp}</span>
                      <span className="text-xs font-bold text-slate-900 tabular-nums">{fmt2(tot)}</span>
                    </div>
                    <table className="w-full text-xs">
                      <tbody>
                        {itens.map(f => (
                          <tr key={f.id} className="border-b border-slate-100">
                            <td className="py-1 text-slate-500 tabular-nums whitespace-nowrap w-14">{f.data_vencimento.slice(8, 10)}/{f.data_vencimento.slice(5, 7)}</td>
                            <td className="py-1 text-slate-800 truncate max-w-[240px]" title={f.descricao}>{f.descricao}</td>
                            <td className="py-1 text-right text-slate-700 tabular-nums whitespace-nowrap">{fmt2(f.valor)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              })}
            </div>
            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3 flex-wrap">
              <span className="text-[11px] text-slate-500">É a intenção de pagamento — o pagamento real e a baixa acontecem no banco/Conta Azul.</span>
              <span className="text-sm font-bold text-slate-900">Total {fmt2(totalPagar)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Modal — Ajustar prioridades (por categoria) */}
      {mostrarConfig && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-start justify-center overflow-y-auto p-4" onClick={() => setMostrarConfig(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full my-8" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Ajustar prioridades</h2>
                <p className="text-[11px] text-slate-500">🔒 Intocável = pessoas que nunca deixam de receber. Clique pra ligar/desligar por categoria.</p>
              </div>
              <button onClick={() => setMostrarConfig(false)} className="text-slate-400 hover:text-slate-700 px-2">✕</button>
            </div>
            <div className="p-4 max-h-[70vh] overflow-y-auto">
              <table className="w-full text-xs">
                <tbody>
                  {categorias.map(c => (
                    <tr key={c.categoria} className="border-b border-slate-100">
                      <td className="py-2 pr-2">
                        <button
                          onClick={() => salvarCategoria(c.categoria, !c.intocavel)}
                          disabled={busy}
                          className={`text-[10px] px-2 py-1 rounded-full transition-colors disabled:opacity-50 ${c.intocavel ? 'bg-slate-800 text-white hover:bg-slate-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                        >
                          {c.intocavel ? '🔒 Intocável' : 'negociável'}
                        </button>
                      </td>
                      <td className="py-2 text-slate-800">
                        {c.categoria}
                        {c.temOverride && <span className="ml-2 text-[9px] text-blue-600" title="Ajuste manual (difere da regra automática)">manual</span>}
                      </td>
                      <td className="py-2 text-right text-slate-500 tabular-nums whitespace-nowrap">{fmt(c.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
