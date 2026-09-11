'use client'

import { useState } from 'react'
import type { Setor, Pessoa } from '@/lib/rh/dados'
import { cruzar, type PessoaOrganograma } from '@/lib/rh/organograma-cruzado'

const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)

// Mapa de cor → classes tailwind (precisa ser estático p/ o Tailwind detectar)
const COR: Record<string, { borda: string; topo: string; chip: string; texto: string }> = {
  slate:   { borda: 'border-slate-300',   topo: 'bg-slate-700',   chip: 'bg-slate-100 text-slate-700',   texto: 'text-slate-700' },
  teal:    { borda: 'border-teal-300',    topo: 'bg-teal-600',    chip: 'bg-teal-50 text-teal-700',      texto: 'text-teal-700' },
  amber:   { borda: 'border-amber-300',   topo: 'bg-amber-500',   chip: 'bg-amber-50 text-amber-700',    texto: 'text-amber-700' },
  purple:  { borda: 'border-purple-300',  topo: 'bg-purple-600',  chip: 'bg-purple-50 text-purple-700',  texto: 'text-purple-700' },
  orange:  { borda: 'border-orange-300',  topo: 'bg-orange-500',  chip: 'bg-orange-50 text-orange-700',  texto: 'text-orange-700' },
  sky:     { borda: 'border-sky-300',     topo: 'bg-sky-600',     chip: 'bg-sky-50 text-sky-700',        texto: 'text-sky-700' },
  blue:    { borda: 'border-blue-300',    topo: 'bg-blue-600',    chip: 'bg-blue-50 text-blue-700',      texto: 'text-blue-700' },
  green:   { borda: 'border-green-300',   topo: 'bg-green-600',   chip: 'bg-green-50 text-green-700',     texto: 'text-green-700' },
  emerald: { borda: 'border-emerald-300', topo: 'bg-emerald-600', chip: 'bg-emerald-50 text-emerald-700', texto: 'text-emerald-700' },
}

function iniciais(nome: string): string {
  const partes = nome.replace(/^(Dra?\.|Enfª)\s*/i, '').trim().split(/\s+/)
  const a = partes[0]?.[0] ?? ''
  const b = partes.length > 1 ? partes[partes.length - 1][0] : ''
  return (a + b).toUpperCase()
}

function CardPessoa({ p, cor, mostrarCusto }: {
  p: PessoaOrganograma; cor: string; mostrarCusto: boolean
}) {
  const c = COR[cor] ?? COR.slate
  const ehLider = p.destaque === 'gerente' || p.destaque === 'supervisor'
  return (
    <div className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 ${
      p.saiu ? 'bg-slate-50 border-slate-200 opacity-60'
             : ehLider ? 'bg-white ' + c.borda + ' ring-1 ring-inset ring-slate-100'
                       : 'bg-white border-slate-200'}`}>
      <div className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold text-white ${
        p.saiu ? 'bg-slate-300' : ehLider ? c.topo : 'bg-slate-400'}`}>
        {iniciais(p.nome)}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-xs font-semibold truncate leading-tight ${
          p.saiu ? 'text-slate-500 line-through' : 'text-slate-800'}`}>{p.nome}</p>
        <p className="text-[10px] text-slate-500 truncate leading-tight">
          {p.cargo}
          {p.destaque === 'gerente' && !p.saiu && <span className={`ml-1 font-medium ${c.texto}`}>· Gestor</span>}
          {p.destaque === 'supervisor' && !p.saiu && <span className={`ml-1 font-medium ${c.texto}`}>· Supervisão</span>}
          {p.saiu && p.saida && (
            <span className="ml-1 font-medium text-amber-700">
              · saiu {p.saida.slice(8, 10)}/{p.saida.slice(5, 7)}
            </span>
          )}
        </p>
      </div>
      {mostrarCusto && (
        <span className="text-[10px] tabular-nums shrink-0 text-slate-500"
              title={p.registro ? `${p.registro.tipo} · ${p.registro.empresa}` : 'sem correspondência na planilha do DP'}>
          {p.custoMes === null ? '—' : brl(p.custoMes)}
        </span>
      )}
    </div>
  )
}

function CardSetor({ setor, mesesFechados, mostrarSaidos, mostrarCusto }: {
  setor: Setor; mesesFechados: number; mostrarSaidos: boolean; mostrarCusto: boolean
}) {
  const c = COR[setor.cor] ?? COR.slate
  const cruzadas = cruzar(setor.pessoas, mesesFechados)
  const visiveis = mostrarSaidos ? cruzadas : cruzadas.filter(p => !p.saiu)
  const ordenadas = [...visiveis].sort((a, b) => {
    const peso = (p: PessoaOrganograma) => (p.saiu ? 3 : p.destaque === 'gerente' ? 0 : p.destaque === 'supervisor' ? 1 : 2)
    return peso(a) - peso(b)
  })
  if (ordenadas.length === 0) return null

  const ativos = cruzadas.filter(p => !p.saiu)
  // Mesmo critério do topo: o subtotal soma o que está sendo exibido.
  const contadas = mostrarSaidos ? cruzadas : ativos
  const custoSetor = contadas.reduce((s, p) => s + (p.custoMes ?? 0), 0)
  const semCusto = contadas.filter(p => p.custoMes === null).length

  return (
    <div className={`rounded-xl border ${c.borda} bg-white overflow-hidden shadow-sm`}>
      <div className={`${c.topo} px-3 py-2 flex items-center justify-between gap-2`}>
        <h4 className="text-xs font-bold text-white uppercase tracking-wide truncate">{setor.nome}</h4>
        <span className="flex items-center gap-1.5 shrink-0">
          {mostrarCusto && custoSetor > 0 && (
            <span className="text-[10px] font-semibold text-white/90 tabular-nums"
                  title={semCusto > 0 ? `${semCusto} pessoa(s) sem custo na planilha, fora deste total` : undefined}>
              {brl(custoSetor)}{semCusto > 0 && '*'}
            </span>
          )}
          <span className="text-[10px] font-semibold text-white/90 bg-white/20 rounded-full px-2 py-0.5">
            {contadas.length}
          </span>
        </span>
      </div>
      <div className="p-2.5 space-y-1.5">
        {ordenadas.map((p, i) => (
          <CardPessoa key={i} p={p} cor={setor.cor} mostrarCusto={mostrarCusto} />
        ))}
      </div>
    </div>
  )
}

export default function Organograma({ setores, mesesFechados }: {
  setores: Setor[]
  /** Para calcular o custo médio de cada pessoa. */
  mesesFechados: number
}) {
  // Quem saiu continua no organograma da parede (fotos de 06/05/2026) e some
  // daqui por padrão — em 11/09 eram doze pessoas, com saídas entre março e
  // setembro. O interruptor existe porque ver quem saiu ajuda a entender uma
  // equipe que encolheu.
  const [mostrarSaidos, setMostrarSaidos] = useState(false)
  const [mostrarCusto, setMostrarCusto] = useState(true)

  const todas = setores.flatMap(s => cruzar(s.pessoas, mesesFechados))
  // Pessoa em dois setores conta uma vez: gerente aparece na própria área e no
  // quadro da unidade, e o Cleber confirmou que o de baixo é ilustrativo — o
  // salário fica lançado na matriz.
  const unicas = new Map<string, typeof todas[0]>()
  for (const p of todas) if (!unicas.has(p.nome)) unicas.set(p.nome, p)
  const distintas = [...unicas.values()]
  const ativas = distintas.filter(p => !p.saiu)
  const saidas = distintas.filter(p => p.saiu)
  // O total acompanha o interruptor: incluir quem saiu tem de somar o custo
  // dessas pessoas também, senão o número no topo contradiz a lista abaixo.
  const consideradas = mostrarSaidos ? distintas : ativas
  const custoTotal = consideradas.reduce((s, p) => s + (p.custoMes ?? 0), 0)
  const semCusto = consideradas.filter(p => p.custoMes === null).length
  const custoSaidas = saidas.reduce((s, p) => s + (p.custoMes ?? 0), 0)

  const grupos: { titulo: string; chave: Setor['grupo'] }[] = [
    { titulo: 'Gestão Geral', chave: 'Gestão' },
    { titulo: 'Áreas Corporativas (Sede)', chave: 'Corporativo' },
    { titulo: 'Medicina', chave: 'Medicina' },
    { titulo: 'Clínicas', chave: 'Clínicas' },
  ]

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pb-3 border-b border-slate-200">
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider">
            {mostrarSaidos ? 'No desenho' : 'No quadro'}
          </p>
          <p className="text-lg font-bold text-slate-800 tabular-nums">
            {consideradas.length} pessoas
            {mostrarSaidos && saidas.length > 0 && (
              <span className="text-xs font-normal text-slate-400 ml-1">
                ({ativas.length} ativas + {saidas.length} que saíram)
              </span>
            )}
          </p>
        </div>
        {mostrarCusto && (
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider">Custo por mês</p>
            <p className="text-lg font-bold text-slate-800 tabular-nums">
              {brl(custoTotal)}
              {semCusto > 0 && <span className="text-xs font-normal text-slate-400 ml-1">+{semCusto} sem valor</span>}
            </p>
            {mostrarSaidos && custoSaidas > 0 && (
              <p className="text-[10px] text-amber-700">
                {brl(custoSaidas)} são de quem já saiu
              </p>
            )}
          </div>
        )}
        {saidas.length > 0 && (
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider">Já saíram</p>
            <p className="text-lg font-bold text-amber-700 tabular-nums">{saidas.length}</p>
          </div>
        )}
        <div className="flex items-center gap-3 ml-auto">
          <label className="flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer">
            <input type="checkbox" checked={mostrarCusto}
                   onChange={e => setMostrarCusto(e.target.checked)} className="rounded" />
            mostrar custo
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer">
            <input type="checkbox" checked={mostrarSaidos}
                   onChange={e => setMostrarSaidos(e.target.checked)} className="rounded" />
            incluir quem saiu
          </label>
        </div>
      </div>

      {saidas.length > 0 && !mostrarSaidos && (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 -mt-4">
          {saidas.length} {saidas.length === 1 ? 'pessoa saiu' : 'pessoas saíram'} e ainda constam no
          organograma da parede: {saidas.slice(0, 4).map(p => p.nome).join(', ')}
          {saidas.length > 4 && ` e mais ${saidas.length - 4}`}. Estão ocultas aqui, e a planilha do
          DP é quem sabe — o desenho da parede é de 06/05/2026.
        </p>
      )}

      {grupos.map(g => {
        const lista = setores.filter(s => s.grupo === g.chave)
        if (lista.length === 0) return null
        return (
          <div key={g.chave}>
            <div className="flex items-center gap-3 mb-3">
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">{g.titulo}</h3>
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-xs text-slate-400">
                {lista.reduce((s, x) => s + cruzar(x.pessoas, mesesFechados).filter(p => !p.saiu).length, 0)} pessoas
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {lista.map(s => (
                <CardSetor key={s.nome} setor={s} mesesFechados={mesesFechados}
                           mostrarSaidos={mostrarSaidos} mostrarCusto={mostrarCusto} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
