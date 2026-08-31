'use client'

import { useRouter, useSearchParams } from 'next/navigation'

export type Tabela = { titulo: string; subtitulo: string; linhas: LinhaTabela[] }

export type LinhaTabela = {
  rotulo: string
  tipo: 'receita' | 'saida' | 'subtotal' | 'total' | 'acumulado'
  valores: number[]
  total: number
  media: number
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
               'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

const fmt = (v: number) =>
  v === 0 ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

// Cada tipo de linha tem um peso visual: as de movimento ficam discretas, os
// subtotais saltam. É como o demonstrativo em papel se lê.
const ESTILO: Record<LinhaTabela['tipo'], { linha: string; rotulo: string; valor: string }> = {
  receita:   { linha: 'bg-white',       rotulo: 'font-medium text-slate-800', valor: 'text-slate-800' },
  saida:     { linha: 'bg-white',       rotulo: 'text-slate-600',             valor: 'text-slate-600' },
  subtotal:  { linha: 'bg-slate-50',    rotulo: 'font-bold text-slate-900',   valor: 'font-semibold text-slate-900' },
  total:     { linha: 'bg-blue-50',     rotulo: 'font-bold text-blue-900',    valor: 'font-bold text-blue-900' },
  acumulado: { linha: 'bg-slate-900',   rotulo: 'font-bold text-white',       valor: 'font-bold text-white' },
}

export default function DemonstrativoClient({
  ano, anoCorrente, empresaId, empresas, tabelas, mesesFechados,
}: {
  ano: number
  anoCorrente: number
  empresaId: string | null
  empresas: { id: string; nome_curto: string }[]
  tabelas: Tabela[]
  mesesFechados: number
}) {
  const router = useRouter()
  const params = useSearchParams()

  const navegar = (chave: string, valor: string | null) => {
    const p = new URLSearchParams(params.toString())
    if (valor) p.set(chave, valor)
    else p.delete(chave)
    router.push(`/dashboard/financeiro/demonstrativo${p.toString() ? `?${p}` : ''}`)
  }

  const anos = Array.from({ length: anoCorrente - 2024 + 1 }, (_, i) => 2024 + i).reverse()

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-end gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5">Exercício</p>
          <div className="flex gap-1">
            {anos.map(a => (
              <button key={a} onClick={() => navegar('ano', String(a))}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  a === ano ? 'bg-blue-900 text-white border-blue-900'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                {a}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5">Empresa</p>
          <select
            value={empresaId ?? ''}
            onChange={e => navegar('empresa', e.target.value || null)}
            className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white text-slate-700"
          >
            <option value="">Grupo consolidado</option>
            {empresas.map(e => <option key={e.id} value={e.id}>{e.nome_curto}</option>)}
          </select>
        </div>
      </div>

      {tabelas.map(t => (
        <TabelaMensal key={t.titulo} tabela={t} ano={ano} mesesFechados={mesesFechados} />
      ))}
    </div>
  )
}

function TabelaMensal({ tabela, ano, mesesFechados }: {
  tabela: Tabela; ano: number; mesesFechados: number
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200">
        <h2 className="font-semibold text-slate-800">{tabela.titulo}</h2>
        <p className="text-xs text-slate-500 mt-0.5">{tabela.subtitulo}</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100 text-slate-600">
              <th className="text-left font-semibold px-3 py-2.5 sticky left-0 bg-slate-100 z-10 min-w-[230px]">
                MÊS
              </th>
              {MESES.map((m, i) => (
                <th key={m}
                  className={`text-right font-semibold px-2.5 py-2.5 whitespace-nowrap min-w-[92px] ${
                    i >= mesesFechados ? 'text-slate-400' : ''}`}
                  title={i >= mesesFechados ? 'mês ainda não fechado' : undefined}>
                  {m.slice(0, 3)}/{String(ano).slice(2)}
                </th>
              ))}
              <th className="text-right font-semibold px-3 py-2.5 whitespace-nowrap bg-slate-200 min-w-[104px]">Total</th>
              <th className="text-right font-semibold px-3 py-2.5 whitespace-nowrap bg-slate-200 min-w-[104px]">Média</th>
            </tr>
          </thead>
          <tbody>
            {tabela.linhas.map(l => {
              const e = ESTILO[l.tipo]
              return (
                <tr key={l.rotulo} className={`border-t border-slate-100 ${e.linha}`}>
                  <td className={`px-3 py-2 sticky left-0 z-10 whitespace-nowrap ${e.linha} ${e.rotulo}`}>
                    {l.rotulo}
                  </td>
                  {l.valores.map((v, i) => (
                    <td key={i}
                      className={`px-2.5 py-2 text-right tabular-nums whitespace-nowrap ${
                        v < 0 && l.tipo !== 'saida' ? 'text-red-600'
                        : l.tipo === 'acumulado' ? e.valor
                        : v === 0 ? 'text-slate-300' : e.valor
                      } ${i >= mesesFechados && l.tipo !== 'acumulado' ? 'opacity-50' : ''}`}>
                      {fmt(v)}
                    </td>
                  ))}
                  <td className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${
                    l.tipo === 'acumulado' ? 'bg-slate-800 text-white font-bold' : 'bg-slate-50 font-semibold'
                  } ${l.total < 0 && l.tipo !== 'saida' && l.tipo !== 'acumulado' ? 'text-red-600' : ''}`}>
                    {fmt(l.total)}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${
                    l.tipo === 'acumulado' ? 'bg-slate-800 text-slate-400' : 'bg-slate-50 text-slate-600'
                  }`}>
                    {l.tipo === 'acumulado' ? '—' : fmt(l.media)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-2.5 border-t border-slate-200 bg-slate-50 text-[11px] text-slate-500 leading-relaxed">
        Despesas aparecem negativas, como no demonstrativo em papel. Meses ainda não fechados
        ficam esmaecidos e <strong>não entram na média</strong> — nem os meses sem movimento, que
        diluiriam o resultado de quem começou a operar no meio do ano.
        {tabela.linhas.some(l => l.tipo === 'acumulado') && (
          <> Na linha de <strong>acumulado</strong>, a coluna Total é o saldo no último mês
          fechado, não a soma das colunas.</>
        )}
      </div>
    </div>
  )
}
