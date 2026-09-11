'use client'

// O quadro de pessoas com o custo de cada uma.
//
// Eu havia dito ao Cleber que isso era impossível — a aba "Salário" da planilha
// de Indicadores está vazia e o Conta Azul lança por categoria. Errado: a
// planilha completa (C_F + C_S) tem nome, área, vínculo e custo mês a mês de
// cada pessoa, e o Conta Azul traz o fornecedor em cada honorário, campo que o
// sync passou a gravar hoje.
//
// Agrupado por empresa e departamento, que é como a planilha organiza ("Medicina
// - GP SafeWork") e como a decisão é tomada.

import { useState } from 'react'
import { normalizarEmpresa, type Pessoa } from '@/lib/rh/pessoas'

const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)

/** Custo da pessoa nos meses fechados, contando só onde houve lançamento. */
function custoDe(p: Pessoa, mesesFechados: number) {
  const meses = p.custoMensal.slice(0, mesesFechados)
  const comLancamento = meses.filter(v => v > 0)
  const total = comLancamento.reduce((s, v) => s + v, 0)
  return { total, meses: comLancamento.length, media: comLancamento.length ? total / comLancamento.length : 0 }
}

export default function QuadroComCusto({ pessoas, mesesFechados }: {
  pessoas: Pessoa[]
  mesesFechados: number
}) {
  const [mostrarInativos, setMostrarInativos] = useState(false)
  const [aberto, setAberto] = useState<Set<string>>(new Set())

  const visiveis = pessoas.filter(p => mostrarInativos || p.status === 'Ativo')

  // empresa → departamento → pessoas
  const porEmpresa = new Map<string, Map<string, Pessoa[]>>()
  for (const p of visiveis) {
    const emp = normalizarEmpresa(p.empresa)
    const dep = p.departamento || '(sem departamento)'
    if (!porEmpresa.has(emp)) porEmpresa.set(emp, new Map())
    const m = porEmpresa.get(emp)!
    if (!m.has(dep)) m.set(dep, [])
    m.get(dep)!.push(p)
  }

  const totalDe = (lista: Pessoa[]) => lista.reduce((s, p) => s + custoDe(p, mesesFechados).total, 0)
  const totalGeral = totalDe(visiveis)
  const mediaGeral = mesesFechados > 0 ? totalGeral / mesesFechados : 0

  const empresas = [...porEmpresa.entries()]
    .map(([emp, deps]) => ({
      empresa: emp,
      deps: [...deps.entries()]
        .map(([dep, ps]) => ({ dep, pessoas: [...ps].sort((a, b) => custoDe(b, mesesFechados).total - custoDe(a, mesesFechados).total) }))
        .sort((a, b) => totalDe(b.pessoas) - totalDe(a.pessoas)),
      total: totalDe([...deps.values()].flat()),
      qtd: [...deps.values()].flat().length,
    }))
    .sort((a, b) => b.total - a.total)

  const alternar = (chave: string) => setAberto(prev => {
    const n = new Set(prev)
    if (n.has(chave)) n.delete(chave); else n.add(chave)
    return n
  })

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-1">
        <h2 className="font-bold text-slate-800">Quadro e custo por pessoa</h2>
        <label className="flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer">
          <input type="checkbox" checked={mostrarInativos}
                 onChange={e => setMostrarInativos(e.target.checked)} className="rounded" />
          incluir quem saiu
        </label>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 mb-4 pb-3 border-b border-slate-200">
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider">Custo total</p>
          <p className="text-xl font-bold text-slate-800 tabular-nums">{brl(totalGeral)}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider">Por mês</p>
          <p className="text-xl font-bold text-slate-800 tabular-nums">{brl(mediaGeral)}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider">Pessoas</p>
          <p className="text-xl font-bold text-slate-800 tabular-nums">{visiveis.length}</p>
        </div>
        <p className="text-[10px] text-slate-400 ml-auto self-end">
          {mesesFechados} {mesesFechados === 1 ? 'mês fechado' : 'meses fechados'} · clique no
          departamento para abrir
        </p>
      </div>

      <div className="space-y-3">
        {empresas.map(e => (
          <div key={e.empresa}>
            <div className="flex items-baseline justify-between gap-2 py-1.5 border-b-2 border-slate-300">
              <p className="text-xs font-bold text-slate-800 uppercase tracking-wider">{e.empresa}</p>
              <div className="flex items-baseline gap-3 shrink-0">
                <span className="text-[10px] text-slate-400">{e.qtd} {e.qtd === 1 ? 'pessoa' : 'pessoas'}</span>
                <span className="text-sm font-bold text-slate-800 tabular-nums">{brl(e.total)}</span>
              </div>
            </div>

            {e.deps.map(d => {
              const chave = `${e.empresa}|${d.dep}`
              const totalDep = totalDe(d.pessoas)
              const estaAberto = aberto.has(chave)
              return (
                <div key={chave}>
                  <button onClick={() => alternar(chave)}
                    className="w-full flex items-baseline justify-between gap-2 py-1.5 px-1 hover:bg-slate-50 border-b border-slate-100 text-left">
                    <span className="text-xs text-slate-600">
                      <span className="inline-block w-3 text-slate-400">{estaAberto ? '▾' : '▸'}</span>
                      {d.dep}
                    </span>
                    <span className="flex items-baseline gap-3 shrink-0">
                      <span className="text-[10px] text-slate-400">{d.pessoas.length}</span>
                      <span className="text-xs font-semibold text-slate-700 tabular-nums">{brl(totalDep)}</span>
                    </span>
                  </button>

                  {estaAberto && d.pessoas.map(p => {
                    const c = custoDe(p, mesesFechados)
                    const lacunas = mesesFechados - c.meses
                    return (
                      <div key={p.nome}
                        className={`flex items-baseline justify-between gap-2 py-1 pl-7 pr-1 border-b border-slate-50 text-[11px] ${
                          p.status === 'Inativo' ? 'opacity-50' : ''}`}>
                        <span className="truncate">
                          <span className="text-slate-700">{p.nome}</span>
                          <span className="text-slate-400 ml-1.5">{p.cargo}</span>
                          <span className="text-slate-300 ml-1.5">{p.tipo}</span>
                          {p.status === 'Inativo' && p.saida && (
                            <span className="text-amber-700 ml-1.5">saiu {p.saida.slice(8, 10)}/{p.saida.slice(5, 7)}</span>
                          )}
                        </span>
                        <span className="flex items-baseline gap-3 shrink-0">
                          {lacunas > 0 && c.meses > 0 && (
                            <span className="text-[9px] text-slate-400" title="Meses sem lançamento; a média usa só os que têm.">
                              {c.meses}m
                            </span>
                          )}
                          <span className="text-slate-500 tabular-nums">{brl(c.media)}/mês</span>
                          <span className="font-medium text-slate-700 tabular-nums w-[74px] text-right">{brl(c.total)}</span>
                        </span>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <p className="text-[10px] text-slate-400 mt-3">
        Custo é salário mais encargos, da planilha do DP. A média de cada pessoa usa só os meses
        com lançamento — quem entrou ou saiu no meio do ano não tem o valor diluído pelo
        calendário inteiro.
      </p>
    </div>
  )
}
