// ============================================================
// Validação de escopo do token do Conta Azul
// ============================================================
//
// As empresas usam UMA conta master multi-empresa. O token sai escopado para a
// empresa ATIVA no seletor no momento da autorização — não para a empresa do
// link. Autorizar duas em sequência sem trocar o seletor grava o token da mesma
// empresa nas duas, sem erro nenhum na tela.
//
// Aconteceu em 17/08/2026 com Londrina e GP SafeWork, que ficaram com o token de
// Meio Ambiente. O sync gravou lançamentos de Meio Ambiente dentro de Londrina.
// Este módulo existe para isso não passar em silêncio.
//
// COMO SE DESCOBRE de quem é o token: pelas contas financeiras que ele enxerga.
// O identificador mais confiável é o NÚMERO da conta "Conta PJ Conta Azul IP",
// que é diferente em cada empresa (Meio Ambiente 23215, Foz 28227, Londrina
// 27131...). Funciona inclusive para empresas que só têm essa conta cadastrada.
// Como reserva, casa o nome pelos padroes_match de contas_bancarias_ativas.

import { ContaAzulClient, type ContaAzulContaFinanceira } from './client'
import type { ContaAzulCredentials } from './types'

export interface ContaCadastrada {
  nome_exibicao: string
  numero_cc: string | null
  padroes_match: string[] | null
}

export interface ResultadoEscopo {
  empresaNome: string
  ok: boolean
  motivo: string
  /** Marcadores da empresa que foram encontrados no que o token enxerga. */
  encontrados: string[]
  /** Nomes das contas que o token enxerga — ajuda a identificar de quem ele é. */
  contasDoToken: string[]
}

/** Só dígitos: "4839245-2" e "48392452" passam a ser o mesmo. */
function digitos(s: string | null | undefined): string {
  return String(s ?? '').replace(/\D/g, '')
}

function normalizar(s: string | null | undefined): string {
  return String(s ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // tira acentos
    .toUpperCase().trim()
}

/**
 * Confere se as contas que o token enxerga pertencem à empresa esperada.
 *
 * Casa por número da conta (forte) ou por padroes_match no nome (reserva).
 * Empresa sem conta cadastrada não é reprovada — devolve ok com motivo
 * explicando, porque reprovar sem base viraria falso positivo e travaria sync
 * que funciona.
 */
export function conferirContas(
  empresaNome: string,
  cadastradas: ContaCadastrada[],
  doToken: ContaAzulContaFinanceira[],
): ResultadoEscopo {
  const contasDoToken = doToken.map(c => c.nome).filter(Boolean)

  if (!cadastradas.length) {
    return {
      empresaNome, ok: true, encontrados: [], contasDoToken,
      motivo: 'sem conta cadastrada em contas_bancarias_ativas — não há como conferir',
    }
  }

  const numerosToken = new Set(doToken.map(c => digitos(c.numero)).filter(n => n.length >= 4))
  const nomesToken = doToken.map(c => normalizar(c.nome))

  const encontrados: string[] = []

  for (const conta of cadastradas) {
    const num = digitos(conta.numero_cc)

    // Com número cadastrado, o casamento é SÓ por número — sem cair no nome.
    // Nome é identificador fraco aqui por dois motivos, ambos vistos na prática:
    // "Conta PJ Conta Azul IP" existe com esse mesmo nome em TODAS as empresas
    // (só o número muda), e a conta master expõe contas de várias empresas, então
    // um padrão como "GP CORA" aparece até no escopo de Meio Ambiente. Aceitar o
    // nome como reserva aprovava justamente os tokens trocados de 17/08.
    if (num.length >= 4) {
      if (numerosToken.has(num)) {
        encontrados.push(`${conta.nome_exibicao} (nº ${conta.numero_cc})`)
      }
      continue
    }

    // Sem número cadastrado, não há o que fazer além do nome.
    const padroes = (conta.padroes_match ?? [conta.nome_exibicao]).map(normalizar)
    if (padroes.some(p => p.length >= 4 && nomesToken.some(n => n.includes(p)))) {
      encontrados.push(conta.nome_exibicao)
    }
  }

  if (encontrados.length) {
    return {
      empresaNome, ok: true, encontrados, contasDoToken,
      motivo: `reconhecida por ${encontrados.length} de ${cadastradas.length} conta(s) cadastrada(s)`,
    }
  }

  return {
    empresaNome, ok: false, encontrados: [], contasDoToken,
    motivo:
      'o token não enxerga nenhuma conta desta empresa — provavelmente foi ' +
      'autorizado com outra empresa ativa no seletor da conta master',
  }
}

/**
 * Busca as contas do token e confere. Usa o ContaAzulClient, que já trata o
 * refresh com coalescing — não fazer refresh por fora, o Cognito rotaciona.
 */
export async function validarEscopoEmpresa(
  creds: ContaAzulCredentials,
  cadastradas: ContaCadastrada[],
): Promise<ResultadoEscopo> {
  try {
    const client = new ContaAzulClient(creds)
    const contas = await client.getContasBancarias()
    return conferirContas(creds.empresaNome, cadastradas, contas)
  } catch (e) {
    // Falha de rede ou auth não é escopo errado: não bloqueia o sync, que já
    // trata o próprio erro de token com mensagem específica.
    return {
      empresaNome: creds.empresaNome,
      ok: true,
      encontrados: [],
      contasDoToken: [],
      motivo: `não foi possível conferir: ${e instanceof Error ? e.message : String(e)}`,
    }
  }
}

/**
 * Detecta colisão: dois tokens que enxergam exatamente o mesmo conjunto de
 * contas estão no mesmo escopo, então pelo menos um está errado. Pega o caso em
 * que a conferência por conta cadastrada não pegaria.
 */
export function detectarColisoes(
  resultados: ResultadoEscopo[],
): Array<{ contas: string; empresas: string[] }> {
  const porAssinatura = new Map<string, string[]>()
  for (const r of resultados) {
    if (!r.contasDoToken.length) continue
    const assinatura = [...r.contasDoToken].map(normalizar).sort().join('|')
    porAssinatura.set(assinatura, [...(porAssinatura.get(assinatura) ?? []), r.empresaNome])
  }
  return [...porAssinatura.entries()]
    .filter(([, empresas]) => empresas.length > 1)
    .map(([assinatura, empresas]) => ({ contas: assinatura.split('|').join(', '), empresas }))
}
