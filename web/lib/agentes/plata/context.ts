import { createClient } from '@supabase/supabase-js'
import { compararReceita } from '@/lib/financeiro/extraordinarios'
import { calcularDSO, calcularDPO } from '@/lib/financeiro/prazos'
import { lerPaginado } from '@/lib/supabase/paginar'

function getDB() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function hoje() { return new Date().toISOString().split('T')[0] }
function diasAtras(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0]
}
function diasAFrente(n: number) {
  const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().split('T')[0]
}
function mesKey(dateStr: string) { return dateStr.slice(0, 7) }
function nomeMes(key: string) {
  const [ano, mes] = key.split('-')
  return new Date(Number(ano), Number(mes) - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
}
function fmt(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
}

export async function buildPlataContext(foco?: string): Promise<string> {
  const db = getDB()
  const hojeISO = hoje()
  const ctx: Record<string, unknown> = { data_referencia: hojeISO }

  // ── Lançamentos PAGINADOS — a janela 120d+90d passa de 1000 linhas e o
  // PostgREST corta silenciosamente; sem paginar, a Plata analisa dado truncado.
  type Lanc = { id: string; empresa_id: string | null; tipo: string; categoria: string | null; valor: number | null; data_vencimento: string; data_pagamento: string | null; status: string; descricao: string | null }
  // O laço próprio paginava, mas descartava o `error`: falha na página 3
  // devolvia data nulo, o `break` disparava, e as 2.000 linhas já lidas
  // voltavam como se fossem o universo. Oito agregados saem daqui —
  // inadimplência, a receber, a pagar, DRE comparativo, runway, top despesas,
  // alertas — e nenhum deles teria como saber que veio truncado. lerPaginado
  // lança em erro de página, que é o comportamento certo aqui: melhor a Plata
  // não responder do que responder com um terço do caixa.
  function carregarLancamentos(): Promise<Lanc[]> {
    return lerPaginado<Lanc>((de, ate) => db.from('lancamentos_financeiros')
      .select('id, empresa_id, tipo, categoria, valor, data_vencimento, data_pagamento, status, descricao')
      .neq('status', 'cancelado')
      .gte('data_vencimento', diasAtras(120))
      .lte('data_vencimento', diasAFrente(90))
      .order('id')
      .range(de, ate))
  }

  // ── Queries paralelas ────────────────────────────────────────────────────
  const [
    { data: saldosRaw, error: erroSaldos },
    lancamentos,
    { data: empresas },
    { data: syncLog },
    { data: snapshotsDiarios },
    { data: saudeUnidades, error: erroSaude },
    comparacaoReceita,
  ] = await Promise.all([
    // v_saldos_ativos: só contas ativas, sem Conta Modelo, sem datas futuras —
    // a MESMA fonte de saldo do dashboard (saldos_bancarios cru tem lixo).
    // Sem .limit: são dezenas de contas. Mas o erro não pode virar zero —
    // ver o tratamento de `saldosRaw` logo abaixo.
    db.from('v_saldos_ativos').select('nome_exibicao, saldo'),
    carregarLancamentos(),
    db.from('empresas').select('id, nome_curto').order('nome_curto'),
    db.from('sync_log').select('finalizado_em, status').eq('fonte', 'conta_azul').order('finalizado_em', { ascending: false, nullsFirst: false }).limit(1),
    db.from('snapshots_financeiros_diarios')
      .select('data, receita_30d, despesa_30d, margem_30d, saldo_bancario, atrasados_pagar, atrasados_receber, analise')
      .is('empresa_id', null)
      .order('data', { ascending: false })
      .limit(8),
    // Panorama por unidade: realizado, orçado, ano anterior e os sinais de
    // integridade do dado, prontos. Sem isso a Plata remontava esse cruzamento
    // a cada pergunta, a partir de lançamento cru.
    db.rpc('fn_saude_unidades'),  // 11 unidades — não paginado de propósito
    // As duas leituras da variação de receita. Sem isto a Plata responderia
    // "a receita caiu 8,7%" enquanto o Acompanhamento mostra que a operação
    // caiu 4,4% e que a diferença é um contrato de treinamento de 2025 — o
    // painel e a agente dando números diferentes para a mesma pergunta.
    compararReceita(db, {
      ano: Number(hojeISO.slice(0, 4)),
      anoBase: Number(hojeISO.slice(0, 4)) - 1,
      ateMes: Math.max(1, Number(hojeISO.slice(5, 7)) - 1),
    }).catch(e => { console.error('[plata] comparação de receita:', e); return null }),
  ])

  // ── Mapa empresas ─────────────────────────────────────────────────────────
  const empMap: Record<string, string> = {}
  for (const e of empresas ?? []) empMap[e.id] = e.nome_curto

  // ── Saldos bancários (v_saldos_ativos: contas ativas, sem lixo) ──────────
  // Falha na view não pode virar caixa zero. Virava: `?? []` dava total 0, o
  // runway concluía "menos de 1 mês de caixa" e a Plata abria com alerta
  // vermelho fabricado a partir de uma consulta quebrada.
  const saldos = (saldosRaw ?? []).map(s => ({ conta: String(s.nome_exibicao ?? '—'), saldo: Number(s.saldo ?? 0) }))
  const totalCaixa = saldos.reduce((s, b) => s + b.saldo, 0)
  const caixaConhecido = !erroSaldos
  ctx.caixa = caixaConhecido ? {
    total: fmt(totalCaixa),
    total_num: totalCaixa,
    contas: saldos.map(s => ({ conta: s.conta, saldo: fmt(s.saldo) })),
    nota: 'Saldo real das contas ATIVAS (v_saldos_ativos) — não inclui A/R. Itaú/Cora só entram via Pluggy.',
  } : {
    indisponivel: true,
    motivo: erroSaldos.message,
    instrucao: 'NÃO diga que o caixa está zerado nem calcule runway: o saldo não foi lido. Diga que não sabe.',
  }

  // ── Lançamentos particionados ─────────────────────────────────────────────
  const all = lancamentos ?? []
  const receitas  = all.filter(l => l.tipo === 'receita')
  const despesas  = all.filter(l => l.tipo === 'despesa')

  // Por status
  const recVencidas  = receitas.filter(l => l.status === 'vencido')
  const recPendentes = receitas.filter(l => l.status === 'pendente')
  const recPagas     = receitas.filter(l => l.status === 'pago' || l.status === 'parcial')
  const despVencidas = despesas.filter(l => l.status === 'vencido')
  const despPendentes = despesas.filter(l => l.status === 'pendente')

  const totalRecVencidas  = recVencidas.reduce((s, l) => s + (l.valor ?? 0), 0)
  const totalDespVencidas = despVencidas.reduce((s, l) => s + (l.valor ?? 0), 0)

  // ── Inadimplência (receitas vencidas) ────────────────────────────────────
  // Por faixa de atraso
  const inad7  = recVencidas.filter(l => {
    const dias = Math.floor((new Date(hojeISO).getTime() - new Date(l.data_vencimento + 'T00:00:00').getTime()) / 86400000)
    return dias <= 30
  })
  const inad31 = recVencidas.filter(l => {
    const dias = Math.floor((new Date(hojeISO).getTime() - new Date(l.data_vencimento + 'T00:00:00').getTime()) / 86400000)
    return dias > 30 && dias <= 90
  })
  const inad90 = recVencidas.filter(l => {
    const dias = Math.floor((new Date(hojeISO).getTime() - new Date(l.data_vencimento + 'T00:00:00').getTime()) / 86400000)
    return dias > 90
  })

  // Inadimplência por empresa
  const inadEmpMap: Record<string, { empresa: string; total: number; qtd: number; mais_antigo: string }> = {}
  for (const l of recVencidas) {
    const emp = l.empresa_id ? (empMap[l.empresa_id] ?? l.empresa_id) : 'Sem empresa'
    if (!inadEmpMap[emp]) inadEmpMap[emp] = { empresa: emp, total: 0, qtd: 0, mais_antigo: l.data_vencimento }
    inadEmpMap[emp].total += l.valor ?? 0
    inadEmpMap[emp].qtd++
    if (l.data_vencimento < inadEmpMap[emp].mais_antigo) inadEmpMap[emp].mais_antigo = l.data_vencimento
  }

  const totalReceitas90d = receitas.reduce((s, l) => s + (l.valor ?? 0), 0)
  const inadimplenciaPct = totalReceitas90d > 0 ? (totalRecVencidas / totalReceitas90d) * 100 : 0

  ctx.inadimplencia = {
    total: fmt(totalRecVencidas),
    total_num: totalRecVencidas,
    percentual_receita: `${inadimplenciaPct.toFixed(1)}%`,
    benchmark: '< 5% saudável · 5–10% atenção · > 10% crítico',
    por_faixa: {
      '1_a_30d':  { total: fmt(inad7.reduce((s, l) => s + (l.valor ?? 0), 0)), qtd: inad7.length },
      '31_a_90d': { total: fmt(inad31.reduce((s, l) => s + (l.valor ?? 0), 0)), qtd: inad31.length },
      'acima_90d': { total: fmt(inad90.reduce((s, l) => s + (l.valor ?? 0), 0)), qtd: inad90.length },
    },
    por_empresa: Object.values(inadEmpMap)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
      .map(e => ({ ...e, total: fmt(e.total) })),
    top_titulos: recVencidas
      .sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0))
      .slice(0, 10)
      .map(l => ({
        empresa: l.empresa_id ? (empMap[l.empresa_id] ?? '—') : '—',
        descricao: l.descricao,
        valor: fmt(l.valor ?? 0),
        vencimento: l.data_vencimento,
        dias_atraso: Math.floor((new Date(hojeISO).getTime() - new Date(l.data_vencimento + 'T00:00:00').getTime()) / 86400000),
      })),
  }

  // ── A receber (pendentes) ─────────────────────────────────────────────────
  const aRec7d  = recPendentes.filter(l => l.data_vencimento >= hojeISO && l.data_vencimento <= diasAFrente(7))
  const aRec30d = recPendentes.filter(l => l.data_vencimento >= hojeISO && l.data_vencimento <= diasAFrente(30))
  ctx.a_receber = {
    proximos_7d:  { total: fmt(aRec7d.reduce((s, l) => s + (l.valor ?? 0), 0)), qtd: aRec7d.length },
    proximos_30d: { total: fmt(aRec30d.reduce((s, l) => s + (l.valor ?? 0), 0)), qtd: aRec30d.length },
    lista_30d: aRec30d.sort((a, b) => (a.data_vencimento ?? '').localeCompare(b.data_vencimento ?? '')).slice(0, 15).map(l => ({
      empresa: l.empresa_id ? (empMap[l.empresa_id] ?? '—') : '—',
      descricao: l.descricao,
      valor: fmt(l.valor ?? 0),
      vencimento: l.data_vencimento,
    })),
  }

  // ── A pagar (pendentes + vencidas) ───────────────────────────────────────
  const aPag7d  = despPendentes.filter(l => l.data_vencimento >= hojeISO && l.data_vencimento <= diasAFrente(7))
  const aPag30d = despPendentes.filter(l => l.data_vencimento >= hojeISO && l.data_vencimento <= diasAFrente(30))
  ctx.a_pagar = {
    vencidas:     { total: fmt(totalDespVencidas), qtd: despVencidas.length },
    proximos_7d:  { total: fmt(aPag7d.reduce((s, l) => s + (l.valor ?? 0), 0)), qtd: aPag7d.length },
    proximos_30d: { total: fmt(aPag30d.reduce((s, l) => s + (l.valor ?? 0), 0)), qtd: aPag30d.length },
    lista_vencidas: despVencidas.slice(0, 10).map(l => ({
      descricao: l.descricao, categoria: l.categoria, valor: fmt(l.valor ?? 0), vencimento: l.data_vencimento,
    })),
    lista_7d: aPag7d.sort((a, b) => (a.data_vencimento ?? '').localeCompare(b.data_vencimento ?? '')).slice(0, 15).map(l => ({
      descricao: l.descricao, categoria: l.categoria, valor: fmt(l.valor ?? 0), vencimento: l.data_vencimento,
    })),
    prioridade: 'Encargos > Impostos > Fornecedores estratégicos > Demais',
  }

  // ── DRE comparativo por mês (últimos 3 meses + atual) ────────────────────
  const dreMap: Record<string, { rec: number; desp: number; recPago: number; despPago: number }> = {}
  for (const l of all) {
    const key = mesKey(l.data_vencimento ?? hojeISO)
    if (!dreMap[key]) dreMap[key] = { rec: 0, desp: 0, recPago: 0, despPago: 0 }
    const isPago = l.status === 'pago' || l.status === 'parcial'
    if (l.tipo === 'receita') {
      dreMap[key].rec += l.valor ?? 0
      if (isPago) dreMap[key].recPago += l.valor ?? 0
    } else {
      dreMap[key].desp += l.valor ?? 0
      if (isPago) dreMap[key].despPago += l.valor ?? 0
    }
  }

  const mesesOrdenados = Object.entries(dreMap).sort(([a], [b]) => a.localeCompare(b)).slice(-4)
  ctx.dre_comparativo = mesesOrdenados.map(([key, v]) => ({
    mes: nomeMes(key),
    receita_competencia: fmt(v.rec),
    despesa_competencia: fmt(v.desp),
    resultado_competencia: fmt(v.rec - v.desp),
    receita_caixa: fmt(v.recPago),
    despesa_caixa: fmt(v.despPago),
    resultado_caixa: fmt(v.recPago - v.despPago),
    margem_pct: v.rec > 0 ? `${(((v.rec - v.desp) / v.rec) * 100).toFixed(1)}%` : '—',
  }))

  // ── Runway ────────────────────────────────────────────────────────────────
  const last3 = mesesOrdenados.slice(-3)
  const avgBurn = last3.length > 0
    ? last3.reduce((s, [, v]) => s + v.despPago, 0) / last3.length
    : 0
  // Runway só existe se o caixa foi lido. Com a view fora, o cálculo dava
  // 0 / burn = 0 mês e o alerta saía "CRÍTICO" — a pior forma de errar,
  // porque soa urgente e é inventado.
  const runway = caixaConhecido && avgBurn > 0 ? (totalCaixa / avgBurn).toFixed(1) : null
  ctx.runway = caixaConhecido ? {
    meses: runway ? `${runway} meses` : 'indisponível',
    caixa_atual: fmt(totalCaixa),
    burn_mensal_medio: fmt(avgBurn),
    alerta: runway && Number(runway) < 1 ? 'CRÍTICO: menos de 1 mês de caixa'
      : runway && Number(runway) < 2 ? 'ATENÇÃO: menos de 2 meses de caixa'
      : 'ok',
  } : {
    indisponivel: true,
    motivo: 'saldo bancário não foi lido — runway depende dele',
    burn_mensal_medio: fmt(avgBurn),
    instrucao: 'NÃO afirme que o caixa é crítico: não há saldo para dividir.',
  }

  // ── Prazos de recebimento e pagamento ────────────────────────────────────
  // A regra mora em lib/financeiro/prazos.ts: o DSO NÃO é calculável, porque o
  // sync grava data_pagamento = data de competência da venda. A versão antiga
  // filtrava os negativos (81% da amostra) e devolvia "indisponível" sem dizer
  // por quê — a Plata não tinha como saber que era limitação do dado, e
  // poderia atribuir a outra coisa.
  const prazoReceber = calcularDSO(recPagas)
  const prazoPagar   = calcularDPO(despesas.filter(l => l.status === 'pago' || l.status === 'parcial'))

  ctx.prazo_de_recebimento = 'indisponivel' in prazoReceber
    ? { indisponivel: true, motivo: prazoReceber.motivo }
    : { dias: prazoReceber.dias, amostra: prazoReceber.amostra,
        benchmark: '< 15d ok · 15-30d atenção · >30d problema de cobrança' }

  ctx.prazo_de_pagamento = 'indisponivel' in prazoPagar
    ? { indisponivel: true, motivo: prazoPagar.motivo }
    : { dias: prazoPagar.dias, amostra: prazoPagar.amostra,
        o_que_e: 'dias entre vencimento e pagamento da despesa; negativo = paga antes de vencer' }

  if (!('indisponivel' in prazoPagar)) {
    ctx.observacao_sobre_prazos = [
      prazoPagar.dias < 0
        ? `O grupo paga em media ${Math.abs(prazoPagar.dias)} dia(s) ANTES do vencimento. Antecipar pagamento sem desconto negociado e financiar fornecedor de graca.`
        : `O grupo paga em media ${prazoPagar.dias} dia(s) depois do vencimento.`,
      'O prazo de RECEBIMENTO nao esta disponivel, entao o ciclo de caixa (recebimento menos pagamento) nao pode ser fechado. Nao estime esse ciclo: diga que falta a data real de credito.',
    ]
  }

  // ── Top categorias de despesa ─────────────────────────────────────────────
  const catDespMap: Record<string, number> = {}
  for (const l of despesas) catDespMap[l.categoria ?? 'Sem categoria'] = (catDespMap[l.categoria ?? 'Sem categoria'] ?? 0) + (l.valor ?? 0)
  ctx.top_despesas_por_categoria = Object.entries(catDespMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([cat, val]) => ({ categoria: cat, total: fmt(val) }))

  // ── Alertas priorizados ───────────────────────────────────────────────────
  const alertas: string[] = []
  if (despVencidas.length > 0) alertas.push(`🔴 ${despVencidas.length} despesa(s) vencida(s) — ${fmt(totalDespVencidas)} em atraso`)
  if (totalRecVencidas > 0 && inadimplenciaPct > 10) alertas.push(`🔴 Inadimplência crítica: ${inadimplenciaPct.toFixed(1)}% da receita (${fmt(totalRecVencidas)})`)
  else if (totalRecVencidas > 0) alertas.push(`⚠️ Inadimplência: ${fmt(totalRecVencidas)} vencida (${inadimplenciaPct.toFixed(1)}%)`)
  if (runway && Number(runway) < 2) alertas.push(`🔴 Runway baixo: apenas ${runway} meses de caixa`)
  if (aPag7d.length > 0) alertas.push(`⚠️ ${aPag7d.length} pagamento(s) nos próximos 7 dias — ${fmt(aPag7d.reduce((s, l) => s + (l.valor ?? 0), 0))}`)
  // "Nenhum alerta" é uma afirmação, e só cabe quando tudo foi lido. Sem o
  // saldo, o silêncio sobre caixa não é ausência de problema.
  if (!caixaConhecido) alertas.push('⚠️ Saldo bancário não foi lido nesta consulta — nada aqui cobre caixa')
  ctx.alertas_prioritarios = alertas.length > 0 ? alertas : ['✅ Nenhum alerta crítico identificado']

  // ── Evolução diária (snapshots — a linha da saúde financeira) ─────────────
  if (snapshotsDiarios && snapshotsDiarios.length > 0) {
    ctx.evolucao_diaria = {
      nota: 'Snapshots diários em janela móvel de 30d — comparáveis dia a dia. Mais recente primeiro.',
      serie: snapshotsDiarios.map(s => ({
        data: s.data,
        receita_30d: fmt(Number(s.receita_30d ?? 0)),
        despesa_30d: fmt(Number(s.despesa_30d ?? 0)),
        margem_30d: `${Number(s.margem_30d ?? 0).toFixed(1)}%`,
        saldo: fmt(Number(s.saldo_bancario ?? 0)),
        atrasados_pagar: fmt(Number(s.atrasados_pagar ?? 0)),
        atrasados_receber: fmt(Number(s.atrasados_receber ?? 0)),
      })),
      analise_de_hoje: snapshotsDiarios[0]?.analise ?? null,
    }
  }

  // ── Metadata ──────────────────────────────────────────────────────────────
  // ── Panorama por unidade, com os sinais de integridade junto ─────────────
  //
  // A carga tributária vai lado a lado com a do ano anterior de propósito: em
  // 2026 ela caiu de ~12% para ~1% porque os tributos não foram lançados, não
  // porque o grupo passou a pagar menos imposto. Sem esse par à vista, a Plata
  // olha despesa artificialmente baixa e recomenda o contrário do certo —
  // "margem melhorou, pode investir" quando ainda falta imposto entrar.
  type LinhaSaude = {
    unidade: string; receita: number; despesa: number; margem_pct: number
    receita_orcada: number | null; despesa_orcada: number | null
    desvio_receita_pct: number | null; desvio_despesa_pct: number | null
    var_receita_pct: number | null
    carga_tributaria_pct: number | null; carga_anterior_pct: number | null
    despesas_paradas: number; valor_despesas_paradas: number
  }
  // RPC fora do ar dava lista vazia, e o bloco `como_ler_a_saude_por_unidade`
  // logo abaixo continuava no prompt mandando a Plata ler dados que não existem.
  if (erroSaude) {
    ctx.saude_por_unidade = {
      indisponivel: true, motivo: erroSaude.message,
      instrucao: 'NÃO conclua nada por unidade — inclusive não diga que estão todas saudáveis.',
    }
  }
  const unidades = (erroSaude ? [] : (saudeUnidades ?? [])) as LinhaSaude[]
  if (!erroSaude) ctx.saude_por_unidade = unidades.map(u => ({
    unidade: u.unidade,
    receita: u.receita,
    despesa: u.despesa,
    margem_pct: u.margem_pct,
    orcado: {
      receita: u.receita_orcada,
      despesa: u.despesa_orcada,
      desvio_receita_pct: u.desvio_receita_pct,
      desvio_despesa_pct: u.desvio_despesa_pct,
      origem: 'simulado a partir de 2025, ainda não revisado pelo Cleber — trate como referência, não como meta acordada',
    },
    vs_ano_anterior_receita_pct: u.var_receita_pct,
    integridade: {
      carga_tributaria_pct: u.carga_tributaria_pct,
      carga_tributaria_ano_anterior_pct: u.carga_anterior_pct,
      despesas_recorrentes_paradas: u.despesas_paradas,
      valor_despesas_paradas: u.valor_despesas_paradas,
    },
  }))

  if (!erroSaude) ctx.como_ler_a_saude_por_unidade = [
    'ANTES de recomendar qualquer coisa sobre despesa ou margem, compare carga_tributaria_pct com carga_tributaria_ano_anterior_pct.',
    'Se a carga atual for muito menor, a despesa está SUBESTIMADA porque falta imposto lançado — a margem alta é artefato, não desempenho.',
    'Some despesas_recorrentes_paradas à mesma leitura: são contas que a unidade tinha todo mês e parou de lançar.',
    'Margem de unidade com receita quase nula (matriz, SW Meio Ambiente) não significa nada: são centros de custo, não operações.',
    'O orçado é simulado do ano passado. Desvio contra ele indica direção, não cobrança de meta.',
  ]

  // ── Receita: o que entrou × o que é recorrente ───────────────────────────
  // A comparação pode ter falhado; ali `?? null` fazia o campo simplesmente
  // não existir, e a Plata não distinguia "não houve variação apurável" de
  // "a consulta quebrou".
  if (!comparacaoReceita) {
    ctx.variacao_receita = {
      indisponivel: true,
      motivo: 'comparação de receita falhou — ver log [plata]',
      instrucao: 'NÃO afirme que a receita está estável: a comparação não foi feita.',
    }
  } else {
    const c = comparacaoReceita
    ctx.variacao_receita = {
      periodo: `jan a mes ${c.ateMes} de ${c.ano} contra o mesmo periodo de ${c.anoBase}`,
      tudo_que_entrou_pct: c.bruta.variacao === null ? null : Number(c.bruta.variacao.toFixed(1)),
      so_o_recorrente_pct: c.recorrente.variacao === null ? null : Number(c.recorrente.variacao.toFixed(1)),
      inverte_o_sinal: c.inverteSinal,
      // Recorte com o total ao lado. Sem teto, um ano ruim mandaria centenas
      // de lançamentos para dentro do prompt; sem o total, a Plata diria
      // "há 25 atípicos" quando há 200.
      lancamentos_atipicos_total: c.extraordinariosAtual.length + c.extraordinariosBase.length,
      lancamentos_atipicos_maiores: [...c.extraordinariosAtual, ...c.extraordinariosBase]
        .sort((a, b) => b.valor - a.valor)
        .slice(0, 25)
        .map(e => ({
          empresa: e.nome_empresa, data: e.data_vencimento,
          descricao: e.descricao, valor: fmt(e.valor),
          vezes_a_mediana_da_categoria: e.vezes_a_mediana,
        })),
    }
    ctx.como_ler_a_variacao_de_receita = [
      'Existem DUAS respostas para "a receita subiu ou caiu", e as duas são verdadeiras.',
      'tudo_que_entrou_pct responde quanto dinheiro entrou — inclui contrato atípico, venda única, evento.',
      'so_o_recorrente_pct responde se a OPERAÇÃO cresce: tira de AMBOS os anos os lançamentos muito fora do padrão da própria empresa.',
      'Se inverte_o_sinal for true, os dois números apontam para lados opostos. Nunca cite só um: diga os dois e mostre qual lançamento explica a diferença.',
      'Tirar o atípico de um ano só e comparar com o outro cheio é o erro mais fácil aqui — inventa crescimento ou queda que não existe.',
      'lancamentos_atipicos_maiores é recorte dos 25 maiores. A contagem cheia está em lancamentos_atipicos_total.',
    ]
  }

  ctx.ultimo_sync = syncLog?.[0]?.finalizado_em ?? null
  ctx.nota_estrutura = 'GP SafeWork é holding. Receitas = repasses/serviços das subsidiárias. Despesas = custos de matriz.'
  if (foco) ctx.foco_pergunta = foco

  return JSON.stringify(ctx, null, 2)
}
