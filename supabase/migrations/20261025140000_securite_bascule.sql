-- Sécurité avant la bascule en prod
-- 1. Aucune fonction de la base n'est appelable sans être connecté.
--    Le portail n'appelle aucune fonction avant connexion (seuls les documents publics des box sont lus
--    sans compte, par table et sans fonction). Les fonctions vérifient déjà les droits ; on ferme par principe.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure sig from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
  loop
    execute format('revoke execute on function %s from anon, public', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end $$;
-- et pour les fonctions créées plus tard par les migrations
alter default privileges in schema public revoke execute on functions from anon, public;
alter default privileges in schema public grant execute on functions to authenticated, service_role;

-- 2. Box : un compte client ne modifie que les champs prévus par le portail, et seulement s'il est administrateur
--    de son entreprise. Avant : tout membre (lecteur compris) pouvait modifier toutes les colonnes de ses box
--    (jeton d'ingestion, état du parc, garantie...). Les fonctions de la base (security definer, propriétaire
--    postgres), les fonctions edge (service_role) et les admins Hexa-AI ne sont pas concernés.
create or replace function public.devices_guard_update() returns trigger
language plpgsql set search_path = public as $$
declare
  free constant text[] := array['name', 'address', 'latitude', 'longitude', 'vnc_host', 'vnc_port', 'project_id', 'updated_at'];
begin
  if current_user <> 'authenticated' or public.is_hexa_staff_admin() then
    return new;
  end if;
  if not public.current_recipient_is_admin() then
    raise exception 'modification réservée aux administrateurs' using errcode = '42501';
  end if;
  if (to_jsonb(new) - free) is distinct from (to_jsonb(old) - free) then
    raise exception 'champ non modifiable depuis le portail client' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.devices_guard_update() from anon, public;

drop trigger if exists devices_guard_update on public.devices;
create trigger devices_guard_update before update on public.devices
  for each row execute function public.devices_guard_update();
