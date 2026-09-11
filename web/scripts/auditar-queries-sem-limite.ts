// Queries que podem truncar em 1.000 linhas sem ninguém perceber.
//
// O PostgREST corta qualquer resposta em 1.000 linhas com status 200 e sem
// sinal nenhum. Em dois dias o mesmo defeito apareceu em seis lugares deste
// projeto — carga do SOC, subcontas do DRE, ASO, orçamento, cockpit e contas —
// e em nenhum deles algo falhou: todos produziam números plausíveis. A
// inadimplência do cockpit saía R$ 42 mil menor; o painel de medicina mostrava
// 261 pendências de ASO onde havia 5.223.
//
// `auditar-teto-postgrest.ts` cobre as RPCs, executando cada uma. Aqui a
// verificação é estática, porque uma query montada com filtros condicionais não
// tem como ser executada fora da tela que a monta: procura `.from(tabela
// grande).select()` sem limite, range ou paginação.
//
//   npm run auditar-queries

import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

/** Caminhos .ts/.tsx sob um diretório, relativos à raiz do projeto. */
function arquivosDe(raiz: string): string[] {
  const saida: string[] = []
  const andar = (dir: string) => {
    for (const e of readdirSync(path.join(process.cwd(), dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name)
      if (e.isDirectory()) andar(rel)
      else if (/\.tsx?$/.test(e.name)) saida.push(rel)
    }
  }
  andar(raiz)
  return saida
}

// Tabelas que já passam — ou chegam perto — do teto. Conferido em 11/09/2026
// contra pg_class.reltuples; revisar quando a base crescer.
const TABELAS_GRANDES: Record<string, number> = {
  soc_exames: 208_304,
  soc_exames_trabalhador: 121_469,
  lancamentos_financeiros: 90_929,
  soc_funcionarios: 19_891,
  extrato_bancario: 6_120,
  saldos_bancarios: 3_370,
  metas_orcamentarias: 3_291,
  sync_log: 2_114,
  soc_importacoes_empresa: 1_257,
  soc_importacoes_funcionarios: 1_231,
}

// O que prova que a leitura está contida. `head: true` conta sem trazer linha;
// single/maybeSingle trazem uma; insert/update/upsert/delete não leem.
const MARCAS_SEGURAS = [
  '.limit(', '.range(', '.single(', '.maybeSingle(',
  'head: true', '.insert(', '.update(', '.upsert(', '.delete(',
]

// Exceções conscientes: arquivo + tabela + por quê. Uma entrada aqui é uma
// afirmação de que a leitura cabe — se deixar de caber, o número muda calado.
const JUSTIFICADAS: { arquivo: string; tabela: string; motivo: string }[] = [
  { arquivo: 'lib/agentes/plata/context.ts', tabela: 'lancamentos_financeiros',
    motivo: 'carregarLancamentos() pagina em blocos de 1.000 dentro da própria função' },
  { arquivo: 'app/dashboard/financeiro/orcamento/page.tsx', tabela: 'lancamentos_financeiros',
    motivo: 'agregarPaginado() é o fallback paginado da RPC, com laço de offset próprio' },
]

// Dívida conhecida em 11/09/2026: queries que já estavam assim quando a
// auditoria nasceu. Ficam listadas por ARQUIVO + TABELA (não por linha, que
// muda a cada edição) para que o script falhe em qualquer query NOVA sem
// exigir consertar dezenove de uma vez.
//
// Estar aqui não é aprovação — é dívida datada. Ao mexer num destes arquivos,
// resolva a leitura e apague a entrada. A lista só deve encolher.
const DIVIDA_CONHECIDA: { arquivo: string; tabela: string }[] = [
  { arquivo: 'scripts/carga-funcionarios.ts',                     tabela: 'soc_importacoes_funcionarios' },
  { arquivo: 'scripts/carga-trabalhadores.ts',                    tabela: 'soc_importacoes_empresa' },
  { arquivo: 'lib/lui/context.ts',                                tabela: 'lancamentos_financeiros' },
  { arquivo: 'lib/lui/context.ts',                                tabela: 'sync_log' },
  { arquivo: 'lib/lui/tools.ts',                                  tabela: 'lancamentos_financeiros' },
  { arquivo: 'lib/agentes/luizito/context.ts',                    tabela: 'lancamentos_financeiros' },
  { arquivo: 'app/dashboard/financeiro/page.tsx',                 tabela: 'metas_orcamentarias' },
  { arquivo: 'app/dashboard/financeiro/orcamento/page.tsx',       tabela: 'metas_orcamentarias' },
  { arquivo: 'app/dashboard/financeiro/inadimplentes/page.tsx',   tabela: 'lancamentos_financeiros' },
  { arquivo: 'app/dashboard/financeiro/emprestimos/page.tsx',     tabela: 'lancamentos_financeiros' },
  { arquivo: 'app/dashboard/financeiro/atrasados/page.tsx',       tabela: 'lancamentos_financeiros' },
  { arquivo: 'app/dashboard/comercial/page.tsx',                  tabela: 'lancamentos_financeiros' },
  { arquivo: 'app/api/lui/alertas/route.ts',                      tabela: 'lancamentos_financeiros' },
  { arquivo: 'app/api/conta-azul/sync/route.ts',                  tabela: 'sync_log' },
  { arquivo: 'app/api/conta-azul/sync/route.ts',                  tabela: 'lancamentos_financeiros' },
]

type Achado = { arquivo: string; linha: number; tabela: string }

function varrer(): Achado[] {
  const arquivos = ['app', 'lib', 'scripts'].flatMap(arquivosDe)
  const achados: Achado[] = []
  // Casa `.from('x')` e olha o encadeamento até o fim da expressão.
  const padrao = /\.from\(\s*'([a-z_]+)'\s*\)((?:.|\n){0,700}?)(?=\n\s*(?:const|let|return|\}|await|\/\/)|$)/g

  for (const rel of arquivos) {
    const txt = readFileSync(path.join(process.cwd(), rel), 'utf8')
    for (const m of txt.matchAll(padrao)) {
      const [, tabela, corpo] = m
      if (!(tabela in TABELAS_GRANDES)) continue
      if (!corpo.includes('.select(')) continue
      if (MARCAS_SEGURAS.some(marca => corpo.includes(marca))) continue
      if (JUSTIFICADAS.some(j => rel === j.arquivo && tabela === j.tabela)) continue
      if (DIVIDA_CONHECIDA.some(d => rel === d.arquivo && tabela === d.tabela)) continue
      achados.push({ arquivo: rel, linha: txt.slice(0, m.index).split('\n').length, tabela })
    }
  }
  return achados
}

const achados = varrer()
if (achados.length === 0) {
  console.log('✅ Nenhuma query NOVA sem limite em tabela grande.')
  console.log(`   ${Object.keys(TABELAS_GRANDES).length} tabelas vigiadas · ${JUSTIFICADAS.length} exceção(ões) declarada(s).`)
  console.log(`   ${DIVIDA_CONHECIDA.length} entrada(s) de dívida conhecida ainda por resolver — a lista só deve encolher.`)
  process.exit(0)
}

console.log(`❌ ${achados.length} query(ies) podem truncar em 1.000 linhas:\n`)
for (const a of achados) {
  console.log(`  ${a.arquivo}:${a.linha}`)
  console.log(`     lê ${a.tabela} (~${TABELAS_GRANDES[a.tabela].toLocaleString('pt-BR')} linhas) sem limite, range ou paginação`)
}
console.log(`
Como resolver, na ordem:
  1. A tela só precisa de contadores? Agregue no banco — evita trafegar a tabela
     inteira para montar quatro números (foi o caso do ASO).
  2. Precisa das linhas? Use lerPaginado de lib/supabase/paginar.ts, com
     .order() por coluna determinística.
  3. A lista é grande demais para o navegador? Ponha .limit() EXPLÍCITO, conte o
     total à parte e diga na tela quanto ficou de fora (foi o caso de Contas).
  4. A leitura cabe mesmo? Declare em JUSTIFICADAS, com o motivo.`)
process.exit(1)
