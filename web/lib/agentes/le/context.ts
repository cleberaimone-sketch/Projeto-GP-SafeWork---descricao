// ============================================================
// Le — Contexto de RH para o agente
// Fontes: planilha RH (dados estáticos) + Conta Azul (custo real)
// ============================================================

import { createClient } from '@supabase/supabase-js'
import {
  ANO_REFERENCIA, INDICADORES_DP, INDICADORES_DP_2024, TAXA_TURNOVER,
  COLABORADORES_POR_TIPO_2025, TOTAL_PESSOAS, ORGANOGRAMA,
  CUSTO_2025_PLANILHA_TOTAL, CUSTO_2024_PLANILHA_TOTAL,
  CUSTO_2025_PLANILHA_MENSAL, CUSTO_2024_PLANILHA_MENSAL,
  CUSTO_2025_POR_UNIDADE, CUSTO_2025_POR_UNIDADE_TOTAL,
  CUSTO_2025_POR_VINCULO,
  MEDIA_SALARIAL_2025, MEDIA_SALARIAL_2024,
} from '@/lib/rh/dados'
import { carregarCustoPessoal } from '@/lib/rh/custo-pessoal'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

export async function buildLeContext(_pergunta?: string): Promise<string> {
  const sb = getSupabase()
  const [custoAtual, custoAnt] = await Promise.all([
    carregarCustoPessoal(sb, ANO_REFERENCIA),
    carregarCustoPessoal(sb, ANO_REFERENCIA - 1),
  ])

  const ultimo = custoAtual.meses.length - 1
  const mesLabel = custoAtual.meses[ultimo] ?? '—'
  const internoAtual = custoAtual.internoMensal[ultimo] ?? 0
  const externoAtual = custoAtual.externoMensal[ultimo] ?? 0
  const totalAtual = internoAtual + externoAtual
  const internoAntMes = custoAtual.internoMensal[ultimo - 1] ?? internoAtual
  const varInterno = internoAntMes ? Math.round(((internoAtual - internoAntMes) / internoAntMes) * 100) : 0

  const totalAnoInterno = custoAtual.internoMensal.reduce((s, v) => s + v, 0)
  const totalAnoExterno = custoAtual.externoMensal.reduce((s, v) => s + v, 0)
  const totalAnoAntInterno = custoAnt.internoMensal.reduce((s, v) => s + v, 0)
  const variacaoYoY = totalAnoAntInterno ? Math.round(((totalAnoInterno - totalAnoAntInterno) / totalAnoAntInterno) * 100) : 0

  const porGrupo = ORGANOGRAMA.reduce<Record<string, number>>((acc, s) => {
    acc[s.grupo] = (acc[s.grupo] ?? 0) + s.pessoas.length
    return acc
  }, {})

  // CTSE da planilha — último mês fechado vs mesmo mês ano anterior
  const ultimoMesPlanilha = CUSTO_2025_PLANILHA_MENSAL.length - 1
  const ctseMesAtual = CUSTO_2025_PLANILHA_MENSAL[ultimoMesPlanilha] ?? 0
  const ctseMesmoMesAnt = CUSTO_2024_PLANILHA_MENSAL[ultimoMesPlanilha] ?? 0
  const ctseVarYoY = ctseMesmoMesAnt ? Math.round(((ctseMesAtual - ctseMesmoMesAnt) / ctseMesmoMesAnt) * 100) : 0
  const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

  return [
    `=== Dados de RH — GP SafeWork ===`,
    `Data: ${new Date().toLocaleDateString('pt-BR')}`,
    ``,
    `## QUADRO DE PESSOAS (Planilha RH Jan-Nov ${ANO_REFERENCIA})`,
    `Headcount: ${INDICADORES_DP.headcountInicial} → ${INDICADORES_DP.headcountFinal} (saldo ${INDICADORES_DP.headcountFinal - INDICADORES_DP.headcountInicial})`,
    `Organograma físico: ${TOTAL_PESSOAS} pessoas`,
    `Contratações: ${INDICADORES_DP.contratacoes} | Desligamentos: ${INDICADORES_DP.desligamentos}`,
    `Turnover acumulado: ${TAXA_TURNOVER.toFixed(1)}%`,
    ``,
    `Por tipo de contrato:`,
    `  CLT: ${COLABORADORES_POR_TIPO_2025.CLT} | PJ: ${COLABORADORES_POR_TIPO_2025.PJ} | Sócio: ${COLABORADORES_POR_TIPO_2025.Socio} | Outros: ${COLABORADORES_POR_TIPO_2025.Outros}`,
    ``,
    `Por departamento (organograma):`,
    ...Object.entries(porGrupo).sort(([,a],[,b]) => b-a).map(([g, n]) => `  ${g}: ${n} pessoas`),
    ``,
    `## COMPARATIVO 2024 vs 2025`,
    `Headcount: ${INDICADORES_DP_2024.headcountFinal} → ${INDICADORES_DP.headcountFinal} (${INDICADORES_DP.headcountFinal - INDICADORES_DP_2024.headcountFinal >= 0 ? '+' : ''}${INDICADORES_DP.headcountFinal - INDICADORES_DP_2024.headcountFinal})`,
    `Contratações: 2024 ${INDICADORES_DP_2024.contratacoes} | 2025 ${INDICADORES_DP.contratacoes}`,
    `Desligamentos: 2024 ${INDICADORES_DP_2024.desligamentos} | 2025 ${INDICADORES_DP.desligamentos}`,
    `Turnover: 2024 ${INDICADORES_DP_2024.turnoverAcumulado.toFixed(1)}% | 2025 ${TAXA_TURNOVER.toFixed(1)}%`,
    `Média salarial: 2024 ${fmt(MEDIA_SALARIAL_2024)} | 2025 ${fmt(MEDIA_SALARIAL_2025)}`,
    ``,
    `## CTSE — Planilha RH (Custo Total Salários + Encargos)`,
    `2025 (Jan-Nov): ${fmt(CUSTO_2025_PLANILHA_TOTAL)} acumulado`,
    `2024 (12 meses): ${fmt(CUSTO_2024_PLANILHA_TOTAL)} fechado`,
    `Último mês fechado (${MESES[ultimoMesPlanilha]}/2025): ${fmt(ctseMesAtual)} vs ${MESES[ultimoMesPlanilha]}/2024: ${fmt(ctseMesmoMesAnt)} (${ctseVarYoY >= 0 ? '+' : ''}${ctseVarYoY}%)`,
    ``,
    `## CUSTO POR UNIDADE (planilha 2025 anualizada, total ${fmt(CUSTO_2025_POR_UNIDADE_TOTAL)})`,
    ...CUSTO_2025_POR_UNIDADE.map(u => {
      const pct = ((u.total / CUSTO_2025_POR_UNIDADE_TOTAL) * 100).toFixed(1)
      return `  ${u.unidade}: ${fmt(u.total)} (${pct}%)`
    }),
    ``,
    `## CUSTO POR VÍNCULO (planilha 2025 anualizada)`,
    ...CUSTO_2025_POR_VINCULO.map(v => {
      const pct = ((v.total / CUSTO_2025_POR_UNIDADE_TOTAL) * 100).toFixed(1)
      return `  ${v.vinculo}: ${fmt(v.total)} (${pct}%)`
    }),
    ``,
    `## CUSTO REAL (Conta Azul — último mês com lançamentos: ${mesLabel}/${ANO_REFERENCIA})`,
    `Folha interna: ${fmt(internoAtual)} (${varInterno >= 0 ? '+' : ''}${varInterno}% vs mês ant.)`,
    `Prestadores externos (clínicas parceiras, Moha, instrutores): ${fmt(externoAtual)}`,
    `Total do mês: ${fmt(totalAtual)}`,
    `Acumulado ${ANO_REFERENCIA}: interno ${fmt(totalAnoInterno)} | externo ${fmt(totalAnoExterno)}`,
    `Variação YoY interno: ${variacaoYoY >= 0 ? '+' : ''}${variacaoYoY}% vs ${ANO_REFERENCIA - 1}`,
    ``,
    `Composição por tipo (Conta Azul ${ANO_REFERENCIA}):`,
    ...custoAtual.internoPorTipo.map(t => {
      const tot = t.valores.reduce((s, v) => s + v, 0)
      return `  ${t.tipo}: ${fmt(tot)}`
    }),
  ].join('\n')
}
