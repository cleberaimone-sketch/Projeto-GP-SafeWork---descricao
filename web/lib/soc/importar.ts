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
import { getExamesPeriodo, getLicencasPeriodo, getExamesDetalhados, getFuncionarios } from './client'

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
 * O ExportaDados não devolve identificador próprio, e a máscara de exames não
 * identifica o trabalhador — não há CPF, matrícula nem nome. Então a chave é o
 * hash do REGISTRO INTEIRO, com os campos ordenados para não depender da ordem
 * em que o SOC os serializa.
 *
 * A primeira versão usava empresa + data da ficha + código do exame, e isso
 * perdeu 41% da carga de teste: 8.382 registros viraram 4.933, porque dois
 * trabalhadores da mesma empresa fazendo o mesmo exame no mesmo dia colidiam e
 * um sobrescrevia o outro. Silenciosamente.
 */
export function chaveNatural(partes: (string | null | undefined)[]): string {
  return createHash('sha256').update(partes.map(p => (p ?? '').trim()).join('|')).digest('hex').slice(0, 32)
}

/** Hash estável de uma linha inteira, independente da ordem dos campos. */
export function hashLinha(r: Record<string, string | undefined>): string {
  const ordenado = Object.keys(r).sort().map(k => `${k}=${(r[k] ?? '').trim()}`).join('|')
  return createHash('sha256').update(ordenado).digest('hex').slice(0, 32)
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

// Campos reais da máscara 191865, confirmados contra a resposta do SOC em
// 08/09/2026: dados do exame e do prestador. O trabalhador não vem aqui.
function mapearExame(r: Linha, fonte_id: string) {
  return {
    fonte_id,
    empresa_soc: r.EMPRESA ?? null,
    nome_empresa: r.NOMEEMPRESA ?? null,
    data_ficha: dataBrParaISO(r.DATAFICHA),
    data_exame: dataBrParaISO(r.DATAEXAME),
    data_resultado: dataBrParaISO(r.DATARESULTADO),
    tipo_exame: r.TIPOEXAME ?? null,
    cod_exame: r.CODEXAME ?? null,
    nome_exame: r.NOMEEXAME ?? null,
    exame_alterado: r.EXAMEALTERADO ?? null,
    prestador_codigo: r.CODIGOPRESTADOR ?? null,
    prestador_nome: r.NOMEPRESTADOR ?? null,
    prestador_cidade: r.CIDADEPRESTADOR ?? null,
    prestador_uf: r.UF ?? null,
    medico_nome: r.NOMEMEDICOEXAMINADOR ?? null,
    medico_cpf: r.CPFMEDICOEXAMINADOR ?? null,
    bruto: r,
  }
}

function mapearLicenca(r: Linha, fonte_id: string) {
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

/**
 * Exames de UMA empresa cliente, com identificação do trabalhador (máscara
 * 193540). É a fonte de ASO vencido e ASO pendente — a 191865 não identifica a
 * pessoa.
 *
 * `empresaTrabalho` é obrigatório e tem de ser o código de uma empresa cliente;
 * a conta SafeWork devolve vazio. Por isso a carga varre empresa a empresa.
 */
export async function importarTrabalhadoresDaEmpresa(
  supabase: SupabaseClient,
  empresaSoc: string,
  diasAtras: number,
): Promise<{ empresa: string; registros: number; status: 'ok' | 'erro'; detalhe?: string }> {
  try {
    const linhas = await getExamesDetalhados(diasAtras, empresaSoc) as Linha[]

    const ocorrencias = new Map<string, number>()
    const registros = linhas.map(r => {
      const base = hashLinha(r)
      const n = (ocorrencias.get(base) ?? 0) + 1
      ocorrencias.set(base, n)
      return {
        fonte_id: `${base}#${n}`,
        empresa_soc: r.EMPRESA ?? empresaSoc,
        cod_funcionario: r.CODFUNCIONARIO ?? null,
        funcionario_nome: r.NOMEFUNCIONARIO ?? null,
        matricula: r.MATRICULA ?? null,
        cpf: r.CPF ?? null,
        unidade: r.UNIDADE ?? null,
        setor: r.SETOR ?? null,
        cargo: r.CARGO ?? null,
        data_ficha: dataBrParaISO(r.DATAFICHA),
        tipo_ficha: r.TIPOFICHA ?? null,
        data_exame: dataBrParaISO(r.DATAEXAME),
        cod_exame: r.CODEXAME ?? null,
        nome_exame: r.NOMEEXAME ?? null,
        exame_alterado: r.EXAMEALTERADO ?? null,
        sai_aso: r.SAIASO ?? null,
        parecer_aso: r.PARECERASO ?? null,
        seq_ficha: r.CODIGOSEQUENCIALFICHA ?? null,
        seq_resultado: r.CODIGOSEQUENCIALRESULTADO ?? null,
        bruto: r,
      }
    })

    for (let i = 0; i < registros.length; i += 500) {
      const { error } = await supabase.from('soc_exames_trabalhador')
        .upsert(registros.slice(i, i + 500), { onConflict: 'fonte_id' })
      if (error) throw new Error(error.message)
    }

    return { empresa: empresaSoc, registros: registros.length, status: 'ok' }
  } catch (e) {
    return { empresa: empresaSoc, registros: 0, status: 'erro', detalhe: String(e).slice(0, 200) }
  }
}

/**
 * Funcionários de UMA empresa cliente (máscara 192399).
 *
 * Grava só o necessário para o cálculo de prazo: quem é, onde trabalha, se
 * está ativo. A máscara também devolve endereço, telefone, e-mail pessoal e
 * data de nascimento — nada disso é copiado, e esta é a única importação sem
 * `bruto`. Saúde ocupacional é dado sensível (LGPD art. 11), e guardar o
 * endereço de 28 mil pessoas para saber se um exame venceu amplia a exposição
 * sem servir ao indicador.
 */
export async function importarFuncionariosDaEmpresa(
  supabase: SupabaseClient,
  empresaSoc: string,
): Promise<{ empresa: string; registros: number; status: 'ok' | 'erro'; detalhe?: string }> {
  try {
    const todas = await getFuncionarios(empresaSoc) as Linha[]

    // Só quem tem vínculo. O indicador de ASO olha trabalhador ativo, e o peso
    // do que sobra é desproporcional: nas duas primeiras empresas carregadas,
    // 16.497 de 17.108 registros eram "Inativo" — e apenas 982 deles tinham
    // data de demissão, ou seja, "Inativo" ali é mais estado padrão de quem fez
    // exame avulso do que desligamento de fato.
    //
    // Guardar CPF e nome de centenas de milhares de pessoas sem vínculo, para
    // um cálculo que não as usa, amplia a exposição sem servir a nada.
    // 'Pendente' entra porque é admissão em andamento — justamente quem precisa
    // de ASO admissional; 'Afastado' entra porque o vínculo existe.
    const COM_VINCULO = new Set(['Ativo', 'Pendente', 'Afastado'])
    const linhas = todas.filter(r => COM_VINCULO.has((r.SITUACAO ?? '').trim()))

    const ocorrencias = new Map<string, number>()
    const registros = linhas.map(r => {
      // A chave usa só os campos que ficam: incluir os descartados faria o
      // hash mudar por causa de um telefone novo e duplicaria a pessoa.
      const identidade = [
        empresaSoc, r.CODIGO, r.CPFFUNCIONARIO, r.MATRICULAFUNCIONARIO, r.NOME,
      ].map(v => (v ?? '').trim()).join('|')
      const base = chaveNatural([identidade])
      const n = (ocorrencias.get(base) ?? 0) + 1
      ocorrencias.set(base, n)
      return {
        fonte_id: `${base}#${n}`,
        empresa_soc: empresaSoc,
        nome_empresa: r.NOMEEMPRESA ?? null,
        cod_funcionario: r.CODIGO ?? null,
        cpf: r.CPFFUNCIONARIO ?? null,
        matricula: r.MATRICULAFUNCIONARIO ?? null,
        nome: r.NOME ?? null,
        situacao: r.SITUACAO ?? null,
        cargo: r.NOMECARGO ?? null,
        setor: r.NOMESETOR ?? null,
        unidade: r.NOMEUNIDADE ?? null,
        data_admissao: dataBrParaISO(r.DATA_ADMISSAO),
        data_demissao: dataBrParaISO(r.DATA_DEMISSAO),
      }
    })

    for (let i = 0; i < registros.length; i += 500) {
      const { error } = await supabase.from('soc_funcionarios')
        .upsert(registros.slice(i, i + 500), { onConflict: 'fonte_id' })
      if (error) throw new Error(error.message)
    }

    return { empresa: empresaSoc, registros: registros.length, status: 'ok' }
  } catch (e) {
    return { empresa: empresaSoc, registros: 0, status: 'erro', detalhe: String(e).slice(0, 200) }
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

    // Registros byte a byte idênticos existem de verdade nesta fonte — dois
    // trabalhadores podem fazer o mesmo exame, na mesma empresa, no mesmo dia,
    // com o mesmo prestador, e nada no dado os distingue. Colapsá-los perderia
    // contagem; então a multiplicidade entra na chave, e reimportar a mesma
    // janela continua produzindo exatamente as mesmas chaves.
    const ocorrencias = new Map<string, number>()
    const registros = linhas.map(r => {
      const base = hashLinha(r)
      const n = (ocorrencias.get(base) ?? 0) + 1
      ocorrencias.set(base, n)
      const fonte_id = `${base}#${n}`
      return recurso === 'exames' ? mapearExame(r, fonte_id) : mapearLicenca(r, fonte_id)
    })

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
