-- Verrouille l'accès RPC public aux fonctions SECURITY DEFINER introduites en P2.
-- Ces fonctions restent appelables dans le contexte interne (policies RLS, trigger)
-- car SECURITY DEFINER s'exécute en tant que owner = postgres (qui a EXECUTE).

-- current_recipient_company_id : utilisée dans les policies USING/WITH CHECK.
-- Postgres évalue les policies au nom du connection role, qui doit donc avoir EXECUTE.
-- On laisse authenticated EXECUTE (sans quoi les policies échoueraient), on retire anon.
REVOKE EXECUTE ON FUNCTION public.current_recipient_company_id() FROM PUBLIC, anon;

-- link_recipient_to_auth_user : n'est appelée que par le trigger on_auth_user_created.
-- Aucun rôle exposé via PostgREST ne doit pouvoir l'exécuter directement.
REVOKE EXECUTE ON FUNCTION public.link_recipient_to_auth_user() FROM PUBLIC, anon, authenticated;
