// "Última atualização" por fonte — sempre exibe origem + quando.
export default function SourceTimestamp({ fonte, atualizadoEm }: { fonte: string; atualizadoEm: string }) {
  return (
    <p className="text-[10px] text-slate-400 mt-1">
      <span className="font-medium text-slate-500">{fonte}</span>
      {' · '}
      {atualizadoEm && atualizadoEm !== '—' ? `atualizado ${atualizadoEm}` : 'sem leitura'}
    </p>
  )
}
