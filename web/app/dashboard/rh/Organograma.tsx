import type { Setor, Pessoa } from '@/lib/rh/dados'

// Mapa de cor → classes tailwind (precisa ser estático p/ o Tailwind detectar)
const COR: Record<string, { borda: string; topo: string; chip: string; texto: string }> = {
  slate:   { borda: 'border-slate-300',   topo: 'bg-slate-700',   chip: 'bg-slate-100 text-slate-700',   texto: 'text-slate-700' },
  teal:    { borda: 'border-teal-300',    topo: 'bg-teal-600',    chip: 'bg-teal-50 text-teal-700',      texto: 'text-teal-700' },
  amber:   { borda: 'border-amber-300',   topo: 'bg-amber-500',   chip: 'bg-amber-50 text-amber-700',    texto: 'text-amber-700' },
  purple:  { borda: 'border-purple-300',  topo: 'bg-purple-600',  chip: 'bg-purple-50 text-purple-700',  texto: 'text-purple-700' },
  orange:  { borda: 'border-orange-300',  topo: 'bg-orange-500',  chip: 'bg-orange-50 text-orange-700',  texto: 'text-orange-700' },
  sky:     { borda: 'border-sky-300',     topo: 'bg-sky-600',     chip: 'bg-sky-50 text-sky-700',        texto: 'text-sky-700' },
  blue:    { borda: 'border-blue-300',    topo: 'bg-blue-600',    chip: 'bg-blue-50 text-blue-700',      texto: 'text-blue-700' },
  green:   { borda: 'border-green-300',   topo: 'bg-green-600',   chip: 'bg-green-50 text-green-700',     texto: 'text-green-700' },
  emerald: { borda: 'border-emerald-300', topo: 'bg-emerald-600', chip: 'bg-emerald-50 text-emerald-700', texto: 'text-emerald-700' },
}

function iniciais(nome: string): string {
  const partes = nome.replace(/^(Dra?\.|Enfª)\s*/i, '').trim().split(/\s+/)
  const a = partes[0]?.[0] ?? ''
  const b = partes.length > 1 ? partes[partes.length - 1][0] : ''
  return (a + b).toUpperCase()
}

function CardPessoa({ p, cor }: { p: Pessoa; cor: string }) {
  const c = COR[cor] ?? COR.slate
  const ehLider = p.destaque === 'gerente' || p.destaque === 'supervisor'
  return (
    <div className={`flex items-center gap-2.5 rounded-lg border bg-white px-3 py-2 ${ehLider ? c.borda + ' ring-1 ring-inset ring-slate-100' : 'border-slate-200'}`}>
      <div className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold text-white ${ehLider ? c.topo : 'bg-slate-400'}`}>
        {iniciais(p.nome)}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-800 truncate leading-tight">{p.nome}</p>
        <p className="text-[10px] text-slate-500 truncate leading-tight">
          {p.cargo}
          {p.destaque === 'gerente' && <span className={`ml-1 font-medium ${c.texto}`}>· Gestor</span>}
          {p.destaque === 'supervisor' && <span className={`ml-1 font-medium ${c.texto}`}>· Supervisão</span>}
        </p>
      </div>
    </div>
  )
}

function CardSetor({ setor }: { setor: Setor }) {
  const c = COR[setor.cor] ?? COR.slate
  // Líderes primeiro, depois o resto
  const ordenadas = [...setor.pessoas].sort((a, b) => {
    const peso = (p: Pessoa) => (p.destaque === 'gerente' ? 0 : p.destaque === 'supervisor' ? 1 : 2)
    return peso(a) - peso(b)
  })
  return (
    <div className={`rounded-xl border ${c.borda} bg-white overflow-hidden shadow-sm`}>
      <div className={`${c.topo} px-3 py-2 flex items-center justify-between`}>
        <h4 className="text-xs font-bold text-white uppercase tracking-wide truncate">{setor.nome}</h4>
        <span className="text-[10px] font-semibold text-white/90 bg-white/20 rounded-full px-2 py-0.5">{setor.pessoas.length}</span>
      </div>
      <div className="p-2.5 space-y-1.5">
        {ordenadas.map((p, i) => <CardPessoa key={i} p={p} cor={setor.cor} />)}
      </div>
    </div>
  )
}

export default function Organograma({ setores }: { setores: Setor[] }) {
  const grupos: { titulo: string; chave: Setor['grupo'] }[] = [
    { titulo: 'Gestão Geral', chave: 'Gestão' },
    { titulo: 'Áreas Corporativas (Sede)', chave: 'Corporativo' },
    { titulo: 'Medicina', chave: 'Medicina' },
    { titulo: 'Clínicas', chave: 'Clínicas' },
  ]

  return (
    <div className="space-y-8">
      {grupos.map(g => {
        const lista = setores.filter(s => s.grupo === g.chave)
        if (lista.length === 0) return null
        return (
          <div key={g.chave}>
            <div className="flex items-center gap-3 mb-3">
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">{g.titulo}</h3>
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-xs text-slate-400">
                {lista.reduce((s, x) => s + x.pessoas.length, 0)} pessoas
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {lista.map(s => <CardSetor key={s.nome} setor={s} />)}
            </div>
          </div>
        )
      })}
    </div>
  )
}
