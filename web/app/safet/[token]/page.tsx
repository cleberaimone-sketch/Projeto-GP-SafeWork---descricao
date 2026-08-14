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

/** Janela padrão: 12 meses cheios até o fim do mês corrente. */
function periodoPadrao(): { de: string; ate: string; rotulo: string } {
  const hoje = new Date()
  const fim = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1, 0))
  const ini = new Date(Date.UTC(fim.getUTCFullYear(), fim.getUTCMonth() - 11, 1))
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  const rot = (d: Date) =>
    d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' })
      .replace('.', '')
  return { de: fmt(ini), ate: fmt(fim), rotulo: `${rot(ini)} — ${rot(fim)}` }
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

  const { de, ate, rotulo } = periodoPadrao()
  const dados = await carregarDadosEmpresa(acesso.empresaId, de, ate)
  if (!dados) notFound()

  return <SafeTClient dados={dados} periodo={rotulo} />
}
