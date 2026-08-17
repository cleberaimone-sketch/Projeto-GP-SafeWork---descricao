// Testa conferirContas contra os dados reais do incidente de 17/08/2026.
import { conferirContas, detectarColisoes } from '../escopo'

const conta = (nome: string, numero?: string) =>
  ({ id: nome, nome, banco: '', codigo_banco: 0, tipo: '', ativo: true, numero })

// O que o token ERRADO de Londrina enxergava (era o escopo de Meio Ambiente)
const contasMeioAmbiente = [
  conta('BRADESCO MEIO AMBIENTE'), conta('Conta Modelo'),
  conta('Conta PJ Conta Azul IP', '23215'), conta('GP CORA'),
  conta('Meio Ambiente'), conta('Sicredi - 51.800-3', '518003'), conta('Caixinha'),
]

// O que o token CORRETO de Londrina enxerga
const contasLondrina = [
  conta('0001-30 - Meio Ambiente'), conta('Cartão de Crédito - CIELO Londrina'),
  conta('Conta Azul Caixinha'), conta('Conta Modelo'),
  conta('Conta PJ Conta Azul IP', '27131'), conta('Cora - Monest'),
  conta('GP CORA'), conta('GP Safework Matriz - Conta Azul'),
  conta('Safework Foz'), conta('Safework Londrina - Itau', '99742-9'),
]

const cadLondrina = [
  { nome_exibicao: 'Conta PJ Conta Azul IP', numero_cc: '27131', padroes_match: ['Conta PJ Conta Azul IP'] },
  { nome_exibicao: 'Safework Londrina - Itaú', numero_cc: '99742-9', padroes_match: ['Safework Londrina - Itau', 'Safework Londrina - Itaú'] },
]
const cadMeioAmbiente = [
  { nome_exibicao: 'Conta PJ Conta Azul IP', numero_cc: '23215', padroes_match: ['Conta PJ Conta Azul IP'] },
]
const cadGP = [
  { nome_exibicao: 'Conta PJ Conta Azul IP', numero_cc: '15534', padroes_match: ['Conta PJ Conta Azul IP'] },
  { nome_exibicao: 'GP SafeWork - Banco Cora', numero_cc: '4839245-2', padroes_match: ['Banco Cora', 'GP CORA', 'CORA GP', 'Cora - GP Safework'] },
]

let falhas = 0
function checar(caso: string, esperado: boolean, real: boolean, extra = '') {
  const ok = esperado === real
  if (!ok) falhas++
  console.log(`  ${ok ? '✅' : '❌ FALHOU'}  ${caso} → ok=${real} (esperado ${esperado}) ${extra}`)
}

console.log('\n=== o incidente seria pego? ===')
const r1 = conferirContas('SafeWork Londrina', cadLondrina, contasMeioAmbiente)
checar('Londrina com escopo de Meio Ambiente', false, r1.ok)

console.log('\n=== e o cenário correto passa? ===')
const r2 = conferirContas('SafeWork Londrina', cadLondrina, contasLondrina)
checar('Londrina com escopo próprio', true, r2.ok, `[${r2.encontrados.join(', ')}]`)

const r3 = conferirContas('SafeWork Meio Ambiente', cadMeioAmbiente, contasMeioAmbiente)
checar('Meio Ambiente (só tem a conta genérica)', true, r3.ok, `[${r3.encontrados.join(', ')}]`)

console.log('\n=== GP SafeWork com o escopo errado de hoje ===')
const r4 = conferirContas('GP SafeWork', cadGP, contasMeioAmbiente)
// contasMeioAmbiente TEM "GP CORA", que é padrão da GP — cuidado com falso OK
checar('GP com escopo de Meio Ambiente', false, r4.ok,
       r4.ok ? `⚠ casou por: ${r4.encontrados.join(', ')}` : '')

console.log('\n=== empresa sem conta cadastrada não trava o sync ===')
const r5 = conferirContas('Alguma Empresa', [], contasLondrina)
checar('sem cadastro', true, r5.ok)

console.log('\n=== colisão entre dois tokens iguais ===')
const col = detectarColisoes([
  { empresaNome: 'Londrina', ok: true, motivo: '', encontrados: [], contasDoToken: contasMeioAmbiente.map(c => c.nome) },
  { empresaNome: 'GP SafeWork', ok: true, motivo: '', encontrados: [], contasDoToken: contasMeioAmbiente.map(c => c.nome) },
  { empresaNome: 'Outra', ok: true, motivo: '', encontrados: [], contasDoToken: contasLondrina.map(c => c.nome) },
])
console.log(`  ${col.length === 1 ? '✅' : '❌ FALHOU'}  detectou ${col.length} colisão(ões)` +
            (col.length ? ` → ${col[0].empresas.join(' e ')}` : ''))
if (col.length !== 1) falhas++

console.log(falhas === 0 ? '\n✅ todos os casos passaram' : `\n❌ ${falhas} caso(s) falharam`)
process.exit(falhas === 0 ? 0 : 1)
