-- Historique : une seule construction à la fois par box.
-- Deux appels de ts-build sur la même box (déclencheur des rapports + cron, ou reprise de l'historique)
-- relisaient puis réécrivaient les mêmes fichiers d'agrégats (semaine, mois, année) : le dernier écrivain
-- effaçait les journées ajoutées par l'autre (trou du 18 au 22/10 sur UY10 après la reprise en prod).
create table if not exists public.ts_build_lock (
  device_id uuid primary key,
  until timestamptz not null
);
alter table public.ts_build_lock enable row level security; -- service_role seul

create or replace function public.ts_build_try_lock(p_device uuid, p_ttl_s integer default 120)
returns boolean
language sql
security definer
set search_path = public
as $$
  with x as (
    insert into ts_build_lock (device_id, until) values (p_device, now() + make_interval(secs => p_ttl_s))
    on conflict (device_id) do update set until = excluded.until
      where ts_build_lock.until < now()
    returning 1
  )
  select exists (select 1 from x);
$$;

create or replace function public.ts_build_unlock(p_device uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from ts_build_lock where device_id = p_device;
$$;

revoke all on function public.ts_build_try_lock(uuid, integer) from public, anon, authenticated;
revoke all on function public.ts_build_unlock(uuid) from public, anon, authenticated;
grant execute on function public.ts_build_try_lock(uuid, integer) to service_role;
grant execute on function public.ts_build_unlock(uuid) to service_role;
