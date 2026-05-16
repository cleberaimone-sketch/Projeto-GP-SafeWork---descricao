'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export interface EmpresaSyncStatus {
  empresa_nome: string
  empresa_id: string | null
  token_atualizado_em: string
  qtd_lancamentos: number
  ultimo_sync_em: string | null
  ultimo_sync_status: 'sucesso' | 'parcial' | 'erro' | null
  ultimo_sync_registros: number
  ultimo_sync_erro: string | null
}

interface ResultadoSync {
  status: 'sucesso' | 'parcial' | 'erro'
  registros: number
  detalhe?: string
}

// ──────────────────────────────────────────────────────────────────────────────

function fmtData(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function diasAtras(iso: string | null): string {
  if (!iso) return '—'
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (dias === 0) return 'hoje'
  if (dias === 1) return 'há 1 dia'
  return `há ${dias} dias`
}

// ──────────────────────────────────────────────────────────────────────────────

export default function SyncClient({ empresas }: { empresas: EmpresaSyncStatus[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [emProgresso, setEmProgresso] = useState<Set<string>>(new Set())
  const [resultados, setResultados] = useState<Record<string, ResultadoSync>>({})
  const [todasRodando, setTodasRodando] = useState(false)
  const [dataInicio, setDataInicio] = useState('2024-01-01')
  const [dataFim, setDataFim] = useState(new Date().toISOString().slice(0, 10))

  async function syncEmpresa(empresaNome: string) {
    setEmProgresso(prev => new Set(prev).add(empresaNome))
    setResultados(prev => { const n = { ...prev }; delete n[empresaNome]; return n })

    try {
      const res = await fetch('/api/conta-azul/sync-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresa_nome: empresaNome, dataInicio, dataFim }),
      })
      const data = await res.json()
      const r = (data.resumo ?? [])[0] as ResultadoSync | undefined
      if (r) {
        setResultados(prev => ({ ...prev, [empresaNome]: r }))
      } else {
        setResultados(prev => ({ ...prev, [empresaNome]: { status: 'erro', registros: 0, detalhe: data.error ?? 'Resposta vazia' } }))
      }
    } catch (e) {
      setResultados(prev => ({ ...prev, [empresaNome]: { status: 'erro', registros: 0, detalhe: String(e) } }))
    } finally {
      setEmProgresso(prev => { const n = new Set(prev); n.delete(empresaNome); return n })
      startTransition(() => router.refresh())
    }
  }

  async function syncTodas() {
    if (!confirm(`Sincronizar TODAS as ${empresas.length} empresas? Cada uma leva ~30s.`)) return
    setTodasRodando(true)
    for (const e of empresas) {
      await syncEmpresa(e.empresa_nome)
    }
    setTodasRodando(false)
  }

  function urlReautorizar(empresaNome: string): string {
    return `/api/conta-azul/authorize?empresa=${encodeURIComponent(empresaNome)}`
  }

  const totalLancamentos = empresas.reduce((s, e) => s + e.qtd_lancamentos, 0)

  return (
    <>

      {/* Controles globais */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 mb-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">Período:</label>
              <input
                type="date"
                value={dataInicio}
                onChange={e => setDataInicio(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-200"
              />
              <span className="text-slate-600">→</span>
              <input
                type="date"
                value={dataFim}
                onChange={e => setDataFim(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-200"
              />
            </div>
            <span className="text-[10px] text-slate-500">
              {totalLancamentos.toLocaleString('pt-BR')} lançamentos no banco hoje
            </span>
          </div>

          <button
            onClick={syncTodas}
            disabled={todasRodando || empresas.length === 0}
            className="px-4 py-1.5 text-xs bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 rounded-lg text-white font-medium"
          >
            {todasRodando ? `Sincronizando…` : `⚡ Sincronizar Todas (${empresas.length})`}
          </button>
        </div>

        <div className="mt-3 p-3 bg-amber-950/30 border border-amber-900/30 rounded-md text-[11px] text-amber-200/80">
          ⚠ Importante: cada empresa rotaciona seu refresh_token a cada sync. Se falhar 1 empresa,
          as outras continuam normalmente — não cancele para evitar inconsistência.
        </div>
      </div>

      {/* Lista de empresas */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-950/50">
              <tr>
                <th className="text-left  px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Empresa</th>
                <th className="text-right px-2 py-3 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Lançamentos</th>
                <th className="text-left  px-2 py-3 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Última Sync</th>
                <th className="text-left  px-2 py-3 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Resultado</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Ações</th>
              </tr>
            </thead>
            <tbody>
              {empresas.map(e => {
                const rodando = emProgresso.has(e.empresa_nome)
                const resultado = resultados[e.empresa_nome]
                const ultimoStatus = resultado?.status ?? e.ultimo_sync_status

                return (
                  <tr key={e.empresa_nome} className="border-t border-slate-800/60 hover:bg-slate-800/30">
                    <td className="px-4 py-3">
                      <div className="text-slate-200 font-medium">{e.empresa_nome}</div>
                      <div className="text-[10px] text-slate-600">
                        Token: {diasAtras(e.token_atualizado_em)}
                      </div>
                    </td>
                    <td className="px-2 py-3 text-right text-slate-300 tabular-nums">
                      {e.qtd_lancamentos.toLocaleString('pt-BR')}
                    </td>
                    <td className="px-2 py-3 text-slate-400">
                      {e.ultimo_sync_em ? (
                        <>
                          <div>{fmtData(e.ultimo_sync_em)}</div>
                          <div className="text-[10px] text-slate-600">{diasAtras(e.ultimo_sync_em)}</div>
                        </>
                      ) : <span className="text-slate-600">nunca</span>}
                    </td>
                    <td className="px-2 py-3">
                      {rodando ? (
                        <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-300">
                          <span className="w-3 h-3 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin"></span>
                          sincronizando…
                        </span>
                      ) : ultimoStatus === 'sucesso' ? (
                        <span className="text-emerald-400 text-[11px]">
                          ✓ {resultado?.registros ?? e.ultimo_sync_registros} registros
                        </span>
                      ) : ultimoStatus === 'parcial' ? (
                        <span className="text-amber-400 text-[11px]">
                          ⚠ parcial ({resultado?.registros ?? e.ultimo_sync_registros})
                        </span>
                      ) : ultimoStatus === 'erro' ? (
                        <div>
                          <span className="text-red-400 text-[11px]">✗ erro</span>
                          <div className="text-[9px] text-slate-600 truncate max-w-[280px]" title={resultado?.detalhe ?? e.ultimo_sync_erro ?? ''}>
                            {(resultado?.detalhe ?? e.ultimo_sync_erro)?.slice(0, 80) ?? ''}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-600 text-[11px]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => syncEmpresa(e.empresa_nome)}
                          disabled={rodando || todasRodando}
                          className="px-3 py-1 text-[11px] bg-slate-800 hover:bg-emerald-900/50 hover:text-emerald-300 disabled:opacity-50 rounded text-slate-300"
                        >
                          {rodando ? '…' : '⚡ Sync'}
                        </button>
                        <a
                          href={urlReautorizar(e.empresa_nome)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1 text-[11px] bg-slate-800 hover:bg-amber-900/50 hover:text-amber-300 rounded text-slate-400"
                          title="Abre o Conta Azul para re-autorizar — use se o sync falhar com invalid_grant"
                        >
                          🔑 Re-auth
                        </a>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {empresas.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-600">
                  Nenhuma empresa autorizada ainda. <a href="/api/conta-azul/authorize" className="text-emerald-400 hover:underline">Clique aqui para autorizar.</a>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {pending && <div className="text-[10px] text-slate-500 mt-2">Atualizando status…</div>}

      {/* Ajuda */}
      <div className="mt-6 p-4 bg-slate-900/50 border border-slate-800 rounded-lg text-[11px] text-slate-500">
        <p className="font-medium text-slate-400 mb-1">Como funciona:</p>
        <ul className="space-y-0.5 ml-3 list-disc">
          <li><strong>Sync</strong> chama a API do Conta Azul, baixa todos os lançamentos do período e atualiza o banco.</li>
          <li>O <strong>refresh_token</strong> é rotacionado e salvo automaticamente após sucesso.</li>
          <li>Se aparecer <strong>"invalid_grant"</strong>, clique em <strong>🔑 Re-auth</strong> para gerar novo token.</li>
          <li>Categorias de transferência interna entre empresas são <strong>filtradas automaticamente</strong> nos cálculos do dashboard (não precisam ser removidas aqui).</li>
          <li>Saldos das contas ativas são atualizados em <strong>v_saldos_ativos</strong> (Mapa de Empresas).</li>
        </ul>
      </div>

    </>
  )
}
