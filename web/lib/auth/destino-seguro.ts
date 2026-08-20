/**
 * Sanitiza o parâmetro `next` dos links de autenticação.
 *
 * Só caminho relativo passa. Sem isto o link viraria redirect aberto — e com
 * sessão válida em mãos, o que é pior: o usuário chegaria autenticado em um
 * domínio de terceiro.
 *
 * Compartilhado entre o servidor e o cliente porque o fluxo tem os dois lados:
 * a query é resolvida no servidor, o fragmento no navegador. Uma regra só,
 * testada uma vez.
 */
export const DESTINO_PADRAO = '/redefinir-senha'

export function destinoSeguro(bruto: string | null | undefined): string {
  const v = bruto ?? DESTINO_PADRAO
  return v.startsWith('/') && !v.startsWith('//') ? v : DESTINO_PADRAO
}
