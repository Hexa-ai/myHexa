-- Parc des box (staff Hexa-AI) : statut, livraison, garantie, lot de réception, journal par box.
-- Les liens avec les clients (entreprise, projet, jeton) ne changent QUE par fleet_deliver / fleet_to_stock ;
-- l'import (fleet_apply) ne touche que des champs descriptifs.

alter table public.devices
  add column if not exists fleet_status text not null default 'stock'
    check (fleet_status in ('stock', 'delivered', 'return', 'scrapped')),
  add column if not exists delivered_at date,
  add column if not exists warranty_months integer check (warranty_months between 0 and 240),
  add column if not exists received_at date,
  add column if not exists supplier text,
  add column if not exists purchase_ref text,
  add column if not exists fleet_note text;

-- état initial : une box chez un client (entreprise non interne) est livrée
update public.devices d set fleet_status = 'delivered'
  from public.companies c
  where c.id = d.company_id and not c.is_hexa_internal and d.fleet_status = 'stock';

-- normalisation : MAC en minuscules avec « : » (le provisionnement compare la MAC exacte), sans espaces
create or replace function public.devices_normalize() returns trigger
language plpgsql as $$
begin
  new.mac_eth0 := nullif(replace(lower(btrim(new.mac_eth0, E' \t\r\n')), '-', ':'), '');
  new.serial_number := nullif(upper(btrim(new.serial_number, E' \t\r\n')), '');
  new.invoice_number := nullif(btrim(new.invoice_number, E' \t\r\n'), '');
  if new.mac_eth0 is not null and new.mac_eth0 !~ '^[0-9a-f]{2}(:[0-9a-f]{2}){5}$' then
    raise exception 'adresse MAC invalide : %', new.mac_eth0 using errcode = '22023';
  end if;
  -- doublon historique (même MAC une fois nettoyée) : on garde la valeur brute, pour ne pas
  -- détourner le provisionnement vers la box fantôme ; il reste signalé dans le parc
  if tg_op = 'UPDATE' and new.mac_eth0 is not null and new.mac_eth0 is distinct from old.mac_eth0
     and new.mac_eth0 = replace(lower(btrim(old.mac_eth0, E' \t\r\n')), '-', ':')
     and exists (select 1 from public.devices d where d.mac_eth0 = new.mac_eth0 and d.id <> new.id) then
    new.mac_eth0 := old.mac_eth0;
    return new;
  end if;
  -- doublons refusés pour toute nouvelle saisie (les doublons historiques restent signalés dans le parc)
  if new.mac_eth0 is not null and (tg_op = 'INSERT' or new.mac_eth0 is distinct from replace(lower(btrim(old.mac_eth0, E' \t\r\n')), '-', ':'))
     and exists (select 1 from public.devices d where d.mac_eth0 = new.mac_eth0 and d.id <> new.id) then
    raise exception 'adresse MAC déjà utilisée : %', new.mac_eth0 using errcode = '23505';
  end if;
  if new.serial_number is not null and (tg_op = 'INSERT' or new.serial_number is distinct from upper(btrim(old.serial_number, E' \t\r\n')))
     and exists (select 1 from public.devices d where d.serial_number = new.serial_number and d.id <> new.id) then
    raise exception 'numéro de série déjà utilisé : %', new.serial_number using errcode = '23505';
  end if;
  return new;
end $$;

drop trigger if exists devices_normalize on public.devices;
create trigger devices_normalize before insert or update of mac_eth0, serial_number, invoice_number
  on public.devices for each row execute function public.devices_normalize();

-- corrige les MAC / n° de série mal saisis (espace, retour à la ligne) quand le nettoyage ne crée pas de doublon ;
-- les doublons historiques ne sont pas touchés : ils sont signalés dans le parc
update public.devices d set mac_eth0 = d.mac_eth0
  where d.mac_eth0 is not null
    and replace(lower(btrim(d.mac_eth0, E' \t\r\n')), '-', ':') ~ '^[0-9a-f]{2}(:[0-9a-f]{2}){5}$'
    and d.mac_eth0 <> replace(lower(btrim(d.mac_eth0, E' \t\r\n')), '-', ':')
    and not exists (select 1 from public.devices o where o.id <> d.id
      and replace(lower(btrim(o.mac_eth0, E' \t\r\n')), '-', ':') = replace(lower(btrim(d.mac_eth0, E' \t\r\n')), '-', ':'));
update public.devices d set serial_number = d.serial_number
  where d.serial_number is not null and d.serial_number <> upper(btrim(d.serial_number, E' \t\r\n'))
    and not exists (select 1 from public.devices o where o.id <> d.id
      and upper(btrim(o.serial_number, E' \t\r\n')) = upper(btrim(d.serial_number, E' \t\r\n')));

create index if not exists devices_mac_eth0_idx on public.devices (mac_eth0);
create index if not exists devices_serial_idx on public.devices (serial_number);

-- réglages du parc (une seule ligne)
create table if not exists public.fleet_settings (
  id boolean primary key default true check (id),
  default_warranty_months integer not null default 24 check (default_warranty_months between 0 and 240),
  updated_at timestamptz not null default now()
);
insert into public.fleet_settings (id) values (true) on conflict do nothing;
alter table public.fleet_settings enable row level security;
drop policy if exists fleet_settings_select on public.fleet_settings;
create policy fleet_settings_select on public.fleet_settings for select using (public.is_hexa_staff());
drop policy if exists fleet_settings_update on public.fleet_settings;
create policy fleet_settings_update on public.fleet_settings for update
  using (public.is_hexa_staff_admin()) with check (public.is_hexa_staff_admin());

-- journal par box
create table if not exists public.device_events (
  id bigserial primary key,
  device_id uuid not null references public.devices (id) on delete cascade,
  at timestamptz not null default now(),
  actor uuid default auth.uid(),
  kind text not null,
  changes jsonb,
  note text
);
create index if not exists device_events_device_idx on public.device_events (device_id, at desc);
alter table public.device_events enable row level security;
drop policy if exists device_events_select on public.device_events;
create policy device_events_select on public.device_events for select using (public.is_hexa_staff());
drop policy if exists device_events_insert on public.device_events;
create policy device_events_insert on public.device_events for insert with check (public.is_hexa_staff_admin());

create or replace function public.devices_log_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  f text;
  ch jsonb := '{}'::jsonb;
  o jsonb;
  n jsonb := to_jsonb(new);
  k text := coalesce(nullif(current_setting('app.fleet_event', true), ''), 'edit');
  fields text[] := array['name', 'serial_number', 'mac_eth0', 'invoice_number', 'company_id', 'project_id',
    'fleet_status', 'delivered_at', 'warranty_months', 'received_at', 'supplier', 'purchase_ref', 'fleet_note'];
begin
  if tg_op = 'INSERT' then
    foreach f in array fields loop
      if n -> f is not null and n -> f <> 'null'::jsonb then ch := ch || jsonb_build_object(f, jsonb_build_array(null, n -> f)); end if;
    end loop;
    insert into device_events (device_id, kind, changes) values (new.id, 'received', ch);
    return new;
  end if;
  o := to_jsonb(old);
  foreach f in array fields loop
    if (o -> f) is distinct from (n -> f) then ch := ch || jsonb_build_object(f, jsonb_build_array(o -> f, n -> f)); end if;
  end loop;
  if ch <> '{}'::jsonb then
    if k = 'edit' and ch ? 'fleet_status' then k := 'status'; end if;
    insert into device_events (device_id, kind, changes, note)
      values (new.id, k, ch, nullif(current_setting('app.fleet_note', true), ''));
  end if;
  return new;
end $$;

drop trigger if exists devices_log_event on public.devices;
create trigger devices_log_event after insert or update on public.devices
  for each row execute function public.devices_log_event();

-- livraison : box -> entreprise (créée à la volée si besoin), facture, date, projet
create or replace function public.fleet_deliver(
  p_ids uuid[], p_company_id uuid, p_new_company text, p_invoice text, p_date date, p_project_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid := p_company_id;
begin
  if not is_hexa_staff_admin() then raise exception 'réservé aux admins Hexa-AI' using errcode = '42501'; end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then raise exception 'aucune box'; end if;
  if cid is null then
    if nullif(btrim(p_new_company), '') is null then raise exception 'entreprise manquante'; end if;
    select id into cid from companies where lower(name) = lower(btrim(p_new_company));
    if cid is null then
      insert into companies (name) values (btrim(p_new_company)) returning id into cid;
    end if;
  end if;
  if p_project_id is not null and not exists (select 1 from projects where id = p_project_id and company_id = cid) then
    raise exception 'le projet n''appartient pas à cette entreprise';
  end if;
  perform set_config('app.fleet_event', 'delivered', true);
  update devices set company_id = cid, project_id = p_project_id, fleet_status = 'delivered',
    invoice_number = coalesce(nullif(btrim(p_invoice), ''), invoice_number),
    delivered_at = coalesce(p_date, current_date)
  where id = any (p_ids);
  perform set_config('app.fleet_event', '', true);
  return cid;
end $$;

-- retour en stock Hexa-AI (retour client, RMA, revente) : le journal garde l'ancien client et la facture
create or replace function public.fleet_to_stock(p_ids uuid[], p_status text, p_note text default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare hexa uuid; n integer;
begin
  if not is_hexa_staff_admin() then raise exception 'réservé aux admins Hexa-AI' using errcode = '42501'; end if;
  if p_status not in ('stock', 'return', 'scrapped') then raise exception 'statut invalide'; end if;
  select id into hexa from companies where is_hexa_internal order by created_at limit 1;
  perform set_config('app.fleet_event', p_status, true);
  perform set_config('app.fleet_note', coalesce(p_note, ''), true);
  update devices set company_id = hexa, project_id = null, fleet_status = p_status,
    invoice_number = null, delivered_at = null
  where id = any (p_ids);
  get diagnostics n = row_count;
  perform set_config('app.fleet_event', '', true);
  perform set_config('app.fleet_note', '', true);
  return n;
end $$;

-- import / annulation : mise à jour de champs descriptifs uniquement, tout ou rien
create or replace function public.fleet_apply(p_rows jsonb, p_kind text default 'import')
returns integer
language plpgsql security definer set search_path = public as $$
declare r jsonb; n integer := 0; k text;
  allowed text[] := array['name', 'serial_number', 'mac_eth0', 'invoice_number', 'delivered_at',
    'warranty_months', 'received_at', 'supplier', 'purchase_ref', 'fleet_note'];
begin
  if not is_hexa_staff_admin() then raise exception 'réservé aux admins Hexa-AI' using errcode = '42501'; end if;
  if p_kind not in ('import', 'revert') then raise exception 'type invalide'; end if;
  perform set_config('app.fleet_event', p_kind, true);
  for r in select * from jsonb_array_elements(p_rows) loop
    for k in select jsonb_object_keys(r) loop
      if k <> 'id' and not k = any (allowed) then raise exception 'champ non modifiable : %', k; end if;
    end loop;
    if not exists (select 1 from devices where id = (r ->> 'id')::uuid) then
      raise exception 'box inconnue : %', r ->> 'id';
    end if;
    update devices set
      name = case when r ? 'name' then coalesce(nullif(btrim(r ->> 'name'), ''), name) else name end,
      serial_number = case when r ? 'serial_number' then r ->> 'serial_number' else serial_number end,
      mac_eth0 = case when r ? 'mac_eth0' then r ->> 'mac_eth0' else mac_eth0 end,
      invoice_number = case when r ? 'invoice_number' then r ->> 'invoice_number' else invoice_number end,
      delivered_at = case when r ? 'delivered_at' then nullif(r ->> 'delivered_at', '')::date else delivered_at end,
      warranty_months = case when r ? 'warranty_months' then nullif(r ->> 'warranty_months', '')::integer else warranty_months end,
      received_at = case when r ? 'received_at' then nullif(r ->> 'received_at', '')::date else received_at end,
      supplier = case when r ? 'supplier' then nullif(btrim(r ->> 'supplier'), '') else supplier end,
      purchase_ref = case when r ? 'purchase_ref' then nullif(btrim(r ->> 'purchase_ref'), '') else purchase_ref end,
      fleet_note = case when r ? 'fleet_note' then nullif(btrim(r ->> 'fleet_note'), '') else fleet_note end
    where id = (r ->> 'id')::uuid;
    n := n + 1;
  end loop;
  perform set_config('app.fleet_event', '', true);
  return n;
end $$;

revoke all on function public.fleet_deliver(uuid[], uuid, text, text, date, uuid) from public, anon;
revoke all on function public.fleet_to_stock(uuid[], text, text) from public, anon;
revoke all on function public.fleet_apply(jsonb, text) from public, anon;
grant execute on function public.fleet_deliver(uuid[], uuid, text, text, date, uuid) to authenticated;
grant execute on function public.fleet_to_stock(uuid[], text, text) to authenticated;
grant execute on function public.fleet_apply(jsonb, text) to authenticated;
