// Estado bloqueado — usado quando um dado está suspenso por incidente/decisão.
export default function BlockedState({ titulo, detalhe }: { titulo: string; detalhe?: string }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
      <p className="text-xs font-semibold text-red-800">⛔ {titulo}</p>
      {detalhe && <p className="text-[10px] text-red-700/80 mt-0.5">{detalhe}</p>}
    </div>
  )
}
