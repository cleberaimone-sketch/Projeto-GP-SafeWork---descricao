---
name: dashboard-pattern
description: Padrão para criar novo dashboard ou subseção no app — estrutura server page + client component, paleta visual (slate/dark mode), uso de filtros via URL, queries paralelas, gráficos com Recharts. Use quando precisar criar uma nova tela em /dashboard/* ou refinar uma existente.
---

# Skill: Dashboard Pattern

## Quando usar
- Criar nova rota `/dashboard/<area>/<feature>`
- Refatorar dashboard existente
- Padronizar visual entre telas

## Estrutura mínima

```
app/dashboard/<area>/<feature>/
├── page.tsx                ← server component (queries + dados pré-calculados)
└── <Feature>Client.tsx     ← client component ('use client', interatividade)
```

## Template — `page.tsx` (server)

```typescript
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import FeatureClient from './FeatureClient'
import type { TipoX, TipoY } from './FeatureClient'

interface SP { empresa?: string; ano?: string }

export default async function FeaturePage({ searchParams }: { searchParams: Promise<SP> }) {
  const filters = await searchParams
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) redirect('/login')

  const sb = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Queries paralelas com Promise.all
  const [
    { data: empresas },
    { data: dados },
  ] = await Promise.all([
    sb.from('empresas').select('id, nome_curto').order('nome_curto'),
    sb.from('lancamentos_financeiros').select('*').limit(10000),
  ])

  // Cálculos no server (não enviar dado bruto para client)
  const processado: TipoX[] = (dados ?? []).map(d => ({ ... }))

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6 md:p-8">
      <Header titulo="Nome da Feature" caminho={["Financeiro", "Feature"]} />
      <Suspense>
        <FeatureClient
          dados={processado}
          empresas={empresas ?? []}
          empresaSelecionada={filters.empresa ?? ''}
        />
      </Suspense>
    </main>
  )
}
```

## Template — `FeatureClient.tsx` (cliente)

```typescript
'use client'

import { useState, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export interface TipoX { /* ... */ }

interface Props {
  dados: TipoX[]
  empresas: { id: string; nome_curto: string }[]
  empresaSelecionada: string
}

export default function FeatureClient({ dados, empresas, empresaSelecionada }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [aba, setAba] = useState<'a' | 'b'>('a')

  function setEmpresa(eId: string) {
    const p = new URLSearchParams(searchParams.toString())
    if (eId) p.set('empresa', eId); else p.delete('empresa')
    router.push(`/dashboard/area/feature?${p.toString()}`)
  }

  return (
    <>
      {/* KPIs no topo (cards) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KpiCard ... />
      </div>

      {/* Abas */}
      <div className="flex items-center gap-2 mb-4 border-b border-slate-800">...</div>

      {/* Conteúdo */}
      {aba === 'a' && <AbaA dados={dados} />}
      {aba === 'b' && <AbaB dados={dados} />}
    </>
  )
}
```

## Paleta visual (slate dark mode)

| Elemento | Classe Tailwind |
|---|---|
| **Background page** | `bg-slate-950` |
| **Texto principal** | `text-white` |
| **Cards** | `bg-slate-900 rounded-xl border border-slate-800` |
| **Card destaque sucesso** | `bg-gradient-to-br from-emerald-950/30 to-slate-900 border-emerald-800/40` |
| **Card destaque alerta** | `bg-gradient-to-br from-red-950/30 to-slate-900 border-red-800/40` |
| **Card destaque atenção** | `bg-amber-950/30 border-amber-900/40` |
| **Subtítulo seção** | `text-xs font-semibold text-slate-400 uppercase tracking-wider` |
| **Texto secundário** | `text-slate-400` ou `text-slate-500` |
| **Texto muito sutil** | `text-slate-600` (legendas, hints) |
| **Valor monetário positivo** | `text-emerald-400 tabular-nums` |
| **Valor monetário negativo** | `text-red-400 tabular-nums` |
| **Valor neutro/destaque** | `text-amber-400 tabular-nums` |
| **Botão primário** | `bg-emerald-700 hover:bg-emerald-600 text-white` |
| **Botão secundário** | `bg-slate-800 hover:bg-slate-700 text-slate-300` |
| **Tabela header** | `bg-slate-950/50` |
| **Tabela linha hover** | `hover:bg-slate-800/30` |
| **Borda divisória** | `border-slate-800/60` |

## Cores por contexto

- **Receita / positivo / saudável**: emerald (`#10b981`, `text-emerald-400`)
- **Despesa / negativo / crítico**: red (`#ef4444`, `text-red-400`)
- **Atenção / pendente**: amber (`#f59e0b`, `text-amber-400`)
- **Empréstimo / financeiro**: violet (`#a78bfa`, `text-violet-400`)
- **Operacional / neutro**: slate

## Convenções

### Formatação de números
```typescript
function fmt(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}
function fmtSign(v: number): string {
  if (!isFinite(v)) return '—'
  return (v >= 0 ? '+' : '') + v.toFixed(1) + '%'
}
```

### Tabular nums
Sempre `tabular-nums` em valores monetários para alinhamento.

### Tooltips de Recharts
```typescript
<Tooltip
  contentStyle={{
    backgroundColor: '#111827',
    border: '1px solid #374151',
    fontSize: 11,
    borderRadius: 8
  }}
  labelStyle={{ color: '#d1d5db' }}
  formatter={(value, name) => [value as number, String(name)]}
/>
```

### Filtros por URL (preserva estado ao navegar)
```typescript
function setFiltro(chave: string, valor: string) {
  const p = new URLSearchParams(searchParams.toString())
  if (valor) p.set(chave, valor); else p.delete(chave)
  router.push(`${pathname}?${p.toString()}`)
}
```

### Header do dashboard (padrão)
```tsx
<div className="mb-6">
  <div className="flex items-center gap-3">
    <a href="/dashboard/financeiro" className="text-slate-500 text-sm hover:text-slate-300">← Financeiro</a>
    <span className="text-slate-700">·</span>
    <a href="/dashboard" className="text-slate-500 text-sm hover:text-slate-300">Centro de Comando</a>
  </div>
  <h1 className="text-2xl font-bold mt-2">Nome da Feature</h1>
  <p className="text-slate-400 text-sm">Subtítulo descritivo</p>
</div>
```

## Rotas existentes (referências)

| Rota | Padrão usado | O que aprender |
|---|---|---|
| `/financeiro/fluxo-caixa` | Server + Client com 4 abas | Tabelas com `tabular-nums`, ordenação |
| `/financeiro/atrasados` | Toggle + buckets clicáveis | UX de filtros e Pareto |
| `/financeiro/emprestimos` | 4 abas com gráficos próprios | Composição visual sem Recharts |
| `/financeiro/orcamento` | Tabela editável com API POST | Edição em massa + state local |
| `/financeiro/sync` | Status + ações por linha | Refresh ao terminar mutation |

## ❌ NÃO fazer
- `bg-gray-*` (deprecated, padronizar em `slate-*`)
- Cores agressivas tipo `bg-blue-500` sem contexto
- Tabelas sem `tabular-nums` em valores monetários
- Inputs sem `placeholder`
- Esquecer de filtrar transferências internas em queries financeiras
