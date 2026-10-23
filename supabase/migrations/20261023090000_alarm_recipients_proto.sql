-- PROTOTYPE (myHexa-test uniquement tant que non validé) — destinataires d'alarme & escalade pilotés depuis le portail.
-- Modèle : ~/suivi/projets/myhexa_support/destinataires_alarme_modele.md
-- Principe : le portail stocke l'état VOULU ; la box rapporte l'état CONSTATÉ (bloc notifications du status) ;
-- un écart se résout par une commande set_recipients / set_escalation servie au push status suivant.

-- ---------------------------------------------------------------------------------------------
-- 1. Annuaire des contacts d'alarme d'une entreprise (≠ utilisateurs du portail, lien optionnel)
create table public.alarm_contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 128),
  email text not null default '' check (char_length(email) <= 254),
  phone text not null default '' check (char_length(phone) <= 32),
  enabled boolean not null default true,
  -- profil par défaut, appliqué à toutes ses box (exception possible par box)
  channels jsonb not null default '{"email": true, "sms": false, "call": false}'::jsonb,
  schedule_days text[] not null default array['monday','tuesday','wednesday','thursday','friday','saturday','sunday'],
  recipient_id uuid references public.recipients(id) on delete set null, -- compte portail éventuel
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index alarm_contacts_company_idx on public.alarm_contacts (company_id);

-- 2. Abonnements : tel contact reçoit tels types d'alarme de telle box
--    box_recipient_id = l'id (8 hex) du destinataire SUR CETTE BOX. On réutilise l'id existant à l'import :
--    en changer ferait supprimer le destinataire de la box et le retirerait de ses niveaux d'escalade.
create table public.alarm_subscriptions (
  contact_id uuid not null references public.alarm_contacts(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,
  box_recipient_id text not null default substr(md5(gen_random_uuid()::text), 1, 8)
    check (box_recipient_id ~ '^[0-9a-f]{8}$'),
  filters jsonb not null default '{"info": false, "warning": true, "error": true}'::jsonb,
  channels_override jsonb,
  schedule_days_override text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (contact_id, device_id),
  unique (device_id, box_recipient_id)
);
create index alarm_subscriptions_device_idx on public.alarm_subscriptions (device_id);

-- 3. Chaîne d'escalade voulue, par box (format set_escalation, sans runs)
create table public.device_escalation (
  device_id uuid primary key references public.devices(id) on delete cascade,
  config jsonb not null,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

-- 4. File de commandes vers les box (schéma du doc firmware + created_by pour l'audit)
create type public.device_command_state as enum ('queued', 'sent', 'in_progress', 'acked', 'failed', 'cancelled');
create table public.device_commands (
  id text primary key check (id ~ '^[A-Za-z0-9_.:-]{8,64}$'),
  device_id uuid not null references public.devices(id) on delete cascade,
  type text not null check (type in ('set_recipients', 'set_escalation', 'run_update', 'reboot', 'send_snapshot')),
  payload jsonb not null default '{}'::jsonb,
  state public.device_command_state not null default 'queued',
  issued_at timestamptz not null default clock_timestamp(), -- clock_timestamp : ordre conservé dans une même transaction
  sent_at timestamptz,
  acked_at timestamptz,
  ack_status text,
  ack_detail text,
  created_by uuid default auth.uid()
);
create index device_commands_pending_idx on public.device_commands (device_id, state, issued_at);

-- 5. État constaté sur la box (rempli par device-ingress à chaque status portant le bloc remote)
alter table public.devices
  add column remote_protocol integer,
  add column remote_seen_at timestamptz,
  add column running_version text,
  add column pkg_version text,
  add column candidate_version text,
  add column reboot_required boolean,
  add column recipients_hash text,
  add column escalation_hash text,
  -- hash constaté au moment où le portail a pris la main (import ou envoi accepté) :
  -- s'il diffère du hash courant, la liste a été modifiée sur la box.
  add column recipients_hash_ref text,
  add column escalation_hash_ref text;

-- ---------------------------------------------------------------------------------------------
-- RLS : lecture = entreprise du user ou staff ; écriture = admin de l'entreprise ou staff admin
alter table public.alarm_contacts enable row level security;
alter table public.alarm_subscriptions enable row level security;
alter table public.device_escalation enable row level security;
alter table public.device_commands enable row level security;

create or replace function public.can_manage_company(p_company uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (p_company = current_recipient_company_id() and current_recipient_is_admin()) or is_hexa_staff_admin()
$$;

create policy alarm_contacts_select on public.alarm_contacts for select
  using (company_id = current_recipient_company_id() or is_hexa_staff());
create policy alarm_contacts_write on public.alarm_contacts for all
  using (can_manage_company(company_id)) with check (can_manage_company(company_id));

create policy alarm_subscriptions_select on public.alarm_subscriptions for select
  using (is_device_visible(device_id));
create policy alarm_subscriptions_write on public.alarm_subscriptions for all
  using (exists (select 1 from alarm_contacts c join devices d on d.company_id = c.company_id
                 where c.id = contact_id and d.id = device_id and can_manage_company(c.company_id)))
  with check (exists (select 1 from alarm_contacts c join devices d on d.company_id = c.company_id
                      where c.id = contact_id and d.id = device_id and can_manage_company(c.company_id)));

create policy device_escalation_select on public.device_escalation for select using (is_device_visible(device_id));
create policy device_escalation_write on public.device_escalation for all
  using (exists (select 1 from devices d where d.id = device_id and can_manage_company(d.company_id)))
  with check (exists (select 1 from devices d where d.id = device_id and can_manage_company(d.company_id)));

-- les commandes ne s'écrivent que via les fonctions ci-dessous (security definer, droits vérifiés)
create policy device_commands_select on public.device_commands for select using (is_device_visible(device_id));

-- ---------------------------------------------------------------------------------------------
-- Dernière config constatée (bloc notifications du dernier status)
create or replace function public.alarm_reported_config(p_device uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select r.payload -> 'notifications' from reports r
  where r.device_id = p_device and r.type = 'status'
$$;

-- Liste voulue, au format exact de set_recipients
create or replace function public.alarm_desired_recipients(p_device uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  -- Téléphone masqué par la box (« +336****1814 ») : on OMET la clé phone. set_recipients fusionne par id,
  -- un champ absent conserve sa valeur locale -> on n'écrase pas le vrai numéro par sa version masquée.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.box_recipient_id,
           'name', c.name,
           'email', c.email,
           'enabled', c.enabled,
           'filters', s.filters,
           'channels', coalesce(s.channels_override, c.channels),
           'schedule_days', to_jsonb(coalesce(s.schedule_days_override, c.schedule_days))
         ) || case when position('*' in c.phone) > 0 then '{}'::jsonb else jsonb_build_object('phone', c.phone) end
         order by c.name), '[]'::jsonb)
  from alarm_subscriptions s join alarm_contacts c on c.id = s.contact_id
  where s.device_id = p_device
$$;

-- Import : reprend dans l'annuaire ce que les box d'une entreprise ont déjà (dédoublonnage email > téléphone > nom)
create or replace function public.import_alarm_config(p_company uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d record; r jsonb; v_contact uuid; v_contacts int := 0; v_subs int := 0; v_devices int := 0;
  v_channels jsonb; v_days text[];
begin
  if not can_manage_company(p_company) then raise exception 'forbidden'; end if;
  for d in
    select dv.id, dv.recipients_hash, dv.escalation_hash, rp.payload -> 'notifications' as notif
    from devices dv join reports rp on rp.device_id = dv.id and rp.type = 'status'
    where dv.company_id = p_company and rp.payload ? 'notifications'
  loop
    v_devices := v_devices + 1;
    for r in select * from jsonb_array_elements(coalesce(d.notif -> 'recipients', '[]'::jsonb)) loop
      select c.id into v_contact from alarm_contacts c
      where c.company_id = p_company and (
        (nullif(r ->> 'email', '') is not null and lower(c.email) = lower(r ->> 'email'))
        or (nullif(r ->> 'phone', '') is not null and regexp_replace(c.phone, '\D', '', 'g') = regexp_replace(r ->> 'phone', '\D', '', 'g'))
        -- la box masque parfois le numéro (« +336****1814 ») : même nom + 4 derniers chiffres
        or (lower(c.name) = lower(r ->> 'name') and right(regexp_replace(c.phone, '\D', '', 'g'), 4) = right(regexp_replace(coalesce(r ->> 'phone', ''), '\D', '', 'g'), 4))
        or (nullif(r ->> 'email', '') is null and nullif(r ->> 'phone', '') is null and lower(c.name) = lower(r ->> 'name')))
      order by (position('*' in c.phone) > 0)
      limit 1;
      -- on garde le numéro en clair s'il apparaît sur une autre box
      if v_contact is not null and position('*' in coalesce(r ->> 'phone', '*')) = 0 then
        update alarm_contacts set phone = r ->> 'phone' where id = v_contact and position('*' in phone) > 0;
      end if;
      v_channels := r -> 'channels';
      v_days := array(select jsonb_array_elements_text(coalesce(r -> 'schedule_days', '[]'::jsonb)));
      if v_contact is null then
        insert into alarm_contacts (company_id, name, email, phone, enabled, channels, schedule_days, recipient_id)
        values (p_company, coalesce(nullif(r ->> 'name', ''), 'Sans nom'), coalesce(r ->> 'email', ''),
                coalesce(r ->> 'phone', ''), coalesce((r ->> 'enabled')::boolean, true),
                coalesce(v_channels, '{"email": true, "sms": false, "call": false}'::jsonb), v_days,
                (select rc.id from recipients rc where rc.company_id = p_company and nullif(r ->> 'email', '') is not null
                   and lower(rc.contact_email) = lower(r ->> 'email') limit 1))
        returning id into v_contact;
        v_contacts := v_contacts + 1;
      end if;
      insert into alarm_subscriptions (contact_id, device_id, box_recipient_id, filters, channels_override, schedule_days_override)
      select v_contact, d.id, r ->> 'id', coalesce(r -> 'filters', '{"info": false, "warning": true, "error": true}'::jsonb),
             case when v_channels is distinct from c.channels then v_channels end,
             case when v_days is distinct from c.schedule_days then v_days end
      from alarm_contacts c where c.id = v_contact
      on conflict (contact_id, device_id) do nothing;
      if found then v_subs := v_subs + 1; end if;
    end loop;
    if d.notif -> 'escalation' is not null and jsonb_array_length(coalesce(d.notif -> 'escalation' -> 'levels', '[]')) > 0 then
      insert into device_escalation (device_id, config, updated_by)
      values (d.id, (d.notif -> 'escalation') - 'runs' || jsonb_build_object('mode', d.notif ->> 'mode'), auth.uid())
      on conflict (device_id) do nothing;
    end if;
    update devices set recipients_hash_ref = recipients_hash, escalation_hash_ref = escalation_hash where id = d.id;
  end loop;
  return jsonb_build_object('devices', v_devices, 'contacts_created', v_contacts, 'subscriptions_created', v_subs);
end;
$$;

-- Met en file un set_recipients (et set_escalation si une chaîne est définie) construit depuis l'état voulu.
-- Refuse si la liste a été modifiée sur la box depuis la dernière prise en main (sauf p_force).
create or replace function public.queue_alarm_sync(p_device uuid, p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_company uuid; v_hash text; v_ref text; v_list jsonb; v_cmd text; v_esc jsonb; v_esc_cmd text;
begin
  select company_id, recipients_hash, recipients_hash_ref into v_company, v_hash, v_ref from devices where id = p_device;
  if v_company is null or not can_manage_company(v_company) then raise exception 'forbidden'; end if;
  if not p_force and v_ref is not null and v_hash is distinct from v_ref then
    return jsonb_build_object('status', 'conflict', 'detail', 'liste modifiée sur la box depuis la dernière synchro');
  end if;
  v_list := alarm_desired_recipients(p_device);
  if jsonb_array_length(v_list) = 0 then
    -- le firmware refuse une liste vide : supprimer le dernier destinataire reste une action locale
    return jsonb_build_object('status', 'refused', 'detail', 'liste vide : le boîtier la refuserait');
  end if;
  -- une seule commande en attente par type : on remplace l'ancienne
  update device_commands set state = 'cancelled'
  where device_id = p_device and type in ('set_recipients', 'set_escalation') and state = 'queued';
  v_cmd := 'cmd_' || replace(gen_random_uuid()::text, '-', '');
  insert into device_commands (id, device_id, type, payload) values (v_cmd, p_device, 'set_recipients', jsonb_build_object('recipients', v_list));
  select config into v_esc from device_escalation where device_id = p_device;
  if v_esc is not null then
    v_esc_cmd := 'cmd_' || replace(gen_random_uuid()::text, '-', '');
    insert into device_commands (id, device_id, type, payload) values (v_esc_cmd, p_device, 'set_escalation', v_esc - 'runs');
  end if;
  return jsonb_build_object('status', 'queued', 'set_recipients', v_cmd, 'set_escalation', v_esc_cmd);
end;
$$;

-- Demande d'état frais (aucun effet sur la box hors un push status immédiat)
create or replace function public.queue_send_snapshot(p_device uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_company uuid; v_cmd text;
begin
  select company_id into v_company from devices where id = p_device;
  if v_company is null or not can_manage_company(v_company) then raise exception 'forbidden'; end if;
  v_cmd := 'cmd_' || replace(gen_random_uuid()::text, '-', '');
  insert into device_commands (id, device_id, type) values (v_cmd, p_device, 'send_snapshot');
  return v_cmd;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Côté box (appelé par device-ingress, service_role) : ingère remote (état + acks) et sert les commandes.
create or replace function public.ingest_remote(p_token text, p_remote jsonb, p_running_version text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_device uuid; a jsonb; st jsonb := p_remote -> 'state'; v_cmds jsonb; v_type text;
begin
  select id into v_device from devices where token = p_token limit 1;
  if v_device is null then return '[]'::jsonb; end if;

  update devices set
    remote_protocol = (p_remote ->> 'protocol')::int,
    remote_seen_at = now(),
    running_version = coalesce(p_running_version, running_version),
    pkg_version = st -> 'update' ->> 'installed',
    candidate_version = st -> 'update' ->> 'candidate',
    reboot_required = (st -> 'update' ->> 'reboot_required')::boolean,
    recipients_hash = st ->> 'recipients_hash',
    escalation_hash = st ->> 'escalation_hash'
  where id = v_device;

  for a in select * from jsonb_array_elements(coalesce(p_remote -> 'acks', '[]'::jsonb)) loop
    update device_commands set
      state = case when a ->> 'status' = 'pending' then 'in_progress'::device_command_state
                   when a ->> 'status' in ('ok', 'duplicate') then 'acked'::device_command_state
                   else 'failed'::device_command_state end,
      acked_at = now(), ack_status = a ->> 'status', ack_detail = left(a ->> 'detail', 512)
    where id = a ->> 'id' and device_id = v_device and state <> 'cancelled'
    returning type into v_type;
    -- liste acceptée par la box : le hash courant devient la référence (fait au push suivant via hash_ref)
    if found and a ->> 'status' = 'ok' and v_type = 'set_recipients' then
      update devices set recipients_hash_ref = null where id = v_device;
    end if;
    if found and a ->> 'status' = 'ok' and v_type = 'set_escalation' then
      update devices set escalation_hash_ref = null where id = v_device;
    end if;
  end loop;
  -- référence vide = on reprend le hash constaté (après import manquant ou après un ok)
  update devices set recipients_hash_ref = coalesce(recipients_hash_ref, recipients_hash),
                     escalation_hash_ref = coalesce(escalation_hash_ref, escalation_hash)
  where id = v_device;

  with picked as (
    update device_commands set state = 'sent', sent_at = now()
    where id in (
      select id from device_commands
      where device_id = v_device
        and (state = 'queued' or (state = 'sent' and sent_at < now() - interval '60 minutes'))
      order by issued_at, id limit 10)
    returning id, type, payload, issued_at
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'type', type, 'payload', payload, 'issued_at', issued_at) order by issued_at, id), '[]'::jsonb)
  into v_cmds from picked;
  return v_cmds;
end;
$$;

revoke all on function public.ingest_remote(text, jsonb, text) from public, anon, authenticated;
grant execute on function public.ingest_remote(text, jsonb, text) to service_role;
revoke all on function public.import_alarm_config(uuid) from public, anon;
revoke all on function public.queue_alarm_sync(uuid, boolean) from public, anon;
revoke all on function public.queue_send_snapshot(uuid) from public, anon;
grant execute on function public.import_alarm_config(uuid), public.queue_alarm_sync(uuid, boolean), public.queue_send_snapshot(uuid) to authenticated;
grant select, insert, update, delete on public.alarm_contacts, public.alarm_subscriptions, public.device_escalation to authenticated;
grant select on public.device_commands to authenticated;
