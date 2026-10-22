-- Migration appliquée en production le 2026-05-14 (version 20260514204530), recopiée telle quelle depuis
-- supabase_migrations.schema_migrations de la prod lors du réalignement du 2026-10-22.

REVOKE EXECUTE ON FUNCTION public.current_recipient_company_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.link_recipient_to_auth_user() FROM PUBLIC, anon, authenticated;
