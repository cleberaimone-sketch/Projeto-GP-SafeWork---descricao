// Banner fixo — deixa explícito que os dados estão em reconciliação (não usar p/ decisão definitiva).
export default function DataReconciliationBanner() {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5">
      <p className="text-xs text-amber-800">
        <span className="font-semibold">⚠️ Dados em reconciliação</span>
        {' — '}painel de diagnóstico (read-only). Não usar para decisão financeira definitiva. Cada indicador exibe seu selo de confiabilidade e fonte.
      </p>
    </div>
  )
}
