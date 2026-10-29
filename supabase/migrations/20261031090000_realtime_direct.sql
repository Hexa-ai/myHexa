-- Mode DIRECT du synoptique : Supabase Realtime Broadcast + Presence sur canaux PRIVÉS.
--
-- Un canal par box : topic 'box:<devices.id>'.
--   * la box se connecte avec un JWT court émis par l'Edge Function realtime-token
--     (rôle DB dédié box_rt, claims device_id / company_id / topic) ;
--   * un utilisateur du portail (rôle authenticated) lit / annonce sa présence sur les
--     canaux des box qu'il peut déjà voir (même règle que le reste du portail : is_device_visible) ;
--   * tout le reste est refusé (anon, autres entreprises, autre box, topics inconnus).
-- Prérequis réglage Realtime : « Allow public access » désactivé (private_only = true) et
-- presence_enabled = true (API Management : PATCH /v1/projects/{ref}/config/realtime).
--
-- NB : ne PAS faire « alter table realtime.messages enable row level security » (déjà actif,
-- l'instruction échoue : must be owner of table messages).

-- 1) Rôle dédié aux box. Volontairement NON accordé à « authenticator » : PostgREST refuse
--    donc le JWT d'une box (elle ne peut rien lire via l'API REST), seul Realtime l'accepte.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'box_rt') then
    create role box_rt nologin;
  end if;
end $$;
grant usage on schema realtime to box_rt;
grant select, insert on realtime.messages to box_rt;

-- 2) topic 'box:<uuid>' -> uuid, null si le format est invalide (pas d'erreur de cast dans la RLS).
create or replace function public.rt_topic_device(p_topic text)
returns uuid
language sql
immutable
set search_path = public
as $$
  select case when p_topic ~ '^box:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then substr(p_topic, 5)::uuid end
$$;

-- 3) Suivi minimal des échanges de jeton (une ligne par box, mise à jour au plus toutes les 5 min).
create table if not exists public.device_realtime (
  device_id uuid primary key references public.devices(id) on delete cascade,
  last_token_at timestamptz not null default now(),
  token_count bigint not null default 1,
  last_ip text
);
alter table public.device_realtime enable row level security;  -- aucune policy : service_role uniquement

-- 4) Recherche de la box par jeton de provisionnement (même test que ingest_status : devices.token = jeton).
--    Renvoie 0 ligne si jeton inconnu OU box retournée / mise au rebut (fleet_status).
create or replace function public.realtime_box_lookup(p_token text, p_ip text default null)
returns table (device_id uuid, company_id uuid, name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  if p_token is null or length(p_token) < 8 then
    return;
  end if;
  select d.id, d.company_id, d.name, d.fleet_status into v
  from devices d where d.token = p_token limit 1;
  if v.id is null or v.fleet_status in ('return', 'scrapped') then
    return;
  end if;
  insert into device_realtime (device_id, last_ip) values (v.id, p_ip)
  on conflict on constraint device_realtime_pkey do update
    set token_count = device_realtime.token_count + 1,
        last_token_at = now(),
        last_ip = excluded.last_ip
    where device_realtime.last_token_at < now() - interval '5 minutes'
       or device_realtime.last_ip is distinct from excluded.last_ip;
  return query select v.id, v.company_id, v.name;
end;
$$;
revoke all on function public.realtime_box_lookup(text, text) from public, anon, authenticated;
grant execute on function public.realtime_box_lookup(text, text) to service_role;

-- 5) Politiques sur realtime.messages (extension = 'broadcast' | 'presence').
drop policy if exists "rt box lit son canal" on realtime.messages;
drop policy if exists "rt box ecrit sur son canal" on realtime.messages;
drop policy if exists "rt utilisateur lit les canaux de ses box" on realtime.messages;
drop policy if exists "rt utilisateur annonce sa presence" on realtime.messages;

-- box : uniquement SON topic (claims signés par realtime-token), broadcast + presence
create policy "rt box lit son canal" on realtime.messages
  for select to box_rt
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and (select realtime.topic()) = (current_setting('request.jwt.claims', true)::json ->> 'topic')
    and (select realtime.topic()) = 'box:' || (current_setting('request.jwt.claims', true)::json ->> 'device_id')
  );
create policy "rt box ecrit sur son canal" on realtime.messages
  for insert to box_rt
  with check (
    realtime.messages.extension in ('broadcast', 'presence')
    and (select realtime.topic()) = (current_setting('request.jwt.claims', true)::json ->> 'topic')
    and (select realtime.topic()) = 'box:' || (current_setting('request.jwt.claims', true)::json ->> 'device_id')
  );

-- utilisateur : lecture broadcast + presence des box qu'il voit (entreprise, partage, staff Hexa)
create policy "rt utilisateur lit les canaux de ses box" on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and public.rt_topic_device((select realtime.topic())) is not null
    and public.is_device_visible(public.rt_topic_device((select realtime.topic())))
    and exists (select 1 from public.devices d where d.id = public.rt_topic_device((select realtime.topic())))  -- le staff Hexa voit tout, mais pas une box inexistante
  );
-- utilisateur : présence seulement (jamais de broadcast : il ne peut pas se faire passer pour la box)
create policy "rt utilisateur annonce sa presence" on realtime.messages
  for insert to authenticated
  with check (
    realtime.messages.extension = 'presence'
    and public.rt_topic_device((select realtime.topic())) is not null
    and public.is_device_visible(public.rt_topic_device((select realtime.topic())))
    and exists (select 1 from public.devices d where d.id = public.rt_topic_device((select realtime.topic())))  -- le staff Hexa voit tout, mais pas une box inexistante
  );
