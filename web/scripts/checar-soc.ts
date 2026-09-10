import { getAgendamentos, getRiscos, getHistoricoFuncionarios, getFaturamento, getLicencasMedicas } from '../lib/soc/client'

async function checar(nome: string, f: () => Promise<unknown[]>) {
  try {
    const r = await f()
    console.log(`  ${r.length > 0 ? '✅' : '⚠️ '} ${nome}: ${r.length} registro(s)${r.length === 0 ? '  ← respondeu, mas vazio' : ''}`)
  } catch (e) {
    console.log(`  ❌ ${nome}: FALHOU — ${String(e).slice(0, 90)}`)
  }
}

async function main() {
  console.log('Chamadas ao SOC (erro agora sobe em vez de virar lista vazia):')
  await checar('agendamentos', getAgendamentos)
  await checar('riscos (GHE)', getRiscos)
  await checar('histórico de funcionários', getHistoricoFuncionarios)
  await checar('faturamento', () => getFaturamento(3))
  await checar('licenças médicas', () => getLicencasMedicas() as Promise<unknown[]>)
}
main()
