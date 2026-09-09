// ASO por trabalhador — o indicador que a tela de medicina nunca teve.
//
// Vem do espelho local do SOC, não da API ao vivo: continua de pé quando o SOC
// está fora, que é justamente quando mais se pergunta se há ASO vencido.

export type ResumoAso = {
  trabalhadores: number
  precisamAcao: number
  porSituacao: Record<string, number>
  topEmpresas: { empresa: string; qtd: number }[]
} | { indisponivel: true; motivo: string }

const num = (v: number) => v.toLocaleString('pt-BR')

// Ordem por urgência, não alfabética: o que exige ação vem primeiro.
const ORDEM: { chave: string; rotulo: string; cor: string; acao: boolean }[] = [
  { chave: 'vencido',             rotulo: 'Vencido',            cor: 'text-red-700 bg-red-50 border-red-200',       acao: true },
  { chave: 'inapto',              rotulo: 'Inapto',             cor: 'text-red-800 bg-red-100 border-red-300',      acao: true },
  { chave: 'parecer pendente',    rotulo: 'Parecer pendente',   cor: 'text-amber-800 bg-amber-50 border-amber-200', acao: true },
  { chave: 'apto com restricoes', rotulo: 'Apto c/ restrições', cor: 'text-amber-700 bg-amber-50 border-amber-200', acao: false },
  { chave: 'em dia',              rotulo: 'Em dia',             cor: 'text-emerald-700 bg-emerald-50 border-emerald-200', acao: false },
]

export default function AsoPorTrabalhador({ resumo }: { resumo: ResumoAso }) {
  if ('indisponivel' in resumo) {
    return (
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-bold text-slate-800 mb-1">ASO por trabalhador</h2>
        <p className="text-xs text-amber-800">
          Indicador indisponível: {resumo.motivo}.{' '}
          <strong>Isso não quer dizer que não há ASO vencido</strong> — quer dizer que não dá
          para saber agora.
        </p>
      </div>
    )
  }

  const pct = resumo.trabalhadores > 0
    ? (resumo.precisamAcao / resumo.trabalhadores) * 100 : 0

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="font-bold text-slate-800">ASO por trabalhador</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {num(resumo.trabalhadores)} com vínculo ativo, pendente ou afastado · espelho do SOC
          </p>
        </div>
        <div className="text-right">
          <p className={`text-2xl font-bold tabular-nums ${
            pct >= 20 ? 'text-red-700' : pct >= 10 ? 'text-amber-700' : 'text-emerald-700'}`}>
            {num(resumo.precisamAcao)}
          </p>
          <p className="text-[10px] text-slate-400">
            precisam de ação · {pct.toFixed(1)}%
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {ORDEM.filter(o => resumo.porSituacao[o.chave]).map(o => (
          <div key={o.chave} className={`rounded-lg border px-3 py-1.5 ${o.cor}`}>
            <span className="text-sm font-bold tabular-nums">{num(resumo.porSituacao[o.chave])}</span>
            <span className="text-[11px] ml-1.5">{o.rotulo}</span>
          </div>
        ))}
      </div>

      {resumo.topEmpresas.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1.5">
            Empresas com mais pendências
          </p>
          <div className="space-y-1">
            {resumo.topEmpresas.map(e => {
              const maior = resumo.topEmpresas[0]?.qtd || 1
              return (
                <div key={e.empresa} className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-600 truncate flex-1 min-w-0" title={e.empresa}>
                    {e.empresa}
                  </span>
                  <div className="w-24 h-2 rounded-full bg-slate-100 overflow-hidden shrink-0">
                    <div className="h-full rounded-full bg-red-400"
                         style={{ width: `${(e.qtd / maior) * 100}%` }} />
                  </div>
                  <span className="text-[11px] font-semibold tabular-nums text-slate-700 w-10 text-right shrink-0">
                    {num(e.qtd)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <p className="text-[10px] text-slate-400 mt-3 leading-relaxed">
        <strong>Vencido</strong> inclui quem não tem consulta no espelho: ele cobre cerca de 365
        dias, e não achar consulta ali é não ter consulta no último ano.
        {' '}O cálculo depende do cadastro de situação estar correto no SOC — quem saiu e continua
        como ativo aparece aqui, e <strong>quem está ativo cadastrado como inativo não aparece</strong>.
      </p>
    </div>
  )
}
