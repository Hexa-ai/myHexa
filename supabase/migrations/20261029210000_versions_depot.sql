-- Versions du firmware publiées sur le dépôt APT public (s3.hexa-ai.fr/hai-pxxx-ai-packages).
-- La box ne rafraîchit sa liste de paquets que sur demande : sa « candidate » peut être périmée
-- (et vaut alors la phrase « You are already on the last version »). Le portail lit donc
-- lui-même le dépôt (fonction cron-firmware-releases, toutes les heures) et propose la mise à
-- jour quand une version plus récente y est publiée. Sans version imposée, la box fait
-- « apt update » puis installe la dernière : aucun changement côté box.

create table if not exists public.firmware_releases (
  version text primary key,
  description text,
  size_bytes bigint,
  first_seen_at timestamptz not null default now()
);
alter table public.firmware_releases enable row level security;
drop policy if exists firmware_releases_read on public.firmware_releases;
create policy firmware_releases_read on public.firmware_releases
  for select to authenticated using (true);
grant select on public.firmware_releases to authenticated;

-- « 1.3.11-i4 » -> {1,3,11} : le suffixe est ignoré (même règle que l'écran Mises à jour)
create or replace function public.fw_base(v text) returns int[]
language sql immutable as $$
  select coalesce(
    (select array_agg(coalesce(nullif(regexp_replace(x, '[^0-9]', '', 'g'), ''), '0')::int order by n)
       from unnest(string_to_array(split_part(v, '-', 1), '.')) with ordinality as t(x, n)),
    '{}'::int[])
$$;

-- Dernière version publiée strictement plus récente que v (null si aucune)
create or replace function public.fw_newer_release(v text) returns text
language sql stable security definer set search_path = public as $$
  select version from firmware_releases
   where v is null or fw_base(version) > fw_base(v)
   order by fw_base(version) desc limit 1
$$;

create or replace function public.greatest_version(a text, b text) returns text
language sql immutable as $$
  select case when a is null then b when b is null then a
              when fw_base(b) > fw_base(a) then b else a end
$$;

-- La box envoie une phrase quand elle se croit à jour : on ne garde qu'un vrai numéro
create or replace function public.devices_clean_candidate() returns trigger
language plpgsql as $$
begin
  if new.candidate_version is not null and new.candidate_version !~ '^[0-9]' then
    new.candidate_version := null;
  end if;
  return new;
end $$;
drop trigger if exists devices_clean_candidate on public.devices;
create trigger devices_clean_candidate before insert or update of candidate_version on public.devices
  for each row execute function public.devices_clean_candidate();
update public.devices set candidate_version = null where candidate_version !~ '^[0-9]';

-- Mise à jour autorisée si la box propose une version OU si le dépôt en a une plus récente
create or replace function public.queue_run_update(p_device uuid, p_version text default null, p_reboot boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d record; v_cmd text; v_recent timestamptz; v_target text;
begin
  select id, name, company_id, remote_seen_at, pkg_version, running_version, candidate_version, reboot_required, update_running
    into d from devices where id = p_device;
  if d.id is null or not can_manage_company(d.company_id) then raise exception 'forbidden'; end if;
  if d.remote_seen_at is null then
    return jsonb_build_object('status', 'refused', 'detail', 'box non pilotable : firmware antérieur à 1.3.7 ou pilotage à distance non activé (mise à jour sur site)');
  end if;
  if coalesce(d.update_running, false) then
    return jsonb_build_object('status', 'refused', 'detail', 'une installation est déjà en cours sur la box');
  end if;
  if coalesce(d.reboot_required, false) then
    return jsonb_build_object('status', 'refused', 'detail', 'mise à jour installée, en attente de redémarrage : redémarrer la box');
  end if;
  -- sans version imposée la box fait « apt update » puis installe la plus récente : la cible est
  -- la plus récente entre sa candidate et le dépôt
  v_target := case when coalesce(d.pkg_version, d.running_version) is null then d.candidate_version
    else coalesce(fw_newer_release(greatest_version(coalesce(d.pkg_version, d.running_version), d.candidate_version)), d.candidate_version) end;
  if v_target is null then
    return jsonb_build_object('status', 'refused', 'detail', 'aucune version plus récente (box et dépôt) : déjà à jour');
  end if;
  if p_version is not null and p_version !~ '^[0-9A-Za-z.~+-]{1,40}$' then
    return jsonb_build_object('status', 'refused', 'detail', 'version invalide');
  end if;
  if exists (select 1 from device_commands where device_id = p_device and type = 'run_update' and state in ('queued', 'sent', 'in_progress')) then
    return jsonb_build_object('status', 'refused', 'detail', 'une mise à jour est déjà programmée ou en cours');
  end if;
  select max(issued_at) into v_recent from device_commands
   where device_id = p_device and type = 'run_update' and state not in ('cancelled');
  if v_recent > now() - interval '60 minutes' then
    return jsonb_build_object('status', 'refused', 'detail', 'la box limite à une mise à jour par heure');
  end if;
  v_cmd := 'cmd_' || replace(gen_random_uuid()::text, '-', '');
  insert into device_commands (id, device_id, type, payload)
  values (v_cmd, p_device, 'run_update', jsonb_build_object('version', p_version, 'reboot', p_reboot));
  return jsonb_build_object('status', 'queued', 'id', v_cmd, 'target', coalesce(p_version, v_target));
end;
$$;

-- Lecture du dépôt toutes les heures (même mécanisme que report-run : URL et secret dans le vault)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'firmware-releases';
    perform cron.schedule('firmware-releases', '7 * * * *', $job$
      select net.http_post(
        url := replace((select decrypted_secret from vault.decrypted_secrets where name = 'report_run_url'), '/report-run', '/cron-firmware-releases'),
        headers := jsonb_build_object('content-type', 'application/json',
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
        body := '{}'::jsonb, timeout_milliseconds := 60000)
    $job$);
  end if;
end $$;
