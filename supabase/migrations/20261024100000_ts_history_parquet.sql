-- PROTOTYPE (myHexa-test uniquement) — historique des séries temporelles des box, stocké en PARQUET.
-- Les séries ne sont PAS stockées dans Postgres : la base ne garde que
--   * ts_vars    : catalogue des variables par box (quelques lignes par box)
--   * ts_files   : index des fichiers Parquet (1 ligne par fichier)
--   * ts_buffer  : tampon des statuts 30 min des derniers jours (purgé une fois versé dans le Parquet)
--   * ts_dirty   : jours à (re)construire
-- Fichiers (bucket privé ts-archive), format long trié par variable, 1 row group par variable :
--   raw/company=<c>/device=<d>/year=YYYY/month=MM/YYYY-MM-DD.parquet   brut du jour
--   agg/1m/company=<c>/device=<d>/year=YYYY/YYYY-Www.parquet          agrégat minute, 1 fichier par semaine ISO
--   agg/1h/company=<c>/device=<d>/year=YYYY/YYYY-MM.parquet           agrégat horaire, 1 fichier par mois
--   agg/1d/company=<c>/device=<d>/YYYY.parquet                        agrégat journalier, 1 fichier par an
-- Écriture : Edge Function ts-build (à l'arrivée d'un rapport journalier + cron horaire). Lecture : Edge Function
-- ts-read, qui choisit le niveau selon la plage et ne lit que les variables demandées (lecture partielle HTTP Range).
-- Voir ~/suivi/projets/myhexa_support/historique_timeseries_parquet.md.

-- nettoyage de la 1re version du proto (séries en base), jamais déployée hors test
drop trigger if exists ts_after_report on public.reports;
drop function if exists public.ts_query(uuid, text[], timestamptz, timestamptz, text);
drop function if exists public.ts_ingest_report(uuid);
drop function if exists public.ts_ingest_status(uuid, jsonb);
drop function if exists public.ts_derive(uuid, text, date, char, text);
drop function if exists public.ts_archive_todo(int);
drop function if exists public.ts_catalog(uuid);
drop table if exists public.ts_series;
drop table if exists public.ts_archive;
drop table if exists public.ts_vars;

create table public.ts_vars (
  device_id uuid not null references public.devices(id) on delete cascade,
  var text not null,
  category text,
  unit text,
  description text,
  first_day date,
  last_day date,
  days int not null default 0,
  best_res int,               -- meilleure résolution vue (s) : 300 = courbe 5 min du rapport, 1800 = statut, 86400 = stats du jour
  updated_at timestamptz not null default now(),
  primary key (device_id, var)
);

create table if not exists public.ts_files (
  device_id uuid not null references public.devices(id) on delete cascade,
  level text not null check (level in ('raw', '1m', '1h', '1d')),
  period text not null,       -- 2026-10-22 | 2026-W43 | 2026-10 | 2026
  path text not null,
  t_from timestamptz not null,
  t_to timestamptz not null,
  rows int not null,
  bytes int not null,
  updated_at timestamptz not null default now(),
  primary key (device_id, level, period)
);
create index if not exists ts_files_range_idx on public.ts_files (device_id, level, t_from, t_to);

create table if not exists public.ts_buffer (
  device_id uuid not null references public.devices(id) on delete cascade,
  day date not null,          -- jour local de la box
  var text not null,
  ts timestamptz not null,
  v float8 not null,
  primary key (device_id, var, ts)
);
create index if not exists ts_buffer_day_idx on public.ts_buffer (device_id, day);

create table if not exists public.ts_dirty (
  device_id uuid not null references public.devices(id) on delete cascade,
  day date not null,
  since timestamptz not null default now(),
  primary key (device_id, day)
);

alter table public.ts_vars enable row level security;
alter table public.ts_files enable row level security;
alter table public.ts_buffer enable row level security;
alter table public.ts_dirty enable row level security;
drop policy if exists ts_vars_select on public.ts_vars;
create policy ts_vars_select on public.ts_vars for select using (is_device_visible(device_id));
drop policy if exists ts_files_select on public.ts_files;
create policy ts_files_select on public.ts_files for select using (is_device_visible(device_id));
-- ts_buffer / ts_dirty : aucune policy -> service role uniquement

create or replace function public.ts_num(j jsonb) returns float8 language sql immutable as $$
  select case jsonb_typeof(j)
    when 'number' then (j #>> '{}')::float8
    when 'boolean' then case when (j #>> '{}')::boolean then 1 else 0 end
    when 'string' then case when (j #>> '{}') ~ '^\s*-?[0-9]+(\.[0-9]+)?([eE][-+]?[0-9]+)?\s*$' then (j #>> '{}')::float8 end
  end
$$;

-- À l'arrivée d'un rapport : statut -> tampon ; journalier/hebdo -> jours marqués à reconstruire.
-- Jamais bloquant : une erreur d'historique ne doit pas faire perdre le rapport.
create or replace function public.ts_after_report() returns trigger language plpgsql security definer set search_path = public as $$
declare v_ts timestamptz; v_tz text; v_day date; d int; v_vars jsonb;
begin
  begin
    if new.type::text = 'status' then
      v_ts := coalesce((new.payload ->> 'timestamp')::timestamptz, now());
      v_tz := coalesce(nullif(new.payload -> 'device' ->> 'timezone', ''), 'Europe/Paris');
      begin
        v_day := (v_ts at time zone v_tz)::date;
      exception when others then
        v_day := (v_ts at time zone 'Europe/Paris')::date;
      end;
      v_vars := case when jsonb_typeof(new.payload -> 'variables') = 'array' then new.payload -> 'variables' else '[]' end;
      insert into ts_buffer (device_id, day, var, ts, v)
      select new.device_id, v_day, x ->> 'name', v_ts, ts_num(x -> 'value')
      from jsonb_array_elements(v_vars) x
      where x ->> 'name' is not null and ts_num(x -> 'value') is not null and lower(coalesce(x ->> 'category', '')) <> 'position'
      on conflict do nothing;
      insert into ts_vars (device_id, var, category, unit, description)
      select distinct on (x ->> 'name') new.device_id, x ->> 'name', lower(coalesce(x ->> 'category', 'measure')),
             nullif(x ->> 'unit', ''), nullif(x ->> 'description', '')
      from jsonb_array_elements(v_vars) x
      where x ->> 'name' is not null and ts_num(x -> 'value') is not null and lower(coalesce(x ->> 'category', '')) <> 'position'
      on conflict (device_id, var) do update
        set unit = coalesce(excluded.unit, ts_vars.unit), description = coalesce(excluded.description, ts_vars.description);
      insert into ts_dirty (device_id, day) values (new.device_id, v_day) on conflict (device_id, day) do update set since = now();
    elsif new.type::text in ('daily', 'weekly') and new.period_start is not null then
      for d in 0 .. greatest(coalesce(new.period_end - new.period_start, 1) - 1, 0) loop
        insert into ts_dirty (device_id, day) values (new.device_id, new.period_start + d) on conflict (device_id, day) do update set since = now();
      end loop;
      -- construction immédiate (asynchrone, pg_net) si l'URL et le secret sont en Vault
      if new.type::text = 'daily' and exists (select 1 from vault.secrets where name = 'ts_build_url') then
        perform net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name = 'ts_build_url'),
          headers := jsonb_build_object('content-type', 'application/json',
            'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ts_archive_cron_secret')),
          body := jsonb_build_object('device', new.device_id, 'limit', 10), timeout_milliseconds := 120000);
      end if;
    end if;
  exception when others then
    raise warning 'historique : % (%)', sqlerrm, new.id;
  end;
  return null;
end;
$$;
create trigger ts_after_report after insert or update of payload on public.reports
  for each row execute function public.ts_after_report();

-- appelé par ts-build après chaque jour construit
create or replace function public.ts_vars_touch(p_device uuid, p_day date, p_vars jsonb)
returns void language sql security definer set search_path = public as $$
  insert into ts_vars as t (device_id, var, category, unit, description, first_day, last_day, days, best_res)
  select p_device, x ->> 'var', nullif(x ->> 'category', ''), nullif(x ->> 'unit', ''), nullif(x ->> 'description', ''),
         p_day, p_day, 1, (x ->> 'res')::int
  from jsonb_array_elements(p_vars) x
  on conflict (device_id, var) do update set
    category = coalesce(excluded.category, t.category),
    unit = coalesce(excluded.unit, t.unit),
    description = coalesce(excluded.description, t.description),
    days = t.days + case when t.first_day is null or p_day < t.first_day or p_day > t.last_day then 1 else 0 end,
    first_day = least(coalesce(t.first_day, p_day), p_day),
    last_day = greatest(coalesce(t.last_day, p_day), p_day),
    best_res = least(coalesce(t.best_res, excluded.best_res), excluded.best_res),
    updated_at = now()
$$;

-- tampon : on garde 3 jours de statuts déjà versés dans le Parquet
create or replace function public.ts_buffer_purge()
returns int language sql security definer set search_path = public as $$
  with d as (
    delete from ts_buffer b where b.day < current_date - 3
      and not exists (select 1 from ts_dirty x where x.device_id = b.device_id and x.day = b.day)
    returning 1)
  select count(*)::int from d
$$;
revoke all on function public.ts_vars_touch(uuid, date, jsonb), public.ts_buffer_purge() from public, anon, authenticated;

-- catalogue lisible par le portail
create or replace function public.ts_catalog(p_device uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not is_device_visible(p_device) then null else coalesce((
    select jsonb_agg(jsonb_build_object(
      'var', var, 'unit', unit, 'category', category, 'description', description,
      'first_day', first_day, 'last_day', last_day, 'days', days, 'fine', coalesce(best_res, 99999) <= 300) order by var)
    from ts_vars where device_id = p_device and days > 0), '[]') end
$$;
grant execute on function public.ts_catalog(uuid) to authenticated;

insert into storage.buckets (id, name, public) values ('ts-archive', 'ts-archive', false)
on conflict (id) do nothing;
