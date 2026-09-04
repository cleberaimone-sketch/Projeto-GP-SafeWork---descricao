// Faixa que avisa quando o imposto do período não está na base.
//
// Fica onde o número enganado aparece — Cockpit, DRE, Acompanhamento —, porque
// o alerta só serve se estiver na mesma tela da conclusão errada.

import type { AlertaTributos as Dados } from '@/lib/financeiro/integridade'

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const pct = (v: number) => `${v.toFixed(1).replace('.', ',')}%`
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
               'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

export default function AlertaTributos({ dados, formato = 'caixa' }: {
  dados: Dados | null
  /** 'faixa' ocupa a largura toda, no topo da página; 'caixa' fica embutida. */
  formato?: 'faixa' | 'caixa'
}) {
  if (!dados) return null

  const texto = (
    <>
      No acumulado de janeiro a {MESES[dados.meses - 1]} de {dados.ano}, as deduções somam{' '}
      <strong>{pct(dados.cargaAtual)}</strong> da receita, contra{' '}
      <strong>{pct(dados.cargaAnterior)}</strong> nos mesmos meses de {dados.anoAnterior}.
      São cerca de <strong>{brl(dados.faltante)}</strong> de imposto fora da conta — lucro e margem
      desta tela estão altos demais.
    </>
  )

  if (formato === 'faixa') {
    return (
      <div className="bg-red-600 text-white">
        <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-2.5 text-sm flex items-center gap-2 flex-wrap">
          <span className="font-bold">⚠️ Faltam tributos na base:</span>
          <span>{texto}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 mb-4">
      <p className="text-xs text-red-900">
        <strong>Faltam tributos na base.</strong> {texto}
      </p>
    </div>
  )
}
