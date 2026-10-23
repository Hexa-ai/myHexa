-- PROTOTYPE (myHexa-test uniquement tant que non validé) — destinataires d'alarme & escalade pilotés depuis le portail.
-- Modèle : ~/suivi/projets/myhexa_support/destinataires_alarme_modele.md
-- Principe : le portail stocke l'état VOULU ; la box rapporte l'état CONSTATÉ (bloc notifications du status) ;
-- un écart se résout par une commande set_recipients / set_escalation servie au push status suivant.
--
-- v3 : UNE SEULE LISTE DE PERSONNES. La table recipients (utilisateurs / destinataires du portail) porte aussi
-- les réglages d'alarme. Une personne peut avoir l'accès portail, recevoir des alarmes de box, ou les deux.
-- portal_access = false : personne « alarmes seulement » (ex. portable d'astreinte) — ni compte, ni mails du portail.
--
-- Canaux : UNE source de vérité par personne et par box (alarm_channels, ou channels_override sur la box).
-- Dans l'escalade, un membre suit ces mêmes canaux, sauf exception explicite (member_channels stocké = exceptions
-- seulement) ; le portail envoie à la box une chaîne « résolue » où chaque membre a ses canaux explicites.

-- ---------------------------------------------------------------------------------------------
-- 1. Personnes : réglages d'alarme sur recipients
alter table public.recipients
  add column portal_access boolean not null default true,
  add column alarm_enabled boolean not null default true,
  add column alarm_channels jsonb not null default '{"email": true, "sms": false, "call": false}'::jsonb,
  add column alarm_schedule_days text[] not null
    default array['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
-- une personne « alarmes seulement » n'a pas de compte ; une personne avec accès portail en a toujours un
alter table public.recipients alter column auth_user_id drop not null;
alter table public.recipients add constraint recipients_portal_access_account
  check (not portal_access or auth_user_id is not null);
comment on column public.recipients.portal_access is
  'false = personne « alarmes de box seulement » : pas de compte, exclue des mails du portail (rapports, connectivité)';

-- 2. Abonnements : telle personne reçoit tels types d'alarme de telle box
--    box_recipient_id = l'id (8 hex) du destinataire SUR CETTE BOX. On réutilise l'id existant à l'import :
--    en changer ferait supprimer le destinataire de la box et le retirerait de ses niveaux d'escalade.
create table public.alarm_subscriptions (
  recipient_id uuid not null references public.recipients(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,
  box_recipient_id text not null default substr(md5(gen_random_uuid()::text), 1, 8)
    check (box_recipient_id ~ '^[0-9a-f]{8}$'),
  filters jsonb not null default '{"info": false, "warning": true, "error": true}'::jsonb,
  channels_override jsonb,
  schedule_days_override text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (recipient_id, device_id),
  unique (device_id, box_recipient_id)
);
create index alarm_subscriptions_device_idx on public.alarm_subscriptions (device_id);

-- 3. Chaîne d'escalade voulue, par box (format set_escalation, sans runs ; member_channels = exceptions seulement)
--    baseline = ce que la box applique (forme résolue : import, ou dernier set_escalation acquitté ok).
--    résolu(config) ≠ baseline -> « à envoyer » ; on n'envoie que les clés modifiées, et levels seulement
--    s'il a changé (levels REMPLACE la chaîne côté boîtier, cf. doc firmware).
create table public.device_escalation (
  device_id uuid primary key references public.devices(id) on delete cascade,
  config jsonb not null,
  baseline jsonb,
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
-- (recipients garde ses policies existantes : même règle)
alter table public.alarm_subscriptions enable row level security;
alter table public.device_escalation enable row level security;
alter table public.device_commands enable row level security;

create or replace function public.can_manage_company(p_company uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (p_company = current_recipient_company_id() and current_recipient_is_admin()) or is_hexa_staff_admin()
$$;

create policy alarm_subscriptions_select on public.alarm_subscriptions for select
  using (is_device_visible(device_id));
create policy alarm_subscriptions_write on public.alarm_subscriptions for all
  using (exists (select 1 from recipients r join devices d on d.company_id = r.company_id
                 where r.id = recipient_id and d.id = device_id and can_manage_company(r.company_id)))
  with check (exists (select 1 from recipients r join devices d on d.company_id = r.company_id
                      where r.id = recipient_id and d.id = device_id and can_manage_company(r.company_id)));

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

-- Canaux d'une personne sur une box (exception box, sinon sa fiche) ; null si pas destinataire de la box
create or replace function public.alarm_member_channels(p_device uuid, p_box_id text)
returns jsonb language sql stable security invoker set search_path = public as $$
  select coalesce(s.channels_override, r.alarm_channels)
  from alarm_subscriptions s join recipients r on r.id = s.recipient_id
  where s.device_id = p_device and s.box_recipient_id = p_box_id
$$;

-- Chaîne « résolue » : chaque membre reçoit des canaux explicites (exception d'escalade, sinon ses canaux).
-- p_config null = la config stockée de la box.
create or replace function public.alarm_resolve_escalation(p_device uuid, p_config jsonb default null)
returns jsonb language sql stable security invoker set search_path = public as $$
  with c as (select coalesce(p_config, (select config from device_escalation where device_id = p_device)) - 'runs' as cfg)
  select case when not (cfg ? 'levels') then cfg else
    cfg || jsonb_build_object('levels', coalesce((
      select jsonb_agg(l || jsonb_build_object('member_channels', coalesce((
               select jsonb_object_agg(m, coalesce(l -> 'member_channels' -> m, alarm_member_channels(p_device, m), l -> 'channels'))
               from jsonb_array_elements_text(l -> 'members') m), '{}'::jsonb))
             order by ord)
      from jsonb_array_elements(cfg -> 'levels') with ordinality x(l, ord)), '[]'::jsonb))
  end from c
$$;

-- Liste voulue, au format exact de set_recipients
create or replace function public.alarm_desired_recipients(p_device uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  -- Téléphone masqué par la box (« +336****1814 ») : on OMET la clé phone. set_recipients fusionne par id,
  -- un champ absent conserve sa valeur locale -> on n'écrase pas le vrai numéro par sa version masquée.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.box_recipient_id,
           'name', r.name,
           'email', coalesce(r.contact_email, ''),
           'enabled', r.alarm_enabled,
           'filters', s.filters,
           'channels', coalesce(s.channels_override, r.alarm_channels),
           'schedule_days', to_jsonb(coalesce(s.schedule_days_override, r.alarm_schedule_days))
         ) || case when position('*' in coalesce(r.phone, '')) > 0 then '{}'::jsonb
                   else jsonb_build_object('phone', coalesce(r.phone, '')) end
         order by r.name), '[]'::jsonb)
  from alarm_subscriptions s join recipients r on r.id = s.recipient_id
  where s.device_id = p_device
$$;

-- Import : reprend dans la liste des personnes ce que les box d'une entreprise ont déjà.
-- Appariement email > téléphone > nom + 4 derniers chiffres > nom ; sinon nouvelle personne « alarmes seulement ».
create or replace function public.import_alarm_config(p_company uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d record; r jsonb; v_person uuid; v_people int := 0; v_subs int := 0; v_devices int := 0;
  v_channels jsonb; v_days text[]; v_raw jsonb; v_cfg jsonb; v_base jsonb;
begin
  if not can_manage_company(p_company) then raise exception 'forbidden'; end if;
  for d in
    select dv.id, dv.recipients_hash, dv.escalation_hash, rp.payload -> 'notifications' as notif
    from devices dv join reports rp on rp.device_id = dv.id and rp.type = 'status'
    where dv.company_id = p_company and rp.payload ? 'notifications'
  loop
    v_devices := v_devices + 1;
    for r in select * from jsonb_array_elements(coalesce(d.notif -> 'recipients', '[]'::jsonb)) loop
      select p.id into v_person from recipients p
      where p.company_id = p_company and (
        (nullif(r ->> 'email', '') is not null and lower(p.contact_email) = lower(r ->> 'email'))
        or (nullif(r ->> 'phone', '') is not null and position('*' in r ->> 'phone') = 0
            and regexp_replace(coalesce(p.phone, ''), '\D', '', 'g') = regexp_replace(r ->> 'phone', '\D', '', 'g'))
        -- la box masque parfois le numéro (« +336****1814 ») : même nom + 4 derniers chiffres
        or (lower(p.name) = lower(r ->> 'name') and nullif(r ->> 'phone', '') is not null
            and right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 4) = right(regexp_replace(r ->> 'phone', '\D', '', 'g'), 4))
        or (nullif(r ->> 'email', '') is null and nullif(r ->> 'phone', '') is null and lower(p.name) = lower(r ->> 'name')))
      order by p.portal_access desc, (position('*' in coalesce(p.phone, '')) > 0)
      limit 1;
      v_channels := coalesce(r -> 'channels', '{"email": true, "sms": false, "call": false}'::jsonb);
      v_days := array(select jsonb_array_elements_text(coalesce(r -> 'schedule_days', '[]'::jsonb)));
      if v_person is null then
        insert into recipients (company_id, name, contact_email, phone, role, portal_access,
                                alarm_enabled, alarm_channels, alarm_schedule_days)
        values (p_company, coalesce(nullif(r ->> 'name', ''), 'Sans nom'), nullif(r ->> 'email', ''),
                nullif(r ->> 'phone', ''), 'viewer', false,
                coalesce((r ->> 'enabled')::boolean, true), v_channels, v_days)
        returning id into v_person;
        v_people := v_people + 1;
      else
        -- numéro en clair s'il apparaît sur une autre box ; téléphone ajouté s'il manquait
        if nullif(r ->> 'phone', '') is not null then
          update recipients set phone = r ->> 'phone'
          where id = v_person and (nullif(phone, '') is null
                                   or (position('*' in phone) > 0 and position('*' in r ->> 'phone') = 0));
        end if;
        -- première box où on la trouve : ses réglages deviennent ceux de sa fiche
        if not exists (select 1 from alarm_subscriptions where recipient_id = v_person) then
          update recipients set alarm_channels = v_channels, alarm_schedule_days = v_days,
                                alarm_enabled = coalesce((r ->> 'enabled')::boolean, true)
          where id = v_person;
        end if;
      end if;
      insert into alarm_subscriptions (recipient_id, device_id, box_recipient_id, filters, channels_override, schedule_days_override)
      select v_person, d.id, r ->> 'id', coalesce(r -> 'filters', '{"info": false, "warning": true, "error": true}'::jsonb),
             case when v_channels is distinct from p.alarm_channels then v_channels end,
             case when v_days is distinct from p.alarm_schedule_days then v_days end
      from recipients p where p.id = v_person
      on conflict (recipient_id, device_id) do nothing;
      if found then v_subs := v_subs + 1; end if;
    end loop;
    if jsonb_array_length(coalesce(d.notif -> 'escalation' -> 'levels', '[]')) > 0 then
      v_raw := (d.notif -> 'escalation') - 'runs' || jsonb_build_object('mode', d.notif ->> 'mode');
      -- baseline : la chaîne de la box, chaque membre avec ses canaux effectifs (exception, sinon canaux du niveau)
      v_base := v_raw || jsonb_build_object('levels', (
        select jsonb_agg(l || jsonb_build_object('member_channels', coalesce((
                 select jsonb_object_agg(m, coalesce(l -> 'member_channels' -> m, l -> 'channels'))
                 from jsonb_array_elements_text(l -> 'members') m), '{}'::jsonb)) order by ord)
        from jsonb_array_elements(v_raw -> 'levels') with ordinality x(l, ord)));
      -- config portail : ne garde en exception que les canaux qui diffèrent de ceux de la personne sur la box
      v_cfg := v_base || jsonb_build_object('levels', (
        select jsonb_agg(l || jsonb_build_object('member_channels', coalesce((
                 select jsonb_object_agg(k, v) from jsonb_each(l -> 'member_channels') e(k, v)
                 where v is distinct from alarm_member_channels(d.id, k)), '{}'::jsonb)) order by ord)
        from jsonb_array_elements(v_base -> 'levels') with ordinality x(l, ord)));
      insert into device_escalation (device_id, config, baseline, updated_by)
      values (d.id, v_cfg, v_base, auth.uid())
      on conflict (device_id) do nothing;
    end if;
    update devices set recipients_hash_ref = recipients_hash, escalation_hash_ref = escalation_hash where id = d.id;
  end loop;
  return jsonb_build_object('devices', v_devices, 'people_created', v_people, 'subscriptions_created', v_subs);
end;
$$;

-- Met en file ce qui a changé dans le portail pour une box :
--   p_recipients : set_recipients (liste complète, fusion par id côté boîtier)
--   escalade     : set_escalation différentiel si résolu(config) ≠ baseline (validée avant envoi)
-- Refuse si la box a été modifiée localement depuis la dernière prise en main (sauf p_force).
create or replace function public.queue_alarm_sync(p_device uuid, p_force boolean default false, p_recipients boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_company uuid; v_hash text; v_ref text; v_ehash text; v_eref text;
  v_list jsonb; v_cmd text; v_esc jsonb; v_base jsonb; v_payload jsonb; v_esc_cmd text; v_ids text[]; v_bad text;
begin
  select company_id, recipients_hash, recipients_hash_ref, escalation_hash, escalation_hash_ref
    into v_company, v_hash, v_ref, v_ehash, v_eref from devices where id = p_device;
  if v_company is null or not can_manage_company(v_company) then raise exception 'forbidden'; end if;

  select alarm_resolve_escalation(p_device, config), baseline into v_esc, v_base
  from device_escalation where device_id = p_device;
  if v_esc is not null and v_esc is distinct from v_base then
    if v_base is null or (v_esc -> 'levels') is distinct from (v_base -> 'levels') then
      v_payload := v_esc;
    else
      select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into v_payload
      from jsonb_each(v_esc) as e(k, v) where v is distinct from (v_base -> k);
    end if;
  end if;

  if not p_recipients and v_payload is null then
    return jsonb_build_object('status', 'nothing', 'detail', 'rien à envoyer');
  end if;
  if not p_force and p_recipients and v_ref is not null and v_hash is distinct from v_ref then
    return jsonb_build_object('status', 'conflict', 'detail', 'liste des destinataires modifiée sur la box depuis la dernière synchro');
  end if;
  if not p_force and v_payload is not null and v_eref is not null and v_ehash is distinct from v_eref then
    return jsonb_build_object('status', 'conflict', 'detail', 'escalade modifiée sur la box depuis la dernière synchro');
  end if;

  -- validation de l'escalade (mêmes règles que le boîtier, pour refuser avant d'envoyer)
  if v_payload ? 'levels' then
    v_ids := array(select box_recipient_id from alarm_subscriptions where device_id = p_device);
    if exists (select 1 from jsonb_array_elements(v_payload -> 'levels') l
               where jsonb_array_length(coalesce(l -> 'members', '[]')) = 0) then
      return jsonb_build_object('status', 'refused', 'detail', 'un niveau d''escalade n''a aucun membre');
    end if;
    select m into v_bad from jsonb_array_elements(v_payload -> 'levels') l, jsonb_array_elements_text(l -> 'members') m
    where m <> all (v_ids) limit 1;
    if v_bad is not null then
      return jsonb_build_object('status', 'refused', 'detail', 'un membre de l''escalade n''est plus destinataire de la box (' || v_bad || ')');
    end if;
    -- (canaux définis pour un non-membre : écartés par alarm_resolve_escalation, rien à refuser)
  end if;

  if p_recipients then
    v_list := alarm_desired_recipients(p_device);
    if jsonb_array_length(v_list) = 0 then
      -- le firmware refuse une liste vide : supprimer le dernier destinataire reste une action locale
      return jsonb_build_object('status', 'refused', 'detail', 'liste vide : le boîtier la refuserait');
    end if;
  end if;

  -- une seule commande en attente par type : on remplace l'ancienne
  update device_commands set state = 'cancelled'
  where device_id = p_device and state = 'queued'
    and ((p_recipients and type = 'set_recipients') or (v_payload is not null and type = 'set_escalation'));
  -- ordre : la liste d'abord (les membres de l'escalade doivent exister sur la box)
  if p_recipients then
    v_cmd := 'cmd_' || replace(gen_random_uuid()::text, '-', '');
    insert into device_commands (id, device_id, type, payload) values (v_cmd, p_device, 'set_recipients', jsonb_build_object('recipients', v_list));
  end if;
  if v_payload is not null then
    v_esc_cmd := 'cmd_' || replace(gen_random_uuid()::text, '-', '');
    insert into device_commands (id, device_id, type, payload) values (v_esc_cmd, p_device, 'set_escalation', v_payload);
  end if;
  return jsonb_build_object('status', 'queued', 'set_recipients', v_cmd, 'set_escalation', v_esc_cmd, 'escalation_payload', v_payload);
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
  v_device uuid; a jsonb; st jsonb := p_remote -> 'state'; v_cmds jsonb; v_type text; v_payload jsonb;
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
    returning type, payload into v_type, v_payload;
    -- liste acceptée par la box : le hash courant devient la référence (fait au push suivant via hash_ref)
    if found and a ->> 'status' = 'ok' and v_type = 'set_recipients' then
      update devices set recipients_hash_ref = null where id = v_device;
    end if;
    if found and a ->> 'status' = 'ok' and v_type = 'set_escalation' then
      update devices set escalation_hash_ref = null where id = v_device;
      -- la box applique désormais ces clés : elles rejoignent la référence
      update device_escalation set baseline = coalesce(baseline, '{}'::jsonb) || v_payload where device_id = v_device;
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
revoke all on function public.queue_alarm_sync(uuid, boolean, boolean) from public, anon;
revoke all on function public.queue_send_snapshot(uuid) from public, anon;
grant execute on function public.import_alarm_config(uuid), public.queue_alarm_sync(uuid, boolean, boolean),
  public.queue_send_snapshot(uuid), public.alarm_resolve_escalation(uuid, jsonb) to authenticated;
grant select, insert, update, delete on public.alarm_subscriptions, public.device_escalation to authenticated;
grant select on public.device_commands to authenticated;
