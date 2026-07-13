'use client'

import { useState } from 'react'

type Item = {
  empresa: string
  vinculada: boolean
  dreReceita: number
  dashReceita: number | null
  difReceita: number | null
  dreLucro: number
  dashLucro: number | null
  difLucro: number | null
}
type Resultado = {
  ano: number
  itens: Item[]
  consolidado: { dreReceita: number; dashReceita: number; dreLucro: number; dashLucro: number }
}

function fmt(v: number | null): string {
  if (v === null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

// Cor da diferença: verde se pequena (< tol), âmbar se média, vermelho se grande.
function corDif(dif: number | null, base: number): string {
  if (dif === null) return 'text-slate-400'
  const pct = base > 0 ? Math.abs(dif) / Math.abs(base) * 100 : (dif === 0 ? 0 : 100)
  if (pct < 1) return 'text-emerald-700'
  if (pct < 5) return 'text-amber-700'
  return 'text-red-700'
}

export default function DreComparativoClient() {
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [res, setRes] = useState<Resultado | null>(null)

  async function comparar() {
    if (!arquivo) { setErro('Escolha o arquivo do DRE (.xlsx).'); return }
    setBusy(true); setErro(null)
    try {
      const fd = new FormData()
      fd.append('arquivo', arquivo)
      const r = await fetch('/api/financeiro/dre-comparar', { method: 'POST', body: fd })
      const d = await r.json()
      if (!r.ok) { setErro(d.error ?? 'Erro ao comparar.'); setRes(null) }
      else setRes(d)
    } catch (e) { setErro(String(e)) } finally { setBusy(false) }
  }

  return (
    <>
      {/* Upload */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-slate-800 mb-1">Comparar um fechamento</h2>
        <p className="text-xs text-slate-500 mb-3">Suba o XLS do DRE gerencial da contabilidade (ex: “DRE - Resumido 2025.xlsx”). O ano é detectado do arquivo.</p>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={e => setArquivo(e.target.files?.[0] ?? null)}
            className="text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-slate-700 file:text-white file:text-xs file:cursor-pointer"
          />
          <button
            onClick={comparar}
            disabled={busy}
            className="px-4 py-1.5 text-xs bg-blue-700 hover:bg-blue-600 disabled:opacity-50 rounded-lg text-white font-medium"
          >
            {busy ? 'Comparando…' : 'Comparar com o dashboard'}
          </button>
        </div>
        {erro && <div className="mt-3 text-xs px-3 py-2 rounded-md bg-red-50 text-red-800">{erro}</div>}
      </div>

      {res && (
        <>
          {/* Consolidado */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
            {[
              { t: 'Receita', dre: res.consolidado.dreReceita, dash: res.consolidado.dashReceita },
              { t: 'Lucro',   dre: res.consolidado.dreLucro,   dash: res.consolidado.dashLucro },
            ].map(k => {
              const dif = k.dre - k.dash
              const pct = k.dre !== 0 ? Math.abs(dif) / Math.abs(k.dre) * 100 : 0
              return (
                <div key={k.t} className="bg-white rounded-xl border border-slate-200 p-4">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">{k.t} {res.ano} — consolidado</p>
                  <div className="flex items-end justify-between mt-2 gap-2">
                    <div><p className="text-[10px] text-slate-400">Contabilidade</p><p className="text-base font-bold text-slate-800 tabular-nums">{fmt(k.dre)}</p></div>
                    <div><p className="text-[10px] text-slate-400">Dashboard</p><p className="text-base font-bold text-slate-800 tabular-nums">{fmt(k.dash)}</p></div>
                    <div className="text-right"><p className="text-[10px] text-slate-400">Diferença</p><p className={`text-base font-bold tabular-nums ${corDif(dif, k.dre)}`}>{fmt(dif)} <span className="text-[10px] font-normal">({pct.toFixed(1)}%)</span></p></div>
                  </div>
                </div>
              )
            })}
          </div>

          <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mb-3">
            Verde = diferença &lt; 1% · âmbar 1–5% · vermelho &gt; 5%. O lucro do dashboard <strong>exclui juros/empréstimos</strong> (grupos 5–8), enquanto o DRE inclui despesas financeiras — por isso pequenas diferenças no lucro são esperadas.
          </p>

          {/* Tabela por empresa */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50/80">
                  <tr>
                    <th className="text-left  px-4 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px]" rowSpan={2}>Empresa</th>
                    <th className="text-center px-4 py-1.5 font-semibold text-slate-500 uppercase tracking-wider text-[10px] border-l border-slate-200" colSpan={3}>Receita</th>
                    <th className="text-center px-4 py-1.5 font-semibold text-slate-500 uppercase tracking-wider text-[10px] border-l border-slate-200" colSpan={3}>Lucro</th>
                  </tr>
                  <tr className="text-[9px] text-slate-400">
                    <th className="text-right px-4 py-1 font-medium border-l border-slate-200">Contab.</th>
                    <th className="text-right px-4 py-1 font-medium">Dashboard</th>
                    <th className="text-right px-4 py-1 font-medium">Δ</th>
                    <th className="text-right px-4 py-1 font-medium border-l border-slate-200">Contab.</th>
                    <th className="text-right px-4 py-1 font-medium">Dashboard</th>
                    <th className="text-right px-4 py-1 font-medium">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {res.itens.map(i => (
                    <tr key={i.empresa} className="border-t border-slate-200/70 hover:bg-slate-100/30">
                      <td className="px-4 py-2 text-slate-800">
                        {i.empresa}
                        {!i.vinculada && <span className="ml-2 text-[9px] text-amber-700" title="Empresa não encontrada no dashboard">sem match</span>}
                      </td>
                      <td className="px-4 py-2 text-right text-slate-700 tabular-nums border-l border-slate-200/70">{fmt(i.dreReceita)}</td>
                      <td className="px-4 py-2 text-right text-slate-700 tabular-nums">{fmt(i.dashReceita)}</td>
                      <td className={`px-4 py-2 text-right tabular-nums font-medium ${corDif(i.difReceita, i.dreReceita)}`}>{fmt(i.difReceita)}</td>
                      <td className="px-4 py-2 text-right text-slate-700 tabular-nums border-l border-slate-200/70">{fmt(i.dreLucro)}</td>
                      <td className="px-4 py-2 text-right text-slate-700 tabular-nums">{fmt(i.dashLucro)}</td>
                      <td className={`px-4 py-2 text-right tabular-nums font-medium ${corDif(i.difLucro, i.dreLucro)}`}>{fmt(i.difLucro)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-slate-300 bg-slate-50/40 font-bold">
                    <td className="px-4 py-2 text-slate-900 uppercase text-[10px] tracking-wider">Consolidado</td>
                    <td className="px-4 py-2 text-right text-slate-900 tabular-nums border-l border-slate-200/70">{fmt(res.consolidado.dreReceita)}</td>
                    <td className="px-4 py-2 text-right text-slate-900 tabular-nums">{fmt(res.consolidado.dashReceita)}</td>
                    <td className={`px-4 py-2 text-right tabular-nums ${corDif(res.consolidado.dreReceita - res.consolidado.dashReceita, res.consolidado.dreReceita)}`}>{fmt(res.consolidado.dreReceita - res.consolidado.dashReceita)}</td>
                    <td className="px-4 py-2 text-right text-slate-900 tabular-nums border-l border-slate-200/70">{fmt(res.consolidado.dreLucro)}</td>
                    <td className="px-4 py-2 text-right text-slate-900 tabular-nums">{fmt(res.consolidado.dashLucro)}</td>
                    <td className={`px-4 py-2 text-right tabular-nums ${corDif(res.consolidado.dreLucro - res.consolidado.dashLucro, res.consolidado.dreLucro)}`}>{fmt(res.consolidado.dreLucro - res.consolidado.dashLucro)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  )
}
