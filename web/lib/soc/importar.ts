// Importação do SOC para o espelho local (soc_exames, soc_licencas).
//
// Por que espelhar: até aqui medicina lia o SOC ao vivo a cada renderização e
// não guardava nada. Sem histórico não há comparação com o ano anterior, nem
// tendência, nem auditoria — o ferramental que tornou o financeiro útil.
//
// A máscara de exames (191865) aceita no máximo 30 dias por chamada, então uma
// carga de 2025 até hoje é uma varredura de ~21 janelas, não uma consulta só.

import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getExamesPeriodo, getLicencasPeriodo } from './client'

/** Janela máxima aceita pela máscara de exames do SOC. */
export const DIAS_POR_JANELA = 30

/** O SOC fala DD/MM/YYYY; o Postgres quer YYYY-MM-DD. Vazio vira null. */
export function dataBrParaISO(v?: string): string | null {
  if (!v) return null
  const m = v.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (!m) return null
  const [, d, mes, a] = m
  return `${a}-${mes}-${d}`
}

export const ddmm = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`

/**
 * Chave natural do registro.
 *
 * O ExportaDados não devolve identificador próprio, então ela é composta dos
 * campos que juntos identificam o evento. Sem isso, reimportar uma janela —
 * coisa que acontece toda vez que uma carga é retomada — duplicaria tudo.
 */
export function chaveNatural(partes: (string | null | undefined)[]): string {
  return createHash('sha256').update(partes.map(p => (p ?? '').trim()).join('|')).digest('hex').slice(0, 32)
}

/** Gera as janelas de no máximo 30 dias que cobrem o período pedido. */
export function janelas(de: Date, ate: Date, dias = DIAS_POR_JANELA): { de: Date; ate: Date }[] {
  const saida: { de: Date; ate: Date }[] = []
  const cursor = new Date(de)
  while (cursor <= ate) {
    const fim = new Date(cursor)
    fim.setDate(fim.getDate() + dias - 1)
    saida.push({ de: new Date(cursor), ate: fim > ate ? new Date(ate) : fim })
    cursor.setDate(cursor.getDate() + dias)
  }
  return saida
}

type Linha = Record<string, string | undefined>

function mapearExame(r: Linha) {
  const fonte_id = chaveNatural([
    r.EMPRESA, r.MATRICULA || r.CPF, r.NOMEFUNCIONARIO,
    r.DATAFICHA, r.CODEXAME, r.TIPOFICHA,
  ])
  return {
    fonte_id,
    empresa_soc: r.EMPRESA ?? null,
    nome_empresa: r.NOMEEMPRESA ?? null,
    unidade: r.UNIDADE ?? null,
    funcionario_nome: r.NOMEFUNCIONARIO ?? null,
    matricula: r.MATRICULA ?? null,
    cpf: r.CPF ?? null,
    setor: r.SETOR ?? null,
    cargo: r.CARGO ?? null,
    data_ficha: dataBrParaISO(r.DATAFICHA),
    tipo_ficha: r.TIPOFICHA ?? null,
    data_exames: dataBrParaISO(r.DATAEXAMES),
    cod_exame: r.CODEXAME ?? null,
    nome_exame: r.NOMEEXAME ?? null,
    exame_alterado: r.EXAMEALTERADO ?? null,
    sai_aso: r.SAIASO ?? null,
    parecer_aso: r.PARECERASO ?? null,
    bruto: r,
  }
}

function mapearLicenca(r: Linha) {
  const fonte_id = chaveNatural([
    r.NOMEEMPRESA, r.NOMEFUNCIONARIO, r.DATA_INICIO_LICENCA,
    r.CODCID, r.TIPO_LICENCA, r.AFASTAMENTO_EM_HORAS,
  ])
  return {
    fonte_id,
    nome_empresa: r.NOMEEMPRESA ?? null,
    funcionario_nome: r.NOMEFUNCIONARIO ?? null,
    cod_cid: r.CODCID ?? null,
    tipo_licenca: r.TIPO_LICENCA ?? null,
    data_inicio: dataBrParaISO(r.DATA_INICIO_LICENCA),
    afastamento_horas: r.AFASTAMENTO_EM_HORAS ?? null,
    acidente_trajeto: r.ACIDENTE_TRAJETO ?? null,
    bruto: r,
  }
}

export type ResultadoJanela = {
  recurso: 'exames' | 'licencas'
  de: string
  ate: string
  registros: number
  status: 'ok' | 'erro'
  detalhe?: string
}

/**
 * Importa UMA janela de um recurso. Cada janela é registrada em
 * soc_importacoes, o que permite retomar uma carga interrompida sem refazer o
 * que já veio — e uma carga de 21 janelas com pausa entre elas é interrompida
 * com facilidade.
 */
export async function importarJanela(
  supabase: SupabaseClient,
  recurso: 'exames' | 'licencas',
  de: Date,
  ate: Date,
): Promise<ResultadoJanela> {
  const deISO = de.toISOString().slice(0, 10)
  const ateISO = ate.toISOString().slice(0, 10)
  const base = { recurso, data_inicio: deISO, data_fim: ateISO }

  try {
    const linhas = (recurso === 'exames'
      ? await getExamesPeriodo(ddmm(de), ddmm(ate))
      : await getLicencasPeriodo(ddmm(de), ddmm(ate))) as Linha[]

    const mapeadas = recurso === 'exames' ? linhas.map(mapearExame) : linhas.map(mapearLicenca)

    // O SOC repete o mesmo evento em janelas que se tocam e, às vezes, dentro
    // da própria resposta. Deduplica antes de gravar: o upsert falharia ao ver
    // a mesma chave duas vezes no mesmo lote.
    const porChave = new Map<string, (typeof mapeadas)[number]>()
    for (const m of mapeadas) porChave.set(m.fonte_id, m)
    const registros = [...porChave.values()]

    if (registros.length) {
      const tabela = recurso === 'exames' ? 'soc_exames' : 'soc_licencas'
      // Lotes de 500 para não estourar o limite de payload do PostgREST.
      for (let i = 0; i < registros.length; i += 500) {
        const { error } = await supabase.from(tabela)
          .upsert(registros.slice(i, i + 500), { onConflict: 'fonte_id' })
        if (error) throw new Error(error.message)
      }
    }

    await supabase.from('soc_importacoes').upsert({
      ...base, registros: registros.length, status: 'ok',
      detalhe: null, finalizado_em: new Date().toISOString(),
    }, { onConflict: 'recurso,data_inicio,data_fim' })

    return { recurso, de: deISO, ate: ateISO, registros: registros.length, status: 'ok' }
  } catch (e) {
    const detalhe = String(e).slice(0, 300)
    await supabase.from('soc_importacoes').upsert({
      ...base, registros: 0, status: 'erro', detalhe,
      finalizado_em: new Date().toISOString(),
    }, { onConflict: 'recurso,data_inicio,data_fim' })
    return { recurso, de: deISO, ate: ateISO, registros: 0, status: 'erro', detalhe }
  }
}
