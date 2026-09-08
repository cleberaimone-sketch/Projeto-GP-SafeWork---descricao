// Testa a fatia do importador do SOC onde um erro passa despercebido: a
// geração das janelas de 30 dias e a conversão de data brasileira.
//
// Um furo entre janelas some com um mês inteiro de exames sem nenhum sintoma —
// a carga termina "com sucesso" e o dado simplesmente não está lá.

import { janelas, dataBrParaISO, chaveNatural, hashLinha, DIAS_POR_JANELA } from '../importar'

let falhas = 0
function checar(nome: string, esperado: unknown, obtido: unknown) {
  const ok = JSON.stringify(esperado) === JSON.stringify(obtido)
  if (!ok) falhas++
  console.log(`  ${ok ? '✅' : '❌ FALHOU'}  ${nome}` +
    (ok ? '' : ` — esperava ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`))
}
const dia = (s: string) => new Date(`${s}T12:00:00`)
const iso = (d: Date) => d.toISOString().slice(0, 10)

console.log('\n=== janelas cobrem o período inteiro, sem furo e sem sobreposição ===')
{
  const js = janelas(dia('2025-01-01'), dia('2026-09-08'))
  checar('começa no primeiro dia', '2025-01-01', iso(js[0].de))
  checar('termina no último dia', '2026-09-08', iso(js[js.length - 1].ate))

  let furos = 0, sobreposicoes = 0, largas = 0
  for (let i = 0; i < js.length; i++) {
    const dias = Math.round((+js[i].ate - +js[i].de) / 86_400_000) + 1
    if (dias > DIAS_POR_JANELA) largas++
    if (i === 0) continue
    const gap = Math.round((+js[i].de - +js[i - 1].ate) / 86_400_000)
    if (gap > 1) furos++
    if (gap < 1) sobreposicoes++
  }
  checar('nenhum furo entre janelas', 0, furos)
  checar('nenhuma sobreposição', 0, sobreposicoes)
  checar(`nenhuma janela acima de ${DIAS_POR_JANELA} dias`, 0, largas)
  console.log(`     (${js.length} janelas para 2025-01-01 → 2026-09-08)`)
}

console.log('\n=== período curto não vira janela vazia nem estoura o fim ===')
{
  const js = janelas(dia('2026-09-01'), dia('2026-09-08'))
  checar('uma janela só', 1, js.length)
  checar('não passa do fim pedido', '2026-09-08', iso(js[0].ate))
}
{
  const js = janelas(dia('2026-09-08'), dia('2026-09-08'))
  checar('um único dia gera uma janela', 1, js.length)
}

console.log('\n=== data brasileira → ISO ===')
{
  checar('DD/MM/YYYY', '2026-09-08', dataBrParaISO('08/09/2026'))
  checar('com hora junto', '2025-12-31', dataBrParaISO('31/12/2025 14:30'))
  checar('vazio vira null', null, dataBrParaISO(''))
  checar('indefinido vira null', null, dataBrParaISO(undefined))
  checar('formato inesperado vira null', null, dataBrParaISO('2026-09-08'))
  // Dia e mês não podem trocar de lugar: 03/04 é 3 de abril, não 4 de março.
  checar('não inverte dia e mês', '2026-04-03', dataBrParaISO('03/04/2026'))
}

console.log('\n=== chave natural ===')
{
  const a = chaveNatural(['289501', '123', 'FULANO', '08/09/2026', 'EX01'])
  const b = chaveNatural(['289501', '123', 'FULANO', '08/09/2026', 'EX01'])
  const c = chaveNatural(['289501', '123', 'FULANO', '08/09/2026', 'EX02'])
  checar('mesma entrada, mesma chave (reimportar não duplica)', true, a === b)
  checar('exame diferente, chave diferente', true, a !== c)
  checar('espaço em volta não muda a chave', true, a === chaveNatural([' 289501 ', '123', 'FULANO ', '08/09/2026', 'EX01']))
  checar('campo ausente não quebra', true, typeof chaveNatural([undefined, null, 'X']) === 'string')
}

console.log('\n=== hash da linha inteira (a chave que substituiu a que perdia 41%) ===')
{
  const a = { EMPRESA: '289501', DATAFICHA: '08/09/2026', CODEXAME: 'EX01', NOMEEXAME: 'GLICOSE' }
  const b = { NOMEEXAME: 'GLICOSE', CODEXAME: 'EX01', DATAFICHA: '08/09/2026', EMPRESA: '289501' }
  checar('ordem dos campos não muda o hash', true, hashLinha(a) === hashLinha(b))
  checar('campo diferente muda o hash', true,
         hashLinha(a) !== hashLinha({ ...a, NOMEEXAME: 'HEMOGRAMA' }))
  // O caso que quebrou a primeira versão: mesma empresa, dia e exame, mas
  // registros distintos por outro campo.
  checar('mesmo exame no mesmo dia, prestadores diferentes → hashes diferentes', true,
         hashLinha({ ...a, NOMEPRESTADOR: 'A' }) !== hashLinha({ ...a, NOMEPRESTADOR: 'B' }))
}

console.log(falhas === 0 ? '\n✅ todos os casos passaram' : `\n❌ ${falhas} caso(s) falharam`)
process.exit(falhas === 0 ? 0 : 1)
