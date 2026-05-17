'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface CategoriaItem {
  categoria: string
  tipo: 'receita' | 'despesa'
  realizado_mes: Record<number, number>
  historico_ano_anterior: Record<number, number>
  total_realizado_ano: number
  total_historico: number
}

export interface MetaItem {
  id: string
  categoria: string
  mes: number
  valor_meta: number
  tipo: 'receita' | 'despesa'
}

interface Props {
  ano: number
  empresaId: string
  empresas: { id: string; nome_curto: string }[]
  categorias: CategoriaItem[]
  metas: MetaItem[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: number): string {
  if (v === 0) return ''
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}

function parseValor(s: string): number {
  if (!s.trim()) return 0
  // Aceita formatos: 1000, 1.000, 1000.50, 1.000,50
  const cleaned = s
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
  const v = parseFloat(cleaned)
  return isFinite(v) ? v : 0
}

const NOMES_MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

const MES_ATUAL = new Date().getMonth() + 1
const ANO_ATUAL = new Date().getFullYear()

// ─── Componente principal ────────────────────────────────────────────────────

export default function OrcamentoClient({ ano, empresaId, empresas, categorias, metas }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'receita' | 'despesa'>('todos')
  const [busca, setBusca] = useState('')

  // Mapa local de metas (key = `${categoria}|${mes}`) para edição
  const [metasLocal, setMetasLocal] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {}
    for (const meta of metas) m[`${meta.categoria}|${meta.mes}`] = meta.valor_meta
    return m
  })

  const [salvando, setSalvando] = useState(false)
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  // Detecta alterações comparando local com original
  const metasOriginais = useMemo(() => {
    const m: Record<string, number> = {}
    for (const meta of metas) m[`${meta.categoria}|${meta.mes}`] = meta.valor_meta
    return m
  }, [metas])

  const alteracoes = useMemo(() => {
    const changed: { categoria: string; mes: number; tipo: 'receita' | 'despesa'; valor: number }[] = []
    const allKeys = new Set([...Object.keys(metasLocal), ...Object.keys(metasOriginais)])
    for (const key of allKeys) {
      const local = metasLocal[key] ?? 0
      const orig  = metasOriginais[key] ?? 0
      if (local !== orig) {
        const [cat, mesStr] = key.split('|')
        const tipo = categorias.find(c => c.categoria === cat)?.tipo ?? 'despesa'
        changed.push({ categoria: cat, mes: parseInt(mesStr), tipo, valor: local })
      }
    }
    return changed
  }, [metasLocal, metasOriginais, categorias])

  function getMeta(cat: string, mes: number): number {
    return metasLocal[`${cat}|${mes}`] ?? 0
  }

  function setMeta(cat: string, mes: number, valor: number) {
    setMetasLocal(prev => ({ ...prev, [`${cat}|${mes}`]: valor }))
    setMensagemSucesso(null)
  }

  function setEmpresa(eId: string) {
    const p = new URLSearchParams(searchParams.toString())
    if (eId) p.set('empresa', eId); else p.delete('empresa')
    router.push(`/dashboard/financeiro/orcamento?${p.toString()}`)
  }

  function setAno(a: number) {
    const p = new URLSearchParams(searchParams.toString())
    p.set('ano', String(a))
    router.push(`/dashboard/financeiro/orcamento?${p.toString()}`)
  }

  // ── Ações em massa ──────────────────────────────────────────────────────
  function replicarMes(mesOrigem: number, somenteCategoria?: string) {
    setMetasLocal(prev => {
      const novo = { ...prev }
      const cats = somenteCategoria ? [somenteCategoria] : categorias.map(c => c.categoria)
      for (const cat of cats) {
        const valorOrigem = prev[`${cat}|${mesOrigem}`] ?? 0
        for (let m = 1; m <= 12; m++) {
          if (m !== mesOrigem) novo[`${cat}|${m}`] = valorOrigem
        }
      }
      return novo
    })
    setMensagemSucesso(`Mês ${NOMES_MESES[mesOrigem - 1]} replicado para todos os meses${somenteCategoria ? ' (categoria atual)' : ''}.`)
  }

  function importarAnoAnterior(somenteCategoria?: string) {
    setMetasLocal(prev => {
      const novo = { ...prev }
      const cats = somenteCategoria ? categorias.filter(c => c.categoria === somenteCategoria) : categorias
      for (const cat of cats) {
        for (let m = 1; m <= 12; m++) {
          const v = cat.historico_ano_anterior[m] ?? 0
          if (v > 0) novo[`${cat.categoria}|${m}`] = Math.round(v)
        }
      }
      return novo
    })
    setMensagemSucesso(`Valores do ano ${ano - 1} importados${somenteCategoria ? ' (categoria atual)' : ' (todas as categorias)'}.`)
  }

  function limparTudo() {
    if (!confirm('Apagar todas as metas alteradas? Isso só limpa a edição — depois precisa salvar para persistir.')) return
    setMetasLocal({})
    setMensagemSucesso('Todas as metas zeradas localmente. Salve para confirmar.')
  }

  async function salvar() {
    if (alteracoes.length === 0) return
    setSalvando(true); setErro(null); setMensagemSucesso(null)
    try {
      const body = alteracoes.map(a => ({
        empresa_id: empresaId || null,
        ano,
        mes:       a.mes,
        categoria: a.categoria,
        tipo:      a.tipo,
        valor_meta: a.valor,
      }))
      const res = await fetch('/api/financeiro/metas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok && res.status !== 207) {
        setErro(data.error ?? 'Erro ao salvar')
      } else {
        setMensagemSucesso(`${data.processadas} metas salvas com sucesso.`)
        startTransition(() => router.refresh())
      }
    } catch (e) {
      setErro(String(e))
    } finally {
      setSalvando(false)
    }
  }

  // ── Filtragem da tabela ──────────────────────────────────────────────────
  const filtradas = useMemo(() => {
    let arr = categorias
    if (filtroTipo !== 'todos') arr = arr.filter(c => c.tipo === filtroTipo)
    if (busca.trim()) {
      const q = busca.toLowerCase()
      arr = arr.filter(c => c.categoria.toLowerCase().includes(q))
    }
    return arr
  }, [categorias, filtroTipo, busca])

  // ── Totais agregados ─────────────────────────────────────────────────────
  function totalAnoCategoria(cat: string): number {
    let s = 0
    for (let m = 1; m <= 12; m++) s += getMeta(cat, m)
    return s
  }
  function totalRealizadoAtéMesAtualCategoria(cat: string): number {
    let s = 0
    const ate = ano === ANO_ATUAL ? MES_ATUAL : 12
    const realizado = categorias.find(c => c.categoria === cat)?.realizado_mes ?? {}
    for (let m = 1; m <= ate; m++) s += realizado[m] ?? 0
    return s
  }
  function totalMetaAteMesAtualCategoria(cat: string): number {
    let s = 0
    const ate = ano === ANO_ATUAL ? MES_ATUAL : 12
    for (let m = 1; m <= ate; m++) s += getMeta(cat, m)
    return s
  }

  // Totais gerais por tipo
  const totaisPorTipo = useMemo(() => {
    const r = { receita: { meta: 0, realizado: 0 }, despesa: { meta: 0, realizado: 0 } }
    for (const c of categorias) {
      r[c.tipo].meta      += totalAnoCategoria(c.categoria)
      r[c.tipo].realizado += c.total_realizado_ano
    }
    return r
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categorias, metasLocal])

  const lucroPlanjado = totaisPorTipo.receita.meta      - totaisPorTipo.despesa.meta
  const lucroRealizado = totaisPorTipo.receita.realizado - totaisPorTipo.despesa.realizado

  return (
    <>

      {/* Topo: seletores e ações */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">Ano:</label>
              <select
                value={ano}
                onChange={e => setAno(parseInt(e.target.value))}
                className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800"
              >
                {[ANO_ATUAL - 1, ANO_ATUAL, ANO_ATUAL + 1, ANO_ATUAL + 2].map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">Empresa:</label>
              <select
                value={empresaId}
                onChange={e => setEmpresa(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800"
              >
                <option value="">Consolidado (grupo)</option>
                {empresas.map(e => <option key={e.id} value={e.id}>{e.nome_curto}</option>)}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => importarAnoAnterior()}
              className="px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-700 rounded-lg text-slate-700"
              title={`Copia valores realizados de ${ano - 1} para todas as categorias`}
            >
              ↩ Importar {ano - 1}
            </button>
            <button
              onClick={limparTudo}
              className="px-3 py-1.5 text-xs bg-slate-100 hover:bg-red-100 hover:text-red-800 rounded-lg text-slate-500"
            >
              🗑 Zerar
            </button>
            {alteracoes.length > 0 && (
              <button
                onClick={salvar}
                disabled={salvando}
                className="px-4 py-1.5 text-xs bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 rounded-lg text-white font-medium"
              >
                {salvando ? 'Salvando…' : `💾 Salvar (${alteracoes.length})`}
              </button>
            )}
          </div>
        </div>

        {(mensagemSucesso || erro) && (
          <div className={`mt-3 text-xs px-3 py-2 rounded-md ${erro ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}>
            {erro || mensagemSucesso}
          </div>
        )}
      </div>

      {/* Resumo: Meta vs Realizado */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <div className="bg-emerald-950/30 border border-emerald-200 rounded-xl p-4">
          <h3 className="text-[10px] text-emerald-800 uppercase tracking-wider font-semibold">Receita Anual</h3>
          <p className="text-xl text-emerald-700 font-bold tabular-nums mt-2">{totaisPorTipo.receita.meta.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}</p>
          <p className="text-[10px] text-slate-500 mt-1">
            Realizado: <span className="text-slate-700">{totaisPorTipo.receita.realizado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}</span>
            {totaisPorTipo.receita.meta > 0 && (
              <span className="ml-2">({((totaisPorTipo.receita.realizado / totaisPorTipo.receita.meta) * 100).toFixed(0)}%)</span>
            )}
          </p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <h3 className="text-[10px] text-red-800 uppercase tracking-wider font-semibold">Despesa Anual</h3>
          <p className="text-xl text-red-700 font-bold tabular-nums mt-2">{totaisPorTipo.despesa.meta.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}</p>
          <p className="text-[10px] text-slate-500 mt-1">
            Realizado: <span className="text-slate-700">{totaisPorTipo.despesa.realizado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}</span>
            {totaisPorTipo.despesa.meta > 0 && (
              <span className="ml-2">({((totaisPorTipo.despesa.realizado / totaisPorTipo.despesa.meta) * 100).toFixed(0)}%)</span>
            )}
          </p>
        </div>
        <div className={`bg-white rounded-xl p-4 border ${lucroPlanjado >= 0 ? 'border-emerald-200' : 'border-red-800/40'}`}>
          <h3 className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Resultado Planejado</h3>
          <p className={`text-xl font-bold tabular-nums mt-2 ${lucroPlanjado >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
            {lucroPlanjado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">
            Realizado: <span className={lucroRealizado >= 0 ? 'text-emerald-700' : 'text-red-700'}>
              {lucroRealizado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
            </span>
          </p>
        </div>
      </div>

      {/* Filtros de tabela */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="inline-flex bg-white border border-slate-200 rounded-lg overflow-hidden">
          {(['todos', 'receita', 'despesa'] as const).map(t => (
            <button
              key={t}
              onClick={() => setFiltroTipo(t)}
              className={`px-3 py-1.5 text-xs ${filtroTipo === t ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {t === 'todos' ? 'Todos' : t === 'receita' ? 'Receitas' : 'Despesas'}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Buscar categoria…"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          className="flex-1 min-w-[200px] bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 placeholder-slate-600"
        />
        <span className="text-[10px] text-slate-500">{filtradas.length} categorias</span>
      </div>

      {/* Tabela editável */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto max-h-[700px]">
          <table className="w-full text-xs">
            <thead className="bg-slate-50/80 sticky top-0 z-10">
              <tr>
                <th className="text-left  px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px] sticky left-0 bg-slate-50 z-10 min-w-[280px]">Categoria</th>
                {NOMES_MESES.map((nome, i) => (
                  <th key={i} className={`text-right px-1 py-2 font-semibold uppercase tracking-wider text-[10px] min-w-[80px] ${ano === ANO_ATUAL && i + 1 === MES_ATUAL ? 'text-emerald-700 bg-emerald-950/30' : 'text-slate-500'}`}>
                    {nome}
                  </th>
                ))}
                <th className="text-right px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px] bg-slate-50">Total Ano</th>
                <th className="text-right px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px] bg-slate-50">Realiz.</th>
                <th className="text-right px-3 py-2 font-semibold text-slate-500 uppercase tracking-wider text-[10px] bg-slate-50">% YTD</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map(c => {
                const totalAno    = totalAnoCategoria(c.categoria)
                const realizadoYTD = totalRealizadoAtéMesAtualCategoria(c.categoria)
                const metaYTD     = totalMetaAteMesAtualCategoria(c.categoria)
                const pctYTD      = metaYTD > 0 ? (realizadoYTD / metaYTD) * 100 : null
                const corPct      = pctYTD == null ? 'text-slate-400'
                                  : c.tipo === 'receita'
                                    ? (pctYTD >= 95 ? 'text-emerald-700' : pctYTD >= 80 ? 'text-amber-700' : 'text-red-700')
                                    : (pctYTD <= 100 ? 'text-emerald-700' : pctYTD <= 115 ? 'text-amber-700' : 'text-red-700')

                return (
                  <tr key={c.categoria} className="border-t border-slate-200 hover:bg-slate-100/20">
                    <td className="px-3 py-1.5 sticky left-0 bg-white group-hover:bg-slate-100/20">
                      <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${c.tipo === 'receita' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        <span className="text-slate-800 text-xs truncate max-w-[260px]" title={c.categoria}>{c.categoria}</span>
                      </div>
                    </td>
                    {NOMES_MESES.map((_, i) => {
                      const mes = i + 1
                      const realizado = c.realizado_mes[mes] ?? 0
                      const ehMesAtual = ano === ANO_ATUAL && mes === MES_ATUAL
                      return (
                        <CelulaEditavel
                          key={mes}
                          valor={getMeta(c.categoria, mes)}
                          realizado={realizado}
                          onChange={v => setMeta(c.categoria, mes, v)}
                          destaque={ehMesAtual}
                          tipo={c.tipo}
                        />
                      )
                    })}
                    <td className={`px-3 py-1.5 text-right tabular-nums font-medium bg-slate-50/30 ${c.tipo === 'receita' ? 'text-emerald-700' : 'text-red-700'}`}>
                      {fmt(totalAno) || '—'}
                    </td>
                    <td className="px-3 py-1.5 text-right text-slate-500 tabular-nums bg-slate-50/30">
                      {fmt(c.total_realizado_ano) || '—'}
                    </td>
                    <td className={`px-3 py-1.5 text-right tabular-nums font-medium bg-slate-50/30 ${corPct}`}>
                      {pctYTD == null ? '—' : `${pctYTD.toFixed(0)}%`}
                    </td>
                  </tr>
                )
              })}
              {filtradas.length === 0 && (
                <tr><td colSpan={16} className="px-4 py-8 text-center text-slate-400">Nenhuma categoria encontrada</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {pending && <div className="text-[10px] text-slate-500 mt-2">Atualizando…</div>}

      <div className="mt-4 p-4 bg-white border border-slate-200 rounded-lg text-[11px] text-slate-500">
        <p className="font-medium text-slate-500 mb-1">Como usar:</p>
        <ul className="space-y-0.5 ml-3 list-disc">
          <li>Digite o valor da meta em cada célula (sem precisar de R$). Tab/Enter avança.</li>
          <li><strong>Realizado</strong> aparece abaixo do valor da meta (em cinza) quando há lançamentos pagos no mês.</li>
          <li><strong>% YTD</strong>: realizado acumulado até o mês atual ÷ meta acumulada. Verde = no rumo · âmbar = atenção · vermelho = fora.</li>
          <li>Botão <strong>Importar {ano - 1}</strong>: traz os valores realizados do ano anterior como base.</li>
          <li>Categorias mostradas: as que tiveram movimento {ano} ou {ano - 1}, ou que já têm meta definida.</li>
        </ul>
      </div>

    </>
  )
}

// ─── Célula editável ────────────────────────────────────────────────────────

function CelulaEditavel({ valor, realizado, onChange, destaque, tipo }: {
  valor: number
  realizado: number
  onChange: (v: number) => void
  destaque: boolean
  tipo: 'receita' | 'despesa'
}) {
  const [texto, setTexto] = useState(valor === 0 ? '' : String(Math.round(valor)))
  const [editando, setEditando] = useState(false)

  const corValor = valor === 0 ? 'text-slate-400' : tipo === 'receita' ? 'text-emerald-800' : 'text-red-800'
  const fundo = destaque ? 'bg-emerald-950/20' : ''

  return (
    <td className={`px-1 py-1 ${fundo}`}>
      <div className="flex flex-col items-end">
        <input
          type="text"
          value={editando ? texto : (valor === 0 ? '' : fmt(valor))}
          onChange={e => { setTexto(e.target.value); setEditando(true) }}
          onBlur={() => {
            const v = parseValor(texto)
            onChange(v)
            setTexto(v === 0 ? '' : String(Math.round(v)))
            setEditando(false)
          }}
          onFocus={e => { setEditando(true); setTexto(valor === 0 ? '' : String(Math.round(valor))); e.target.select() }}
          onKeyDown={e => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
          placeholder="—"
          className={`w-full bg-transparent text-right text-xs tabular-nums focus:outline-none focus:bg-slate-50 rounded px-1 py-0.5 ${corValor}`}
        />
        {realizado > 0 && (
          <span className="text-[9px] text-slate-400 tabular-nums">{fmt(realizado)}</span>
        )}
      </div>
    </td>
  )
}
