import BotaoSair from './BotaoSair'

/**
 * Layout do Command Center.
 *
 * Existe por um motivo só: pendurar o botão de sair em todas as telas sem
 * tocar nas 24 páginas, cada uma com seu próprio cabeçalho e `min-h-screen`.
 * Por isso não envolve o conteúdo em nenhum container — só devolve os filhos e
 * sobrepõe o botão, que é `position: fixed`. Qualquer wrapper aqui quebraria o
 * layout das páginas existentes.
 *
 * Vale também para /dashboard/acesso-restrito: quem caiu no bloqueio consegue
 * encerrar a sessão de fato, em vez de só voltar para o login com a sessão viva.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      {children}
      <BotaoSair />
    </>
  )
}
