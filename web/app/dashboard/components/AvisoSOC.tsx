// Faixa que diz se os números da tela vieram do SOC ou de uma falha.
// Confiabilidade do dado vem antes do dado, então fica acima dos alertas.

import type { EstadoSOC } from '@/lib/soc/coleta'

export default function AvisoSOC({ estado, oQueSomeSemDado }: {
  estado: EstadoSOC
  /** O que esta tela em particular deixa de enxergar. Ex.: "ASO vencido". */
  oQueSomeSemDado: string
}) {
  if (!estado.mudo && !estado.parcial) return null

  return (
    <div className={`mb-6 rounded-xl px-4 py-3 flex items-start gap-3 border ${
      estado.mudo ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
      <span className="text-lg mt-0.5">{estado.mudo ? '🔴' : '⚠️'}</span>
      <p className="text-sm text-slate-800">
        {estado.mudo ? (
          <>
            <span className="font-semibold text-red-800">O SOC não respondeu.</span>{' '}
            Nenhuma das {estado.total} consultas retornou, então <strong>todos os números desta
            tela estão zerados por falta de dado, não por falta de movimento</strong>. Não use
            esta tela para concluir que não há {oQueSomeSemDado}.
          </>
        ) : (
          <>
            <span className="font-semibold text-amber-800">Dados incompletos do SOC:</span>{' '}
            {estado.falhas.length} de {estado.total} consultas falharam
            ({estado.falhas.join(', ')}). Os indicadores que dependem delas aparecem como zero,
            mas são desconhecidos.
          </>
        )}
      </p>
    </div>
  )
}
