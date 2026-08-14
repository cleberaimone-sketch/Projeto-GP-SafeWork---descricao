import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { validarToken, carregarDadosEmpresa } from '@/lib/compartilhado/acesso'
import SafeTClient from './SafeTClient'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Página compartilhada por link: fora do buscador, sempre.
export const metadata: Metadata = {
  title: 'SafeT — Demonstrativo',
  robots: { index: false, follow: false, nocache: true },
}

/**
 * A sociedade começou em janeiro de 2024, então o demonstrativo cobre desde lá
 * — é o acumulado da sociedade, não um recorte móvel. O fim é o mês corrente:
 * lançamentos com vencimento futuro existem na base (receita já contratada),
 * mas entrariam no lucro como se já tivessem acontecido.
 */
const INICIO_SOCIEDADE = '2024-01-01'

const MESES_CURTOS = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
]

function periodoSociedade(): { de: string; ate: string; rotulo: string } {
  const hoje = new Date()
  const fim = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1, 0))
  // Montado à mão: o toLocaleDateString em pt-BR devolve "ago. de 2026".
  const rotFim = `${MESES_CURTOS[fim.getUTCMonth()]} ${fim.getUTCFullYear()}`
  return {
    de: INICIO_SOCIEDADE,
    ate: fim.toISOString().slice(0, 10),
    rotulo: `jan 2024 — ${rotFim}`,
  }
}

export default async function PaginaSafeT({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  const acesso = await validarToken(token)
  // Token inválido, revogado ou expirado responde 404 — não confirma se o
  // token existe, o que evitaria varredura.
  if (!acesso) notFound()

  const { de, ate, rotulo } = periodoSociedade()
  const dados = await carregarDadosEmpresa(acesso.empresaId, de, ate)
  if (!dados) notFound()

  return <SafeTClient dados={dados} periodo={rotulo} />
}
