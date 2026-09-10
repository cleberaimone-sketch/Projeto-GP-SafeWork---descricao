// A soma das subcontas tem de fechar com a linha do DRE. Não fechava: a RPC
// devolve 1.023 linhas para 2025, o PostgREST corta em 1.000 sem avisar e 23
// subcontas sumiam do Demonstrativo Mensal.
import { createClient } from '@supabase/supabase-js'
import { lerRpcPaginado } from '../lib/supabase/paginar'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
type Row = { linha: string; categoria: string; mes: number; total: number }

async function main() {
  for (const ano of [2025, 2026]) {
    const semPaginar = (await db.rpc('fn_dre_categoria_mensal', { p_ano: ano, p_empresa_id: null })).data as Row[]
    const paginado = await lerRpcPaginado<Row>(db, 'fn_dre_categoria_mensal', { p_ano: ano, p_empresa_id: null })
    const soma = (r: Row[]) => r.filter(x => x.linha === 'receita_bruta').reduce((s, x) => s + Number(x.total), 0)
    const perdidas = paginado.length - semPaginar.length
    console.log(`${ano}: ${semPaginar.length} linhas sem paginar, ${paginado.length} paginado` +
      (perdidas > 0 ? `  ← ${perdidas} perdidas` : '  ← nada a recuperar'))
    if (perdidas > 0) {
      const d = soma(paginado) - soma(semPaginar)
      console.log(`       receita bruta: ${soma(semPaginar).toLocaleString('pt-BR')} → ${soma(paginado).toLocaleString('pt-BR')}` +
        (d !== 0 ? `  (${d.toLocaleString('pt-BR')} a mais)` : '  (a perda não era de receita)'))
    }
  }
}
main()
