'use client'

import { useState } from 'react'

type Oportunidade = {
  empresa: string
  codigo: string
  tipo: string
  descricao: string
  receita_potencial_ano: number
  prioridade: number
}

type Relatorio = {
  id: string
  data_relatorio: string
  gerado_em: string
  status: string
  resumo: string | null
  conteudo_full: string | null
  oportunidades: Oportunidade[] | null
  metricas: { total_empresas?: number; empresas_com_vidas?: number; total_vidas?: number } | null
  enviado_whatsapp: boolean
}

type Props = {
  relatorios: Relatorio[]
}

const TIPO_LABEL: Record<string, string> = {
  upsell_exames: 'Upsell Exames',
  servico_ausente: 'Serviço Ausente',
  churn_risk: 'Risco Churn',
  ticket_baixo: 'Ticket Baixo',
  novo_servico: 'Novo Serviço',
}

const TIPO_COLOR: Record<string, string> = {
  upsell_exames: 'bg-blue-100 text-blue-700 border-blue-200',
  servico_ausente: 'bg-amber-100 text-amber-700 border-amber-200',
  churn_risk: 'bg-red-100 text-red-700 border-red-200',
  ticket_baixo: 'bg-purple-100 text-purple-700 border-purple-200',
  novo_servico: 'bg-emerald-100 text-emerald-700 border-emerald-200',
}

export default function NinaRelatorios({ relatorios }: Props) {
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [mostrarTexto, setMostrarTexto] = useState<string | null>(null)
  const [listaRelatorios, setListaRelatorios] = useState(relatorios)

  const ultimo = listaRelatorios[0] ?? null

  async function gerarAgora(forcar = false) {
    setGerando(true)
    setErro(null)
    try {
      const res = await fetch('/api/estrategia/relatorio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forcar }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao gerar relatório')
      // Recarrega a página para pegar o novo relatório do servidor
      window.location.reload()
    } catch (e) {
      setErro(String(e))
    } finally {
      setGerando(false)
    }
  }

  const fmt = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

  const hoje = new Date().toISOString().split('T')[0]
  const temHoje = listaRelatorios.some(r => r.data_relatorio === hoje && r.status === 'ok')

  return (
    <div className="space-y-4">
      {/* Header Nina */}
      <div className="bg-gradient-to-r from-purple-900 to-purple-800 rounded-xl p-5 text-white">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-600 border-2 border-purple-400 flex items-center justify-center font-bold text-sm shrink-0">
              Ni
            </div>
            <div>
              <h3 className="font-bold text-base">Nina — Estratégia Comercial</h3>
              <p className="text-purple-200 text-xs">Análise autônoma da carteira · relatório toda segunda-feira 7h</p>
            </div>
          </div>
          <div className="flex gap-2">
            {!temHoje && (
              <button
                onClick={() => gerarAgora(false)}
                disabled={gerando}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {gerando ? 'Gerando...' : 'Gerar agora'}
              </button>
            )}
            {temHoje && (
              <button
                onClick={() => gerarAgora(true)}
                disabled={gerando}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                {gerando ? 'Gerando...' : 'Regenerar'}
              </button>
            )}
          </div>
        </div>
        {erro && (
          <div className="mt-3 bg-red-500/20 border border-red-400/30 rounded-lg px-3 py-2 text-red-200 text-xs">
            {erro}
          </div>
        )}
      </div>

      {/* Sem relatórios */}
      {listaRelatorios.length === 0 && !gerando && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <p className="text-slate-500 text-sm">Nenhum relatório gerado ainda.</p>
          <p className="text-slate-400 text-xs mt-1">O próximo será gerado automaticamente na segunda-feira às 7h.</p>
        </div>
      )}

      {/* Último relatório — oportunidades */}
      {ultimo && ultimo.oportunidades && ultimo.oportunidades.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50">
            <div>
              <h4 className="text-sm font-bold text-slate-800">Top Oportunidades</h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Relatório de {ultimo.data_relatorio.split('-').reverse().join('/')}
                {ultimo.enviado_whatsapp && <span className="ml-2 text-emerald-600">• enviado via WhatsApp</span>}
              </p>
            </div>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
              {fmt(ultimo.oportunidades.reduce((s, o) => s + o.receita_potencial_ano, 0))}/ano
            </span>
          </div>

          {/* Métricas snapshot */}
          {ultimo.metricas && (
            <div className="flex gap-4 px-5 py-3 border-b border-slate-100 bg-purple-50/40">
              <div className="text-center">
                <p className="text-lg font-bold text-slate-800">{ultimo.metricas.empresas_com_vidas ?? '—'}</p>
                <p className="text-[10px] text-slate-500">Clientes ativos</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-slate-800">{(ultimo.metricas.total_vidas ?? 0).toLocaleString('pt-BR')}</p>
                <p className="text-[10px] text-slate-500">Vidas gerenciadas</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-purple-700">{ultimo.oportunidades.length}</p>
                <p className="text-[10px] text-slate-500">Oportunidades</p>
              </div>
            </div>
          )}

          <div className="divide-y divide-slate-50">
            {ultimo.oportunidades.map((op, i) => (
              <div key={i} className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50/50 transition-colors">
                <span className="text-xs font-bold text-slate-400 mt-0.5 w-4 shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-semibold text-slate-800 truncate">{op.empresa}</span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${TIPO_COLOR[op.tipo] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                      {TIPO_LABEL[op.tipo] ?? op.tipo}
                    </span>
                    {op.prioridade === 1 && (
                      <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">P1</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{op.descricao}</p>
                </div>
                <span className="text-sm font-bold text-emerald-700 shrink-0 tabular-nums">{fmt(op.receita_potencial_ano)}</span>
              </div>
            ))}
          </div>

          {/* Ver relatório completo */}
          {ultimo.conteudo_full && (
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50">
              <button
                onClick={() => setMostrarTexto(mostrarTexto ? null : ultimo.conteudo_full)}
                className="text-xs text-purple-700 hover:text-purple-900 font-medium transition-colors"
              >
                {mostrarTexto ? '↑ Ocultar relatório completo' : '↓ Ver relatório completo (markdown)'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Relatório completo em markdown */}
      {mostrarTexto && (
        <div className="bg-slate-900 rounded-xl p-5 overflow-x-auto">
          <pre className="text-xs text-slate-100 whitespace-pre-wrap font-mono leading-relaxed">{mostrarTexto}</pre>
        </div>
      )}

      {/* Histórico de relatórios */}
      {listaRelatorios.length > 1 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Histórico</h4>
          </div>
          <div className="divide-y divide-slate-50">
            {listaRelatorios.slice(1, 6).map(r => (
              <div key={r.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <span className="text-xs font-medium text-slate-700">{r.data_relatorio.split('-').reverse().join('/')}</span>
                  {r.resumo && <p className="text-[11px] text-slate-500 mt-0.5 truncate max-w-xs">{r.resumo}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {r.enviado_whatsapp && <span className="text-[10px] text-emerald-600">WhatsApp ✓</span>}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${r.status === 'ok' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                    {r.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
