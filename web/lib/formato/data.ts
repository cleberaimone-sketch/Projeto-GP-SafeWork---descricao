/**
 * Formatação de data e hora no fuso de Brasília.
 *
 * A Vercel roda em UTC. Sem `timeZone` explícito, `toLocaleString('pt-BR')`
 * formata no fuso do SERVIDOR, e o painel mostrava a hora 3h adiantada — data
 * certa, hora errada. Só aparece em produção: no Mac, o fuso local já é o de
 * Brasília e o bug não se manifesta.
 *
 * Todo lugar que exibe hora deve passar por aqui.
 */
const FUSO = 'America/Sao_Paulo'

/** "25/08 14:32" — para carimbo de sincronização e afins. */
export function dataHoraCurta(valor: string | Date | null | undefined): string {
  if (!valor) return '—'
  const d = valor instanceof Date ? valor : new Date(valor)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    timeZone: FUSO,
  })
}

/** "14:32" */
export function horaCurta(valor: string | Date | null | undefined = new Date()): string {
  if (!valor) return '—'
  const d = valor instanceof Date ? valor : new Date(valor)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: FUSO })
}

/** "segunda-feira, 25 de agosto" */
export function dataPorExtenso(valor: string | Date | null | undefined = new Date()): string {
  if (!valor) return '—'
  const d = valor instanceof Date ? valor : new Date(valor)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', timeZone: FUSO,
  })
}

/** "25/08/2026 14:32:07" — para auditoria. */
export function dataHoraCompleta(valor: string | Date | null | undefined): string {
  if (!valor) return '—'
  const d = valor instanceof Date ? valor : new Date(valor)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZone: FUSO,
  })
}

/** Hoje em ISO (YYYY-MM-DD) no fuso de Brasília, não no do servidor. */
export function hojeISOBrasilia(): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: FUSO,
  }).format(new Date())
}

/** "YYYY-MM" do mês corrente em Brasília — perto da virada, o UTC erra o mês. */
export function mesAtualBrasilia(): string {
  return hojeISOBrasilia().slice(0, 7)
}
