import { createClient } from '@/lib/supabase/server'
import { createClient as sb } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import {
  getEmpresasClientes,
  getDocumentosVencimentos,
  socConfigurado,
} from '@/lib/soc/client'
import {
  carregarCategoriasExcluidas,
  filtrarParaDRE,
} from '@/lib/financeiro/regras'
import LuizitoChat from './LuizitoChat'
import MemoriasPanel from '../components/MemoriasPanel'

type Empresa = { CODIGO: string; NOME: string; NUMERO_VIDAS?: string }
type DocSOC = {
  CODIGO_CLIENTE?: string; NOME_PRODUTO?: string
  LOCAL_TRABALHO?: string; DATA_VENCIMENTO?: string
}

const DOCS_COMERCIAIS = ['PGR', 'LTCAT', 'PCMSO', 'PPP', 'PCMAT', 'NR-']

type Urgencia = 'vencido' | 'urgente' | 'atencao' | 'ok'
const URGENCIA_ORD: Record<Urgencia, number> = { vencido: 0, urgente: 1, atencao: 2, ok: 3 }

function calcUrgencia(vencSoc: string | undefined, hoje: string, d30: string, d60: string): Urgencia {
  if (!vencSoc || vencSoc === '00/00/0000') return 'ok'
  const [dia, mes, ano] = vencSoc.split('/')
  if (!ano || ano === '0000') return 'ok'
  const iso = `${ano}-${mes?.padStart(2, '0')}-${dia?.padStart(2, '0')}`
  if (iso < hoje) return 'vencido'
  if (iso <= d30) return 'urgente'
  if (iso <= d60) return 'atencao'
  return 'ok'
}

export default async function ComercialPage() {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) redirect('/login')

  const supabase = sb(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const socOk = socConfigurado()

  const hoje = new Date().toISOString().split('T')[0]
  const d30 = new Date(Date.now() + 30 * 86_400_000).toISOString().split('T')[0]
  const d60 = new Date(Date.now() + 60 * 86_400_000).toISOString().split('T')[0]
  const d90Atras = new Date(Date.now() - 90 * 86_400_000).toISOString().split('T')[0]
  const d30Frente = new Date(Date.now() + 30 * 86_400_000).toISOString().split('T')[0]

  // Histórico de conversa
  const { data: convData } = await supabase
    .from('conversas_ia')
    .select('mensagens')
    .eq('agente', 'luizito')
    .eq('canal', 'dashboard')
    .eq('contato_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const initialMessages = ((convData?.mensagens ?? []) as { role: 'user' | 'assistant'; content: string }[]).slice(-30)

  // Receita dos últimos 90 dias
  const [{ data: lancamentosRaw }, excluidas] = await Promise.all([
    supabase
      .from('lancamentos_financeiros')
      .select('tipo, status, valor, categoria, empresa_id, data_vencimento')
      .eq('tipo', 'receita')
      .neq('status', 'cancelado')
      .gte('data_vencimento', d90Atras)
      .lte('data_vencimento', d30Frente),
    carregarCategoriasExcluidas(supabase),
  ])

  const receitas = filtrarParaDRE(lancamentosRaw ?? [], excluidas).filter(l => l.tipo === 'receita')
  const receitaTotal = receitas.reduce((s, l) => s + Number(l.valor ?? 0), 0)
  const receitaVencida = receitas.filter(l => l.status === 'vencido').reduce((s, l) => s + Number(l.valor ?? 0), 0)
  const receitaPendente = receitas.filter(l => l.status === 'pendente').reduce((s, l) => s + Number(l.valor ?? 0), 0)
  const inadPct = receitaTotal > 0 ? (receitaVencida / receitaTotal) * 100 : 0

  // SOC — empresas e oportunidades
  let empresas: Empresa[] = []
  let oportunidades: { cliente: string; documento: string; vencimento: string; urgencia: Urgencia }[] = []

  if (socOk) {
    [empresas] = await Promise.all([
      getEmpresasClientes().catch(() => []) as Promise<Empresa[]>,
    ])
    const docs = await getDocumentosVencimentos().catch(() => []) as DocSOC[]
    const empMap: Record<string, string> = Object.fromEntries(empresas.map(e => [e.CODIGO, e.NOME]))

    oportunidades = docs
      .filter(d => {
        if (!d.NOME_PRODUTO) return false
        const n = d.NOME_PRODUTO.toUpperCase()
        return DOCS_COMERCIAIS.some(kw => n.includes(kw))
      })
      .map(d => ({
        cliente: empMap[d.CODIGO_CLIENTE ?? ''] ?? d.CODIGO_CLIENTE ?? '—',
        documento: d.NOME_PRODUTO ?? '',
        vencimento: d.DATA_VENCIMENTO ?? '',
        urgencia: calcUrgencia(d.DATA_VENCIMENTO, hoje, d30, d60),
      }))
      .filter(o => o.urgencia !== 'ok')
      .sort((a, b) => URGENCIA_ORD[a.urgencia] - URGENCIA_ORD[b.urgencia])
  }

  const empresasComVidas = empresas
    .filter(e => Number(e.NUMERO_VIDAS ?? 0) > 0)
    .sort((a, b) => Number(b.NUMERO_VIDAS ?? 0) - Number(a.NUMERO_VIDAS ?? 0))
  const totalVidas = empresasComVidas.reduce((s, e) => s + Number(e.NUMERO_VIDAS ?? 0), 0)

  const oVencidos = oportunidades.filter(o => o.urgencia === 'vencido').length
  const oUrgentes = oportunidades.filter(o => o.urgencia === 'urgente').length

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

  const BADGE: Record<Urgencia, string> = {
    vencido: 'bg-red-100 text-red-700 border border-red-300',
    urgente: 'bg-amber-100 text-amber-700 border border-amber-300',
    atencao: 'bg-yellow-100 text-yellow-700 border border-yellow-300',
    ok: 'bg-emerald-100 text-emerald-700 border border-emerald-300',
  }
  const LABEL: Record<Urgencia, string> = {
    vencido: 'Vencido', urgente: '<30d', atencao: '<60d', ok: 'Em dia',
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 text-white">
        <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6">
          <a href="/dashboard" className="text-blue-200/80 text-sm hover:text-white inline-block mb-2">← Centro de Comando</a>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-purple-800 text-white flex items-center justify-center text-base font-bold shadow-lg">Lu</div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Luizito — Comercial</h1>
              <p className="text-blue-100/90 text-sm">Carteira de clientes · Oportunidades · Receita recorrente</p>
            </div>
            <div className={`ml-auto flex items-center gap-2 px-3 py-1.5 rounded-full border backdrop-blur-sm ${
              oVencidos > 0
                ? 'bg-red-500/20 border-red-300/40 text-red-100'
                : oUrgentes > 0
                ? 'bg-amber-500/20 border-amber-300/40 text-amber-100'
                : 'bg-emerald-500/20 border-emerald-300/40 text-emerald-100'
            }`}>
              <span className={`w-2 h-2 rounded-full ${oVencidos > 0 ? 'bg-red-400 animate-pulse' : oUrgentes > 0 ? 'bg-amber-400' : 'bg-emerald-400'}`} />
              <span className="text-xs font-medium">
                {oVencidos > 0 ? `${oVencidos} renovações vencidas`
                  : oUrgentes > 0 ? `${oUrgentes} renovações urgentes`
                  : 'Carteira estável'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-6 md:px-8 py-6 md:py-8">

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
            <p className="text-2xl font-bold text-slate-900">{socOk ? empresasComVidas.length : '—'}</p>
            <p className="text-xs text-slate-500 mt-1">Clientes ativos</p>
            {socOk && totalVidas > 0 && <p className="text-[10px] text-slate-400 mt-0.5">{totalVidas.toLocaleString('pt-BR')} vidas</p>}
          </div>
          <div className={`rounded-xl p-4 border shadow-sm ${oVencidos > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
            <p className={`text-2xl font-bold ${oVencidos > 0 ? 'text-red-700' : 'text-slate-900'}`}>
              {socOk ? oVencidos : '—'}
            </p>
            <p className="text-xs text-slate-500 mt-1">Renovações vencidas</p>
            {oVencidos > 0 && <p className="text-[10px] text-red-600 mt-0.5">contato imediato</p>}
          </div>
          <div className={`rounded-xl p-4 border shadow-sm ${oUrgentes > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
            <p className={`text-2xl font-bold ${oUrgentes > 0 ? 'text-amber-700' : 'text-slate-900'}`}>
              {socOk ? oUrgentes : '—'}
            </p>
            <p className="text-xs text-slate-500 mt-1">Renovações &lt;30 dias</p>
          </div>
          <div className={`rounded-xl p-4 border shadow-sm ${inadPct > 10 ? 'bg-red-50 border-red-200' : inadPct > 5 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
            <p className={`text-2xl font-bold ${inadPct > 10 ? 'text-red-700' : inadPct > 5 ? 'text-amber-700' : 'text-slate-900'}`}>
              {fmt(receitaVencida)}
            </p>
            <p className="text-xs text-slate-500 mt-1">Inadimplência</p>
            <p className={`text-[10px] mt-0.5 ${inadPct > 5 ? 'text-amber-700' : 'text-slate-400'}`}>{inadPct.toFixed(1)}% da receita</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
            <p className="text-2xl font-bold text-emerald-700">{fmt(receitaPendente)}</p>
            <p className="text-xs text-slate-500 mt-1">A receber (30d)</p>
          </div>
        </div>

        {/* Layout principal */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Chat — 2/3 */}
          <div className="md:col-span-2 space-y-6">
            <div>
              <h2 className="text-sm font-semibold text-slate-500 mb-3">Chat com Luizito</h2>
              <LuizitoChat initialMessages={initialMessages} />
            </div>

            {/* Oportunidades de renovação */}
            {oportunidades.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-slate-50">
                  <h3 className="text-sm font-bold text-slate-800">Oportunidades de Renovação</h3>
                  <span className="text-[11px] text-slate-500">{oportunidades.length} documentos</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left px-4 py-2.5 text-slate-500 font-semibold uppercase tracking-wider">Cliente</th>
                        <th className="text-left px-4 py-2.5 text-slate-500 font-semibold uppercase tracking-wider">Documento</th>
                        <th className="text-left px-4 py-2.5 text-slate-500 font-semibold uppercase tracking-wider">Vencimento</th>
                        <th className="text-left px-4 py-2.5 text-slate-500 font-semibold uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {oportunidades.slice(0, 15).map((o, i) => (
                        <tr key={i} className={`hover:bg-slate-50 transition-colors ${o.urgencia === 'vencido' ? 'bg-red-50/30' : ''}`}>
                          <td className="px-4 py-2.5 font-medium text-slate-800 truncate max-w-[180px]" title={o.cliente}>{o.cliente}</td>
                          <td className="px-4 py-2.5 text-slate-600 truncate max-w-[160px]" title={o.documento}>{o.documento}</td>
                          <td className="px-4 py-2.5 tabular-nums text-slate-700">{o.vencimento || '—'}</td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded ${BADGE[o.urgencia]}`}>
                              {LABEL[o.urgencia]}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {oportunidades.length > 15 && (
                  <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50">
                    <p className="text-[11px] text-slate-500">+ {oportunidades.length - 15} outras oportunidades</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sidebar — 1/3 */}
          <div className="space-y-4">
            {/* Top clientes por vidas */}
            {empresasComVidas.length > 0 && (
              <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                  Top Clientes — por Vidas
                </h3>
                <div className="space-y-2.5">
                  {empresasComVidas.slice(0, 10).map((e, i) => {
                    const vidas = Number(e.NUMERO_VIDAS ?? 0)
                    const pct = totalVidas > 0 ? (vidas / totalVidas) * 100 : 0
                    return (
                      <div key={e.CODIGO}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-slate-700 truncate flex-1 mr-2 flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-400 font-mono w-4 shrink-0">{i + 1}</span>
                            {e.NOME}
                          </span>
                          <span className="text-xs font-semibold text-slate-800 shrink-0 tabular-nums">
                            {vidas.toLocaleString('pt-BR')}
                          </span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-purple-600 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="mt-3 pt-3 border-t border-slate-200 flex justify-between text-[11px]">
                  <span className="text-slate-500">Total de vidas:</span>
                  <span className="font-bold text-slate-800">{totalVidas.toLocaleString('pt-BR')}</span>
                </div>
              </div>
            )}

            {!socOk && (
              <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
                <p className="text-xs text-amber-800 font-medium mb-1">SOC não configurado</p>
                <p className="text-[11px] text-amber-700">Configure <code className="font-mono text-[10px] bg-amber-100 px-0.5 rounded">SOC_MASK_EMPRESAS</code> para ver a carteira de clientes.</p>
              </div>
            )}

            {/* Memórias */}
            <MemoriasPanel agente="luizito" />

            {/* Equipe comercial */}
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Equipe Comercial</h3>
              <div className="space-y-2">
                {[
                  { nome: 'Luis Rabelo', papel: 'Gerente Comercial', fone: '45 99977-9174' },
                  { nome: 'Nathielli Vargas', papel: 'Supervisora', fone: '' },
                  { nome: 'Lucas Botelho', papel: 'Consultor', fone: '' },
                  { nome: 'Douglas Andrade', papel: 'Consultor', fone: '' },
                  { nome: 'Luccas Facundo', papel: 'Marketing', fone: '' },
                ].map(p => (
                  <div key={p.nome} className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-slate-800">{p.nome}</p>
                      <p className="text-[10px] text-slate-500">{p.papel}</p>
                    </div>
                    {p.fone && <span className="text-[10px] text-slate-400 font-mono">{p.fone}</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Integração pendente */}
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Integrações Pendentes</h3>
              <div className="space-y-2">
                {[
                  { nome: 'RD Station CRM', status: 'planejado', desc: 'Pipeline + funil de vendas' },
                  { nome: 'D4sign', status: 'planejado', desc: 'Contratos + assinatura digital' },
                ].map(i => (
                  <div key={i.nome} className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-medium text-slate-700">{i.nome}</p>
                      <p className="text-[10px] text-slate-500">{i.desc}</p>
                    </div>
                    <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200 shrink-0">
                      {i.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
