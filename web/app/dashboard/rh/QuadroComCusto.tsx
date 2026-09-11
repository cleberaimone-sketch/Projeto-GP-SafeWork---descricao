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

/**
 * Custo da pessoa: o do mês de referência, o acumulado e a média.
 *
 * Os três são perguntas diferentes e a tela já os confundiu: o topo mostrava
 * R$ 185.934 (um mês, do Conta Azul) e o quadro R$ 160.420 (soma das médias
 * individuais), como se devessem bater. Média não é mês.
 */
function custoDe(p: Pessoa, mesesFechados: number, mesRef: number) {
  const meses = p.custoMensal.slice(0, mesesFechados)
  const comLancamento = meses.filter(v => v > 0)
  const total = comLancamento.reduce((s, v) => s + v, 0)
  return {
    total,
    meses: comLancamento.length,
    media: comLancamento.length ? total / comLancamento.length : 0,
    noMes: p.custoMensal[mesRef] ?? 0,
  }
}

export default function QuadroComCusto({ pessoas, mesesFechados, mesRef, rotuloMes }: {
  pessoas: Pessoa[]
  mesesFechados: number
  /** Índice 0-11 do mês que o painel usa como referência. */
  mesRef: number
  rotuloMes: string
}) {
  const [mostrarInativos, setMostrarInativos] = useState(false)
  const [aberto, setAberto] = useState<Set<string>>(new Set())
  // Simulação de saída: quem está aqui é descontado dos totais, sem sumir da
  // lista. Serve para responder "se essa pessoa sair, a folha fica em quanto?"
  // antes de a decisão existir.
  const [simuladas, setSimuladas] = useState<Set<string>>(new Set())

  const alternarSimulada = (nome: string) => setSimuladas(prev => {
    const n = new Set(prev)
    if (n.has(nome)) n.delete(nome); else n.add(nome)
    return n
  })

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

  const totalDe = (lista: Pessoa[]) => lista.reduce((s, p) => s + custoDe(p, mesesFechados, mesRef).total, 0)
  const mediaDe = (lista: Pessoa[]) => lista.reduce((s, p) => s + custoDe(p, mesesFechados, mesRef).media, 0)
  const noMesDe = (lista: Pessoa[]) => lista.reduce((s, p) => s + custoDe(p, mesesFechados, mesRef).noMes, 0)
  const semSimuladas = (lista: Pessoa[]) => lista.filter(p => !simuladas.has(p.nome))

  const totalGeral = totalDe(visiveis)
  // Média do grupo é a soma das médias INDIVIDUAIS, não o total dividido pelos
  // meses: quem entrou em maio tem média de maio em diante, e dividir o total
  // acumulado pelo calendário inteiro daria um custo mensal que ninguém paga.
  const mediaGeral = mediaDe(visiveis)
  const mediaSimulada = mediaDe(semSimuladas(visiveis))
  const economia = mediaGeral - mediaSimulada

  const empresas = [...porEmpresa.entries()]
    .map(([emp, deps]) => ({
      empresa: emp,
      deps: [...deps.entries()]
        .map(([dep, ps]) => ({ dep, pessoas: [...ps].sort((a, b) => custoDe(b, mesesFechados, mesRef).total - custoDe(a, mesesFechados, mesRef).total) }))
        .sort((a, b) => totalDe(b.pessoas) - totalDe(a.pessoas)),
      total: totalDe([...deps.values()].flat()),
      media: mediaDe([...deps.values()].flat()),
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
          <p className="text-[10px] text-slate-400 uppercase tracking-wider">Em {rotuloMes}</p>
          <p className="text-xl font-bold text-slate-800 tabular-nums">{brl(noMesDe(visiveis))}</p>
          <p className="text-[9px] text-slate-400">mesmo mês do painel acima</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider">Acumulado</p>
          <p className="text-xl font-bold text-slate-800 tabular-nums">{brl(totalGeral)}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider">Média por mês</p>
          <p className="text-xl font-bold text-slate-800 tabular-nums">{brl(mediaGeral)}</p>
          <p className="text-[9px] text-slate-400">não é o mesmo que o mês</p>
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

      {simuladas.size > 0 && (
        <div className="rounded-xl border-2 border-blue-300 bg-blue-50 p-3 mb-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <p className="text-[10px] text-blue-900 uppercase tracking-wider font-semibold">
                Simulando a saída de {simuladas.size} {simuladas.size === 1 ? 'pessoa' : 'pessoas'}
              </p>
              <p className="text-xs text-blue-800 mt-0.5">
                A folha cai de <strong>{brl(mediaGeral)}</strong> para{' '}
                <strong>{brl(mediaSimulada)}</strong> por mês
                {mediaGeral > 0 && <> — {((economia / mediaGeral) * 100).toFixed(1)}% a menos</>}.
              </p>
            </div>
            <div className="flex items-baseline gap-4">
              <div className="text-right">
                <p className="text-[10px] text-blue-700 uppercase tracking-wider">Economia/mês</p>
                <p className="text-xl font-bold text-blue-900 tabular-nums">{brl(economia)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-blue-700 uppercase tracking-wider">Em 12 meses</p>
                <p className="text-xl font-bold text-blue-900 tabular-nums">{brl(economia * 12)}</p>
              </div>
              <button onClick={() => setSimuladas(new Set())}
                      className="text-[11px] text-blue-700 hover:underline self-end">
                limpar
              </button>
            </div>
          </div>
          <p className="text-[10px] text-blue-700 mt-2">
            É só o custo direto da pessoa. Rescisão, aviso prévio e o que a saída exige de
            substituição ficam de fora — a conta responde &ldquo;quanto essa folha pesa&rdquo;, não
            &ldquo;quanto custa desligar&rdquo;.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {empresas.map(e => (
          <div key={e.empresa}>
            <div className="flex items-baseline justify-between gap-2 py-1.5 border-b-2 border-slate-300">
              <p className="text-xs font-bold text-slate-800 uppercase tracking-wider">{e.empresa}</p>
              <div className="flex items-baseline gap-3 shrink-0">
                <span className="text-[10px] text-slate-400">{e.qtd} {e.qtd === 1 ? 'pessoa' : 'pessoas'}</span>
                <span className="text-[11px] text-slate-500 tabular-nums">{brl(e.media)}/mês</span>
                <span className="text-sm font-bold text-slate-800 tabular-nums">{brl(e.total)}</span>
              </div>
            </div>

            {e.deps.map(d => {
              const chave = `${e.empresa}|${d.dep}`
              const totalDep = totalDe(d.pessoas)
              const mediaDep = mediaDe(d.pessoas)
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
                      <span className="text-[11px] text-slate-500 tabular-nums">{brl(mediaDep)}/mês</span>
                      <span className="text-xs font-semibold text-slate-700 tabular-nums">{brl(totalDep)}</span>
                    </span>
                  </button>

                  {estaAberto && d.pessoas.map(p => {
                    const c = custoDe(p, mesesFechados, mesRef)
                    const lacunas = mesesFechados - c.meses
                    return (
                      <div key={p.nome}
                        className={`flex items-baseline justify-between gap-2 py-1 pl-3 pr-1 border-b border-slate-50 text-[11px] ${
                          p.status === 'Inativo' ? 'opacity-50' : ''} ${
                          simuladas.has(p.nome) ? 'bg-blue-50' : ''}`}>
                        <span className="truncate flex items-baseline gap-1.5">
                          <input type="checkbox" checked={simuladas.has(p.nome)}
                                 onChange={() => alternarSimulada(p.nome)}
                                 className="rounded shrink-0 self-center"
                                 title="Simular a saída desta pessoa" />
                          <span className={`text-slate-700 ${simuladas.has(p.nome) ? 'line-through' : ''}`}>{p.nome}</span>
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
