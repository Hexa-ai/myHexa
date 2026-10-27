-- Notifications d'alarme sur téléphone / PC (Web Push, application installée)
-- Principe : quand le statut d'une box arrive avec une variable d'alarme qui passe à l'état actif
-- (elle ne l'était pas dans le statut précédent), une ligne est mise en file et la fonction push-alarm
-- envoie une notification à chaque appareil abonné d'un utilisateur qui voit la box.
-- Complément d'information : les renvois d'alarme restent portés par les box (destinataires).

-- 1. abonnements (un par navigateur / téléphone)
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz
);
alter table public.push_subscriptions enable row level security;
drop policy if exists push_sub_own_select on public.push_subscriptions;
drop policy if exists push_sub_own_insert on public.push_subscriptions;
drop policy if exists push_sub_own_update on public.push_subscriptions;
drop policy if exists push_sub_own_delete on public.push_subscriptions;
create policy push_sub_own_select on public.push_subscriptions for select to authenticated using (auth_user_id = auth.uid());
create policy push_sub_own_insert on public.push_subscriptions for insert to authenticated with check (auth_user_id = auth.uid());
create policy push_sub_own_update on public.push_subscriptions for update to authenticated
  using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());
create policy push_sub_own_delete on public.push_subscriptions for delete to authenticated using (auth_user_id = auth.uid());
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- 2. file des alarmes à notifier (service uniquement)
create table if not exists public.push_alarm_queue (
  id bigserial primary key,
  device_id uuid not null references public.devices (id) on delete cascade,
  variable text not null,
  description text,
  type_alarm text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  result jsonb
);
alter table public.push_alarm_queue enable row level security;
create index if not exists push_alarm_queue_unsent on public.push_alarm_queue (created_at) where sent_at is null;

-- 3. destinataires d'une box : abonnements des utilisateurs qui la voient (même règle que is_device_visible)
create or replace function public.push_targets(p_device uuid)
returns setof public.push_subscriptions
language sql stable security definer set search_path = public as $$
  select s.*
  from public.push_subscriptions s
  where exists (
    select 1 from public.recipients r
    join public.devices d on d.id = p_device
    left join public.companies c on c.id = r.company_id
    where r.auth_user_id = s.auth_user_id
      and (
        (c.is_hexa_internal and r.role = 'admin')
        or (r.company_id = d.company_id and (r.restrict_to_devices is null or p_device = any (r.restrict_to_devices)))
        or p_device = any (r.shared_devices)
      )
  )
$$;
revoke all on function public.push_targets(uuid) from public, anon, authenticated;

-- 4. détection des alarmes qui passent à l'état actif, à chaque nouveau statut
create or replace function public.push_after_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  with act_new as (
    select v->>'name' as name, v->>'description' as description, v->>'type_alarm' as type_alarm
    from jsonb_array_elements(coalesce(new.payload->'variables', '[]'::jsonb)) v
    where v->>'category' = 'alarm' and coalesce(v->'value', 'null'::jsonb) not in (to_jsonb(0), 'null'::jsonb, to_jsonb(false))
  ),
  act_old as (
    select v->>'name' as name
    from jsonb_array_elements(coalesce(old.payload->'variables', '[]'::jsonb)) v
    where v->>'category' = 'alarm' and coalesce(v->'value', 'null'::jsonb) not in (to_jsonb(0), 'null'::jsonb, to_jsonb(false))
  ),
  ins as (
    insert into public.push_alarm_queue (device_id, variable, description, type_alarm)
    select new.device_id, a.name, a.description, a.type_alarm
    from act_new a
    where a.name is not null and not exists (select 1 from act_old o where o.name = a.name)
    returning 1
  )
  select count(*) into n from ins;

  if n > 0 and exists (select 1 from vault.decrypted_secrets where name = 'push_alarm_url') then
    perform net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'push_alarm_url'),
      headers := jsonb_build_object('content-type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ts_archive_cron_secret')),
      body := '{}'::jsonb, timeout_milliseconds := 30000);
  end if;
  return new;
exception when others then
  -- une notification ne doit jamais faire échouer l'ingestion d'un statut
  raise warning 'push_after_status: %', sqlerrm;
  return new;
end $$;

drop trigger if exists push_after_status on public.reports;
create trigger push_after_status after update of payload on public.reports
  for each row when (new.type = 'status') execute function public.push_after_status();

-- 5. URL de la fonction (déduite de celle de ts-build, comme report-run)
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'push_alarm_url')
     and exists (select 1 from vault.secrets where name = 'ts_build_url') then
    perform vault.create_secret(replace((select decrypted_secret from vault.decrypted_secrets where name = 'ts_build_url'), '/ts-build', '/push-alarm'), 'push_alarm_url');
  end if;
end $$;
