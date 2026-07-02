// Grid/tabela de status das integrações.
import type { Integracao } from '@/lib/command-center/types'
import SignalBadge from './SignalBadge'

export default function IntegrationsStatusGrid({ integracoes }: { integracoes: Integracao[] }) {
  if (!integracoes.length) {
    return <p className="text-xs text-slate-500">Nenhuma integração registrada.</p>
  }
  return (
    <div className="bg-white rounded-xl border border-slate-200">
      <div className="px-5 py-3 border-b border-slate-200">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Integrações</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/50 text-left text-[10px] uppercase tracking-wider text-slate-500">
              <th className="px-5 py-2 font-semibold">Fonte</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 font-semibold">Detalhe</th>
              <th className="px-3 py-2 font-semibold">Últ. sucesso</th>
              <th className="px-5 py-2 font-semibold">Últ. erro</th>
            </tr>
          </thead>
          <tbody>
            {integracoes.map((it, i) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="px-5 py-2.5 font-medium text-slate-800">{it.nome}</td>
                <td className="px-3 py-2.5"><SignalBadge nivel={it.status} /></td>
                <td className="px-3 py-2.5 text-slate-500">{it.detalhe}</td>
                <td className="px-3 py-2.5 text-slate-500 tabular-nums">{it.ultimoSucesso ?? '—'}</td>
                <td className="px-5 py-2.5 text-slate-500 tabular-nums">{it.ultimoErro ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
