-- Notifications envoyées par le portail, réglées par l'administrateur de chaque entreprise.
--  * Perte de liaison d'une box : seul cas que la box ne peut pas signaler elle-même.
--    Activée/coupée par entreprise, délai 30 min / 1 h / 4 h, destinataires choisis box par box
--    (connectivity_subscriptions), mode maintenance par box (devices.alerts_paused_until).
--  * Récapitulatif d'état : fréquence + jour de la semaine + résumé IA (Gemini) optionnel,
--    destinataires choisis personne par personne (recipients.status_email).
-- Démarrage : alertes activées pour les administrateurs ; récap réservé aux administrateurs ;
-- les box déjà hors ligne sont marquées « déjà signalées » (pas de vague de mails).

alter table public.companies
  add column if not exists connectivity_alerts_enabled boolean not null default true,
  add column if not exists connectivity_delay_minutes integer not null default 60,
  add column if not exists status_email_weekday smallint not null default 2,
  add column if not exists status_email_ai boolean not null default true;

do $$ begin
  alter table public.companies add constraint companies_connectivity_delay_check
    check (connectivity_delay_minutes in (30, 60, 240));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.companies add constraint companies_status_email_weekday_check
    check (status_email_weekday between 1 and 7); -- ISO : 1 = lundi … 7 = dimanche
exception when duplicate_object then null; end $$;

alter table public.recipients add column if not exists status_email boolean not null default false;
update public.recipients set status_email = true
  where portal_access and role = 'admin' and company_id is not null and contact_email is not null;

alter table public.devices add column if not exists alerts_paused_until timestamptz;

-- Qui reçoit la perte de liaison de quelle box -------------------------------------------------
create table if not exists public.connectivity_subscriptions (
  recipient_id uuid not null references public.recipients(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (recipient_id, device_id)
);
create index if not exists connectivity_subscriptions_device_idx
  on public.connectivity_subscriptions (device_id);
alter table public.connectivity_subscriptions enable row level security;

drop policy if exists connectivity_subscriptions_select on public.connectivity_subscriptions;
create policy connectivity_subscriptions_select on public.connectivity_subscriptions for select
  using (is_device_visible(device_id));
drop policy if exists connectivity_subscriptions_write on public.connectivity_subscriptions;
create policy connectivity_subscriptions_write on public.connectivity_subscriptions for all
  using (exists (select 1 from recipients r join devices d on d.company_id = r.company_id
                 where r.id = recipient_id and d.id = device_id and can_manage_company(r.company_id)))
  with check (exists (select 1 from recipients r join devices d on d.company_id = r.company_id
                      where r.id = recipient_id and d.id = device_id and can_manage_company(r.company_id)));
grant select, insert, delete on public.connectivity_subscriptions to authenticated;

-- Démarrage : chaque administrateur (avec accès portail et e-mail) sur les box qu'il voit
insert into public.connectivity_subscriptions (recipient_id, device_id)
select r.id, d.id
from public.recipients r
join public.devices d on d.company_id = r.company_id
where r.portal_access and r.role = 'admin' and r.contact_email is not null
  and (r.restrict_to_devices is null or d.id = any (r.restrict_to_devices))
on conflict do nothing;

-- Box déjà hors ligne (plus d'1 h sans status) : considérées comme déjà signalées
insert into public.connectivity_alerts (device_id, state, last_notified_at)
select d.id, 'lost', now()
from public.devices d
cross join lateral (
  select max(r.received_at) as seen from public.reports r
  where r.device_id = d.id and r.type = 'status'
) s
where s.seen is not null and s.seen < now() - interval '1 hour'
on conflict (device_id) do update set state = 'lost', last_notified_at = excluded.last_notified_at
  where public.connectivity_alerts.state is distinct from 'lost';

-- Réglages de l'entreprise (les admins n'ont pas le droit d'écrire companies directement) -------
create or replace function public.set_company_notifications(
  p_company uuid,
  p_connectivity_enabled boolean,
  p_connectivity_delay integer,
  p_status_frequency text,
  p_status_weekday smallint,
  p_status_ai boolean
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_company(p_company) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update companies set
    connectivity_alerts_enabled = p_connectivity_enabled,
    connectivity_delay_minutes = p_connectivity_delay,
    status_email_frequency = p_status_frequency::status_email_frequency,
    status_email_weekday = p_status_weekday,
    status_email_ai = p_status_ai
  where id = p_company;
end $$;
revoke all on function public.set_company_notifications(uuid, boolean, integer, text, smallint, boolean) from public, anon;
grant execute on function public.set_company_notifications(uuid, boolean, integer, text, smallint, boolean) to authenticated;

-- Mode maintenance d'une box (null = reprendre)
create or replace function public.set_device_alerts_pause(p_device uuid, p_until timestamptz)
returns void
language plpgsql security definer set search_path = public as $$
declare v_company uuid;
begin
  select company_id into v_company from devices where id = p_device;
  if v_company is null or not can_manage_company(v_company) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_until is not null and p_until > now() + interval '90 days' then
    raise exception 'PAUSE_TOO_LONG';
  end if;
  update devices set alerts_paused_until = p_until where id = p_device;
end $$;
revoke all on function public.set_device_alerts_pause(uuid, timestamptz) from public, anon;
grant execute on function public.set_device_alerts_pause(uuid, timestamptz) to authenticated;

-- Raccourci « tous les administrateurs / tous les membres sur toutes les box »
create or replace function public.connectivity_subscribe_all(p_company uuid, p_scope text)
returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not can_manage_company(p_company) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_scope not in ('admins', 'members', 'none') then raise exception 'BAD_SCOPE'; end if;
  delete from connectivity_subscriptions cs using devices d
    where d.id = cs.device_id and d.company_id = p_company;
  if p_scope = 'none' then return 0; end if;
  insert into connectivity_subscriptions (recipient_id, device_id)
  select r.id, d.id from recipients r join devices d on d.company_id = r.company_id
  where r.company_id = p_company and r.portal_access and r.contact_email is not null
    and (p_scope = 'members' or r.role = 'admin')
    and (r.restrict_to_devices is null or d.id = any (r.restrict_to_devices))
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.connectivity_subscribe_all(uuid, text) from public, anon;
grant execute on function public.connectivity_subscribe_all(uuid, text) to authenticated;
