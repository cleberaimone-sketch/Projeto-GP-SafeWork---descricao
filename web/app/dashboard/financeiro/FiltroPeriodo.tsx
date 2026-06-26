'use client'

// Filtro de período reutilizável para as sub-abas (atrasados, empréstimos, inadimplentes…).
// Abre no ano atual por padrão, mas permite ver outros anos, mês atual/passado, período custom ou tudo.
// Controla os searchParams `de`/`ate` e força refresh do server component.

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback } from 'react'

function toISO(d: Date) { return d.toISOString().split('T')[0] }

export default function FiltroPeriodo({ de, ate, anoAtual }: { de: string; ate: string; anoAtual: number }) {
  const router   = useRouter()
  const pathname = usePathname()
  const params   = useSearchParams()

  const set = useCallback((novoDe: string, novoAte: string) => {
    const p = new URLSearchParams(params.toString())
    if (novoDe) p.set('de', novoDe); else p.delete('de')
    if (novoAte) p.set('ate', novoAte); else p.delete('ate')
    router.push(`${pathname}?${p.toString()}`)
    router.refresh()
  }, [params, pathname, router])

  const ini = (a: number) => `${a}-01-01`
  const fim = (a: number) => `${a}-12-31`
  const mesAtualDe  = `${anoAtual}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`
  const mesAtualAte = toISO(new Date(anoAtual, new Date().getMonth() + 1, 0))
  const mesPassDe   = toISO(new Date(anoAtual, new Date().getMonth() - 1, 1))
  const mesPassAte  = toISO(new Date(anoAtual, new Date().getMonth(), 0))

  const atalhos = [
    { l: String(anoAtual),     de: ini(anoAtual),     ate: fim(anoAtual)     },
    { l: String(anoAtual - 1), de: ini(anoAtual - 1), ate: fim(anoAtual - 1) },
    { l: String(anoAtual - 2), de: ini(anoAtual - 2), ate: fim(anoAtual - 2) },
    { l: 'Mês atual',          de: mesAtualDe,        ate: mesAtualAte       },
    { l: 'Mês passado',        de: mesPassDe,         ate: mesPassAte        },
    { l: 'Tudo',               de: '2000-01-01',      ate: '2100-12-31'      },
  ]

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-1">Período</span>
        {atalhos.map(a => {
          const ativo = de === a.de && ate === a.ate
          return (
            <button
              key={a.l}
              onClick={() => set(a.de, a.ate)}
              className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                ativo
                  ? 'bg-blue-700 border-blue-600 text-white'
                  : 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
              }`}
            >
              {a.l}
            </button>
          )
        })}
        <div className="flex items-center gap-1.5 ml-auto">
          <input type="date" value={de} onChange={e => set(e.target.value, ate)}
            className="bg-slate-100 border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          <span className="text-slate-400 text-xs">→</span>
          <input type="date" value={ate} onChange={e => set(de, e.target.value)}
            className="bg-slate-100 border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>
      </div>
    </div>
  )
}
