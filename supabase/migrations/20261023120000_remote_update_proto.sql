-- PROTOTYPE (myHexa-test uniquement) — mise à jour du firmware des box à distance.
-- Firmware hai-pxxx-ai >= 1.3.7 (docs/remote-commands.md §9 run_update / reboot) :
--  * run_update {version|null, reboot} : acquitte 3 fois (pending « installation started », pending
--    « installed, waiting for reboot », ok « 1.3.6-i12 -> 1.3.7-i3 »), ~1 à 2 h au total ;
--  * pas de downgrade ; refusé si une installation tourne, si un reboot est attendu, ou < 1 h après la précédente ;
--  * reboot {delay_seconds 5..300} : refusé pendant une installation, 1 par heure.
-- Autorisé aux admins de l'entreprise de la box et au staff Hexa-AI admin (can_manage_company) ;
-- une mise à jour redémarre la box (supervision coupée quelques minutes).

alter table public.devices add column if not exists update_running boolean;

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
    update_running = (st -> 'update' ->> 'install_running')::boolean,
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

create or replace function public.queue_run_update(p_device uuid, p_version text default null, p_reboot boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d record; v_cmd text; v_recent timestamptz;
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
  if d.candidate_version is null then
    return jsonb_build_object('status', 'refused', 'detail', 'aucune version plus récente proposée à la box (déjà à jour)');
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
  return jsonb_build_object('status', 'queued', 'id', v_cmd, 'target', coalesce(p_version, d.candidate_version));
end;
$$;

create or replace function public.queue_reboot(p_device uuid, p_delay int default 15)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d record; v_cmd text;
begin
  select id, company_id, remote_seen_at, update_running into d from devices where id = p_device;
  if d.id is null or not can_manage_company(d.company_id) then raise exception 'forbidden'; end if;
  if d.remote_seen_at is null then
    return jsonb_build_object('status', 'refused', 'detail', 'box non pilotable');
  end if;
  if coalesce(d.update_running, false) then
    return jsonb_build_object('status', 'refused', 'detail', 'installation en cours : redémarrer maintenant pourrait bloquer la box');
  end if;
  if exists (select 1 from device_commands where device_id = p_device and type = 'reboot'
             and (state in ('queued', 'sent', 'in_progress') or issued_at > now() - interval '60 minutes') and state <> 'cancelled') then
    return jsonb_build_object('status', 'refused', 'detail', 'un redémarrage est déjà programmé ou a eu lieu il y a moins d''une heure');
  end if;
  v_cmd := 'cmd_' || replace(gen_random_uuid()::text, '-', '');
  insert into device_commands (id, device_id, type, payload)
  values (v_cmd, p_device, 'reboot', jsonb_build_object('delay_seconds', greatest(5, least(300, coalesce(p_delay, 15)))));
  return jsonb_build_object('status', 'queued', 'id', v_cmd);
end;
$$;

-- annuler une commande pas encore partie vers la box
create or replace function public.cancel_device_command(p_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_dev uuid; v_company uuid;
begin
  select d.company_id into v_company from device_commands c join devices d on d.id = c.device_id where c.id = p_id;
  if v_company is null or not can_manage_company(v_company) then raise exception 'forbidden'; end if;
  update device_commands set state = 'cancelled' where id = p_id and state = 'queued' and type in ('run_update', 'reboot')
  returning device_id into v_dev;
  if v_dev is null then
    return jsonb_build_object('status', 'refused', 'detail', 'commande déjà envoyée à la box : plus annulable');
  end if;
  return jsonb_build_object('status', 'cancelled');
end;
$$;

revoke all on function public.queue_run_update(uuid, text, boolean), public.queue_reboot(uuid, int), public.cancel_device_command(text) from public, anon;
grant execute on function public.queue_run_update(uuid, text, boolean), public.queue_reboot(uuid, int), public.cancel_device_command(text) to authenticated;
