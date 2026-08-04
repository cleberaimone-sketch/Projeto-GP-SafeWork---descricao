-- RLS nas 29 tabelas que estavam totalmente expostas à anon key.
--
-- Contexto: a NEXT_PUBLIC_SUPABASE_ANON_KEY vai no bundle do frontend, ou seja,
-- é pública. Sem RLS, qualquer pessoa com essa chave lia e escrevia em tudo —
-- incluindo lancamentos_financeiros (75 mil registros), saldos_bancarios,
-- consultas e asos (dado de saúde ocupacional).
--
-- Por que SEM policies: mapeamento do código mostrou que nenhuma leitura ou
-- escrita de dados passa pelos roles anon/authenticated. As 21 páginas de
-- dashboard e as 10 rotas de mutação usam service_role, que ignora RLS por
-- definição. O client autenticado (lib/supabase/server.ts) é usado apenas para
-- auth.getUser(). Habilitar RLS sem policy fecha para anon/authenticated e
-- mantém service_role intacto.
--
-- Este é o mesmo padrão já em vigor em 13 tabelas do banco (extrato_bancario,
-- metas_orcamentarias, os_eventos, snapshots_financeiros_diarios, etc), que
-- rodam com RLS ligado e zero policies sem qualquer problema.

ALTER TABLE public.empresas                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.centros_custo           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funcionarios            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lancamentos_financeiros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saldos_bancarios        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.honorarios_medicina     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profissionais_saude     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultas               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asos                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pcmso_clientes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tecnicos_seguranca      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.laudos_tecnicos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pgr_clientes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coletas_ambientais      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conformidade_nr         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contratos               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oportunidades_crm       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comissoes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registros_ponto         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turnover_log            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credenciados_safeplus   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendamentos_safeplus   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turmas_safet            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.presencas_safet         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alertas                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.briefings_diarios       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversas_ia            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_log                ENABLE ROW LEVEL SECURITY;

-- Views: por padrão são SECURITY DEFINER, ou seja, rodam com a permissão do dono
-- (postgres) e IGNORAM o RLS das tabelas base. Sem isto, v_saldos_ativos e
-- v_saldos_pluggy continuariam servindo saldo, número de conta corrente, agência
-- e IDs do Pluggy para qualquer um com a anon key — mesmo com RLS ligado acima.
--
-- security_invoker = on faz a view rodar com a permissão de quem consulta,
-- passando a respeitar o RLS das tabelas base.
--
-- Nota: v_saldos_pluggy já lia de tabelas com RLS ligado (pluggy_accounts,
-- pluggy_items) e mesmo assim vazava — exatamente por ser SECURITY DEFINER.

ALTER VIEW public.v_saldos_ativos  SET (security_invoker = on);
ALTER VIEW public.v_saldos_pluggy  SET (security_invoker = on);

NOTIFY pgrst, 'reload schema';
