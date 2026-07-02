// Próximo passo recomendado — apenas TEXTO. Nunca botão de ação crítica.
export default function RecommendedAction({ texto }: { texto: string }) {
  if (!texto) return null
  return (
    <p className="text-[10px] text-slate-500 mt-1.5 flex items-start gap-1">
      <span aria-hidden="true">→</span>
      <span>{texto}</span>
    </p>
  )
}
