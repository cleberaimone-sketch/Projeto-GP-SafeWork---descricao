import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import {
  getDocumentosVencimentos,
  getEmpresasClientes,
  socConfigurado,
} from '@/lib/soc/client'

type DocVencimento = {
  CODIGO_CLIENTE?: string
  NOME_PRODUTO?: string
  LOCAL_TRABALHO?: string
  DATA_VENCIMENTO?: string
}

type Empresa = { CODIGO: string; NOME: string }

// NRs monitoradas — nome canônico e padrões de detecção
const NRS_MONITORADAS = [
  { nr: 'NR-06', desc: 'EPI', padroes: ['NR-06', 'NR 06', 'NR6'] },
  { nr: 'NR-07', desc: 'PCMSO', padroes: ['NR-07', 'NR 07', 'NR7', 'PCMSO'] },
  { nr: 'NR-09', desc: 'PGR / PPRA', padroes: ['NR-09', 'NR 09', 'NR9', 'PPRA'] },
  { nr: 'NR-10', desc: 'Segurança em Eletricidade', padroes: ['NR-10', 'NR 10', 'NR10'] },
  { nr: 'NR-11', desc: 'Transporte e Movimentação', padroes: ['NR-11', 'NR 11', 'NR11'] },
  { nr: 'NR-12', desc: 'Segurança em Máquinas', padroes: ['NR-12', 'NR 12', 'NR12'] },
  { nr: 'NR-15', desc: 'Insalubridade', padroes: ['NR-15', 'NR 15', 'NR15'] },
  { nr: 'NR-16', desc: 'Periculosidade', padroes: ['NR-16', 'NR 16', 'NR16'] },
  { nr: 'NR-17', desc: 'Ergonomia', padroes: ['NR-17', 'NR 17', 'NR17'] },
  { nr: 'NR-18', desc: 'Construção Civil', padroes: ['NR-18', 'NR 18', 'NR18'] },
  { nr: 'NR-20', desc: 'Líquidos Inflamáveis', padroes: ['NR-20', 'NR 20', 'NR20'] },
  { nr: 'NR-23', desc: 'Proteção contra Incêndio', padroes: ['NR-23', 'NR 23', 'NR23'] },
  { nr: 'NR-33', desc: 'Espaço Confinado', padroes: ['NR-33', 'NR 33', 'NR33'] },
  { nr: 'NR-35', desc: 'Trabalho em Altura', padroes: ['NR-35', 'NR 35', 'NR35'] },
]

type Status = 'vencido' | 'urgente' | 'atencao' | 'ok' | 'sem_data'

function detectarNR(nomeProduto: string): string | null {
  const nome = nomeProduto.toUpperCase()
  for (const { nr, padroes } of NRS_MONITORADAS) {
    if (padroes.some(p => nome.includes(p.toUpperCase()))) return nr
  }
  // Tenta detectar padrão genérico NR-XX
  const match = nome.match(/NR[- ]?(\d{2})/)
  if (match) return `NR-${match[1]}`
  return null
}

function calcularStatus(dataVencSoc: string | undefined, hoje: string, d30: string, d60: string): Status {
  if (!dataVencSoc || dataVencSoc === '00/00/0000') return 'sem_data'
  const [dia, mes, ano] = dataVencSoc.split('/')
  if (!ano || ano === '0000') return 'sem_data'
  const iso = `${ano}-${mes?.padStart(2, '0')}-${dia?.padStart(2, '0')}`
  if (iso < hoje) return 'vencido'
  if (iso <= d30) return 'urgente'
  if (iso <= d60) return 'atencao'
  return 'ok'
}

const STATUS_LABEL: Record<Status, string> = {
  vencido: 'VENCIDO',
  urgente: '<30 dias',
  atencao: '<60 dias',
  ok: 'Em dia',
  sem_data: 'Sem data',
}

const STATUS_COR: Record<Status, string> = {
  vencido: 'bg-red-50 border-red-200 text-red-800',
  urgente: 'bg-amber-50 border-amber-200 text-amber-800',
  atencao: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  ok: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  sem_data: 'bg-slate-100 border-slate-200 text-slate-500',
}

const STATUS_BADGE: Record<Status, string> = {
  vencido: 'bg-red-100 text-red-700 border border-red-300',
  urgente: 'bg-amber-100 text-amber-700 border border-amber-300',
  atencao: 'bg-yellow-100 text-yellow-700 border border-yellow-300',
  ok: 'bg-emerald-100 text-emerald-700 border border-emerald-300',
  sem_data: 'bg-slate-100 text-slate-500 border border-slate-200',
}

const STATUS_ORD: Record<Status, number> = { vencido: 0, urgente: 1, atencao: 2, ok: 3, sem_data: 4 }

export default async function TreinamentosNRPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const socOk = socConfigurado()
  const hoje = new Date().toISOString().split('T')[0]
  const d30 = new Date(Date.now() + 30 * 86_400_000).toISOString().split('T')[0]
  const d60 = new Date(Date.now() + 60 * 86_400_000).toISOString().split('T')[0]

  let documentos: DocVencimento[] = []
  let empresas: Empresa[] = []

  if (socOk) {
    ;[documentos, empresas] = await Promise.all([
      getDocumentosVencimentos().then(r => r as DocVencimento[]).catch(() => []),
      getEmpresasClientes().catch(() => []) as Promise<Empresa[]>,
    ])
  }

  // Filtra e classifica apenas treinamentos NR
  type TreinamentoRow = {
    nr: string
    produto: string
    local: string
    cliente: string
    vencimento: string
    status: Status
  }

  const empresaMap: Record<string, string> = {}
  for (const e of empresas) empresaMap[e.CODIGO] = e.NOME

  const treinamentos: TreinamentoRow[] = documentos
    .filter(d => {
      if (!d.NOME_PRODUTO) return false
      return detectarNR(d.NOME_PRODUTO) !== null
    })
    .map(d => ({
      nr: detectarNR(d.NOME_PRODUTO!)!,
      produto: d.NOME_PRODUTO ?? '',
      local: d.LOCAL_TRABALHO ?? '',
      cliente: empresaMap[d.CODIGO_CLIENTE ?? ''] ?? d.CODIGO_CLIENTE ?? '',
      vencimento: d.DATA_VENCIMENTO ?? '',
      status: calcularStatus(d.DATA_VENCIMENTO, hoje, d30, d60),
    }))
    .sort((a, b) => STATUS_ORD[a.status] - STATUS_ORD[b.status] || a.nr.localeCompare(b.nr))

  // Agrupa por NR para o painel de resumo
  const porNR: Record<string, { total: number; vencido: number; urgente: number; atencao: number }> = {}
  for (const t of treinamentos) {
    if (!porNR[t.nr]) porNR[t.nr] = { total: 0, vencido: 0, urgente: 0, atencao: 0 }
    porNR[t.nr].total++
    if (t.status === 'vencido') porNR[t.nr].vencido++
    if (t.status === 'urgente') porNR[t.nr].urgente++
    if (t.status === 'atencao') porNR[t.nr].atencao++
  }

  const nrsOrdenadas = Object.entries(porNR).sort((a, b) => {
    const urgA = a[1].vencido * 100 + a[1].urgente * 10 + a[1].atencao
    const urgB = b[1].vencido * 100 + b[1].urgente * 10 + b[1].atencao
    return urgB - urgA
  })

  const totalVencidos = treinamentos.filter(t => t.status === 'vencido').length
  const totalUrgentes = treinamentos.filter(t => t.status === 'urgente').length
  const totalAtencao = treinamentos.filter(t => t.status === 'atencao').length

  // Descricao canônica por NR
  const nrDesc: Record<string, string> = Object.fromEntries(
    NRS_MONITORADAS.map(n => [n.nr, n.desc])
  )

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white">
        <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6">
          <a href="/dashboard/engenharia" className="text-blue-200/80 text-sm hover:text-white inline-block mb-2">← Engenharia</a>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 text-white flex items-center justify-center text-xl font-bold shadow-lg">NR</div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Treinamentos NR — Vencimentos</h1>
              <p className="text-blue-100/90 text-sm">Conformidade por Norma Regulamentadora · por empresa cliente</p>
            </div>
            <div className={`ml-auto flex items-center gap-2 px-3 py-1.5 rounded-full border backdrop-blur-sm ${
              socOk
                ? (totalVencidos > 0 ? 'bg-red-500/20 border-red-300/40 text-red-100' : 'bg-emerald-500/20 border-emerald-300/40 text-emerald-100')
                : 'bg-amber-500/20 border-amber-300/40 text-amber-100'
            }`}>
              <span className={`w-2 h-2 rounded-full ${socOk ? (totalVencidos > 0 ? 'bg-red-400 animate-pulse' : 'bg-emerald-400') : 'bg-amber-400'}`} />
              <span className="text-xs font-medium">
                {socOk ? (totalVencidos > 0 ? `${totalVencidos} vencidos` : 'Em conformidade') : 'SOC não configurado'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6 md:py-8">

        {!socOk && (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <p className="text-sm text-amber-800">Configure <code className="font-mono text-xs bg-amber-100 px-1 rounded">SOC_MASK_DOCUMENTOS</code> no Vercel para ver os treinamentos NR dos seus clientes.</p>
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
            <p className="text-2xl font-bold text-slate-900">{socOk ? treinamentos.length : '—'}</p>
            <p className="text-xs text-slate-500 mt-1">Treinamentos rastreados</p>
            {socOk && <p className="text-[10px] text-slate-400 mt-0.5">{nrsOrdenadas.length} NRs diferentes</p>}
          </div>
          <div className={`rounded-xl p-4 border shadow-sm ${totalVencidos > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
            <p className={`text-2xl font-bold ${totalVencidos > 0 ? 'text-red-700' : 'text-slate-900'}`}>
              {socOk ? totalVencidos : '—'}
            </p>
            <p className="text-xs text-slate-500 mt-1">Vencidos</p>
            {totalVencidos > 0 && <p className="text-[10px] text-red-600 mt-0.5">ação imediata</p>}
          </div>
          <div className={`rounded-xl p-4 border shadow-sm ${totalUrgentes > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
            <p className={`text-2xl font-bold ${totalUrgentes > 0 ? 'text-amber-700' : 'text-slate-900'}`}>
              {socOk ? totalUrgentes : '—'}
            </p>
            <p className="text-xs text-slate-500 mt-1">Vencendo em 30d</p>
          </div>
          <div className={`rounded-xl p-4 border shadow-sm ${totalAtencao > 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-white border-slate-200'}`}>
            <p className={`text-2xl font-bold ${totalAtencao > 0 ? 'text-yellow-700' : 'text-slate-900'}`}>
              {socOk ? totalAtencao : '—'}
            </p>
            <p className="text-xs text-slate-500 mt-1">Vencendo em 60d</p>
          </div>
        </div>

        {socOk && treinamentos.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Painel por NR — resumo */}
            <div className="lg:col-span-1 space-y-3">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Por Norma Regulamentadora</h2>
              <div className="space-y-2">
                {nrsOrdenadas.map(([nr, stats]) => {
                  const statusNR: Status =
                    stats.vencido > 0 ? 'vencido'
                    : stats.urgente > 0 ? 'urgente'
                    : stats.atencao > 0 ? 'atencao'
                    : 'ok'
                  return (
                    <div key={nr} className={`rounded-xl p-3 border ${STATUS_COR[statusNR]}`}>
                      <div className="flex items-center justify-between mb-1">
                        <div>
                          <span className="text-sm font-bold">{nr}</span>
                          {nrDesc[nr] && (
                            <span className="text-xs text-slate-500 ml-1.5">{nrDesc[nr]}</span>
                          )}
                        </div>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${STATUS_BADGE[statusNR]}`}>
                          {STATUS_LABEL[statusNR]}
                        </span>
                      </div>
                      <div className="flex gap-3 text-[11px]">
                        <span className="text-slate-500">{stats.total} registros</span>
                        {stats.vencido > 0 && <span className="text-red-700 font-semibold">{stats.vencido} vencidos</span>}
                        {stats.urgente > 0 && <span className="text-amber-700">{stats.urgente} &lt;30d</span>}
                        {stats.atencao > 0 && <span className="text-yellow-700">{stats.atencao} &lt;60d</span>}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Referência de periodicidade */}
              <div className="bg-white rounded-xl p-4 border border-slate-200 mt-4">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Periodicidade (eSocial)</h3>
                <div className="space-y-2 text-[11px]">
                  {[
                    { nr: 'NR-10', ciclo: '2 anos', esocial: 'S-2245' },
                    { nr: 'NR-35', ciclo: '2 anos', esocial: 'S-2245' },
                    { nr: 'NR-33', ciclo: '1 ano', esocial: 'S-2245' },
                    { nr: 'NR-12', ciclo: '1 ano', esocial: 'S-2245' },
                    { nr: 'NR-07/PCMSO', ciclo: '1 ano', esocial: 'S-2220' },
                    { nr: 'NR-09/PGR', ciclo: '1 ano', esocial: 'S-2240' },
                  ].map(r => (
                    <div key={r.nr} className="flex items-center justify-between">
                      <span className="font-semibold text-slate-700">{r.nr}</span>
                      <span className="text-slate-500">{r.ciclo}</span>
                      <span className="font-mono text-blue-700">{r.esocial}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Tabela detalhada */}
            <div className="lg:col-span-2">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                Detalhe — {treinamentos.length} registros
              </h2>
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="text-left px-4 py-2.5 text-slate-500 font-semibold uppercase tracking-wider">NR</th>
                        <th className="text-left px-4 py-2.5 text-slate-500 font-semibold uppercase tracking-wider">Produto / Treinamento</th>
                        <th className="text-left px-4 py-2.5 text-slate-500 font-semibold uppercase tracking-wider hidden md:table-cell">Local / Empresa</th>
                        <th className="text-left px-4 py-2.5 text-slate-500 font-semibold uppercase tracking-wider">Vencimento</th>
                        <th className="text-left px-4 py-2.5 text-slate-500 font-semibold uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {treinamentos.map((t, i) => (
                        <tr key={i} className={`hover:bg-slate-50 transition-colors ${t.status === 'vencido' ? 'bg-red-50/40' : ''}`}>
                          <td className="px-4 py-2.5">
                            <span className="font-mono font-bold text-slate-800">{t.nr}</span>
                          </td>
                          <td className="px-4 py-2.5">
                            <p className="text-slate-800 font-medium truncate max-w-[200px]" title={t.produto}>{t.produto}</p>
                          </td>
                          <td className="px-4 py-2.5 hidden md:table-cell">
                            <p className="text-slate-500 truncate max-w-[160px]" title={t.local || t.cliente}>
                              {t.local || t.cliente || '—'}
                            </p>
                          </td>
                          <td className="px-4 py-2.5 tabular-nums text-slate-700">{t.vencimento || '—'}</td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded ${STATUS_BADGE[t.status]}`}>
                              {STATUS_LABEL[t.status]}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {socOk && treinamentos.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <p className="text-slate-500 text-sm">Nenhum treinamento NR encontrado nos documentos SOC.</p>
            <p className="text-slate-400 text-xs mt-1">Verifique se a máscara <code className="font-mono">SOC_MASK_DOCUMENTOS</code> retorna dados de treinamentos.</p>
          </div>
        )}
      </div>
    </main>
  )
}
