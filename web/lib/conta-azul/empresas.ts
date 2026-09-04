// Empresas que ficam FORA do ciclo automático de sync do Conta Azul.
//
// Não é falha: é decisão. As três apontam para conta alheia no Conta Azul e,
// se sincronizadas, reintroduzem os mesmos títulos que já entram por outra
// empresa — o padrão de fonte_id replicado que aparece na base, com uma cópia
// ativa e as demais canceladas.
//
// Mora aqui, e não dentro da rota de sync, porque quem MONITORA o sync precisa
// da mesma lista: sem ela, o alerta de "empresa parada" acusa como congelada
// justamente a empresa que foi tirada do ciclo de propósito.
//
// A chave é `empresa_nome` da tabela conta_azul_tokens, que difere do
// nome_curto da tabela empresas (ex.: "SafeSolucoes" ↔ "SW Soluções").
export const EMPRESAS_FORA_DO_SYNC = ['SafeR&S', 'SafeHelp', 'SafeSolucoes']
