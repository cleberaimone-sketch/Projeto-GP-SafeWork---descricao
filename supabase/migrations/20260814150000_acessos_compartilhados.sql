-- Links de compartilhamento externo (sócios, investidores, contadores).
--
-- Caso de uso: dar a um sócio da SafeT acesso ao demonstrativo da empresa dele
-- sem criar login e sem que ele enxergue o resto do grupo. O acesso é por token
-- na URL (/safet/<token>).
--
-- O token vive aqui e não em env var de propósito: assim dá para revogar na
-- hora (ativo = false) sem redeploy, expirar por data, e saber quando o link
-- foi usado pela última vez. Um link secreto que não dá para revogar nem
-- auditar é um problema esperando acontecer.
--
-- O token NÃO é commitado — a linha é inserida direto no banco.

CREATE TABLE IF NOT EXISTS public.acessos_compartilhados (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token             text NOT NULL UNIQUE,
  empresa_id        uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  descricao         text,
  ativo             boolean NOT NULL DEFAULT true,
  expira_em         timestamptz,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  ultimo_acesso_em  timestamptz,
  total_acessos     integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_acessos_compartilhados_token
  ON public.acessos_compartilhados (token) WHERE ativo;

CREATE INDEX IF NOT EXISTS idx_acessos_compartilhados_empresa
  ON public.acessos_compartilhados (empresa_id);

-- RLS ligado sem policy: mesmo padrão do resto do banco. A validação do token
-- roda no server component com service_role, que ignora RLS. Assim a tabela de
-- tokens fica inacessível pela anon key — o contrário seria entregar a chave.
ALTER TABLE public.acessos_compartilhados ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
