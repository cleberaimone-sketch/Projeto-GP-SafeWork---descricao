'use client'

import { useState } from 'react'
import ConciliacaoClient from './ConciliacaoClient'
import CobradoRecebido from './CobradoRecebido'
import type { TxConciliada, ResumoConc, CobrancaItem, ResumoCobranca } from '@/lib/financeiro/conciliacao'

interface Props {
  tabelaPronta: boolean
  transacoes: TxConciliada[]
  resumo: ResumoConc
  cobrancas: CobrancaItem[]
  resumoCobr: ResumoCobranca
}

export default function ConciliacaoTabs({ tabelaPronta, transacoes, resumo, cobrancas, resumoCobr }: Props) {
  const [tab, setTab] = useState<'cobrado' | 'conciliacao'>('cobrado')

  return (
    <>
      <div className="inline-flex bg-white border border-slate-200 rounded-lg overflow-hidden mb-5">
        <button
          onClick={() => setTab('cobrado')}
          className={`px-4 py-2 text-xs font-medium ${tab === 'cobrado' ? 'bg-slate-700 text-white' : 'text-slate-600 hover:text-slate-800'}`}
        >
          Cobrado × Recebido {resumoCobr.qtd > 0 && <span className="opacity-70">({resumoCobr.qtd})</span>}
        </button>
        <button
          onClick={() => setTab('conciliacao')}
          className={`px-4 py-2 text-xs font-medium ${tab === 'conciliacao' ? 'bg-slate-700 text-white' : 'text-slate-600 hover:text-slate-800'}`}
        >
          Extrato × ERP
        </button>
      </div>

      {tab === 'cobrado'
        ? <CobradoRecebido tabelaPronta={tabelaPronta} cobrancas={cobrancas} resumo={resumoCobr} />
        : <ConciliacaoClient tabelaPronta={tabelaPronta} transacoes={transacoes} resumo={resumo} />}
    </>
  )
}
