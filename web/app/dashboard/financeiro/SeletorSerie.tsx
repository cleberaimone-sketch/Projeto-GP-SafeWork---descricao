'use client'

// Seletor da janela dos gráficos de série (Tendência + Fluxo de Caixa).
// Regra padrão: ano atual. Botões alternam para últimos 12 meses / ano anterior.
// Controla o searchParam `serie` (ano | 12m | ano_ant) e força refresh do server component.

import { useRouter, useSearchParams, usePathname } from 'next/navigation'

export default function SeletorSerie({ value, anoAtual }: { value: string; anoAtual: number }) {
  const router   = useRouter()
  const pathname = usePathname()
  const params   = useSearchParams()

  function set(v: string) {
    const p = new URLSearchParams(params.toString())
    if (v === 'ano') p.delete('serie')
    else             p.set('serie', v)
    router.push(`${pathname}?${p.toString()}`)
    router.refresh()
  }

  const opts = [
    { v: 'ano',     l: String(anoAtual)     },
    { v: '12m',     l: 'Últ. 12m'           },
    { v: 'ano_ant', l: String(anoAtual - 1) },
  ]

  return (
    <div className="flex gap-1">
      {opts.map(o => {
        const ativo = (value || 'ano') === o.v
        return (
          <button
            key={o.v}
            onClick={() => set(o.v)}
            className={`text-[10px] px-2 py-1 rounded-md border transition-colors ${
              ativo
                ? 'bg-amber-700 border-amber-600 text-white'
                : 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {o.l}
          </button>
        )
      })}
    </div>
  )
}
