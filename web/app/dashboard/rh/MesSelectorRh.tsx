'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'

export default function MesSelectorRh({ meses, atual, ano }: { meses: string[]; atual: number; ano: number }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  function set(i: number) {
    const p = new URLSearchParams(params.toString())
    p.set('mes', String(i))
    router.push(`${pathname}?${p.toString()}`)
    router.refresh()
  }

  return (
    <div className="flex items-center gap-2">
      <label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Mês de referência</label>
      <select
        value={atual}
        onChange={e => set(parseInt(e.target.value))}
        className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
      >
        {meses.map((m, i) => <option key={i} value={i}>{m}/{String(ano).slice(2)}</option>)}
      </select>
    </div>
  )
}
