-- PROTOTYPE (myHexa-test uniquement) — modèles de rapports périodiques.
-- Un rapport = un tableau de bord (mêmes blocs) + une fréquence + des destinataires.
-- La période envoyée est la période écoulée : la veille, la semaine précédente (lundi -> lundi) ou le mois précédent,
-- en heure locale (tz). Génération et envoi : Edge Function report-run (cron toutes les 15 min).

create table if not exists public.report_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  dashboard_id uuid not null references public.dashboards(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly')),
  send_hour int not null default 7 check (send_hour between 0 and 23),
  weekday int not null default 1 check (weekday between 1 and 7),   -- 1 = lundi (hebdo)
  monthday int not null default 1 check (monthday between 1 and 28), -- mensuel
  tz text not null default 'Europe/Paris',
  compare text not null default 'previous' check (compare in ('none', 'previous', 'year')),
  attach_csv boolean not null default false,
  recipient_ids uuid[] not null default '{}',
  enabled boolean not null default true,
  next_run_at timestamptz,
  last_run_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists report_templates_dash_idx on public.report_templates (dashboard_id);
create index if not exists report_templates_due_idx on public.report_templates (next_run_at) where enabled;

create table if not exists public.report_runs (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.report_templates(id) on delete cascade,
  period_from timestamptz not null,
  period_to timestamptz not null,
  status text not null check (status in ('sent', 'not_sent', 'error')),
  trigger text not null default 'cron' check (trigger in ('cron', 'manual')),
  sent_to text[] not null default '{}',
  html_path text,
  csv_path text,
  bytes int,
  ms int,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists report_runs_tpl_idx on public.report_runs (template_id, created_at desc);

-- prochaine échéance (heure locale tz), strictement après p_after
create or replace function public.report_next_run(p_freq text, p_hour int, p_weekday int, p_monthday int, p_tz text, p_after timestamptz)
returns timestamptz language plpgsql immutable set search_path = public as $$
declare
  loc timestamp := p_after at time zone p_tz;
  d date := loc::date;
  cand timestamp;
begin
  for i in 0..62 loop
    cand := (d + i) + make_interval(hours => p_hour);
    if (p_freq = 'daily')
       or (p_freq = 'weekly' and extract(isodow from (d + i)) = p_weekday)
       or (p_freq = 'monthly' and extract(day from (d + i)) = p_monthday) then
      if (cand at time zone p_tz) > p_after then
        return cand at time zone p_tz;
      end if;
    end if;
  end loop;
  return null;
end $$;

-- période couverte par un envoi à l'instant p_at : la journée / semaine / mois écoulé(e), en heure locale
create or replace function public.report_period(p_freq text, p_tz text, p_at timestamptz, out p_from timestamptz, out p_to timestamptz)
language plpgsql immutable set search_path = public as $$
declare
  loc date := (p_at at time zone p_tz)::date;
  t date;
  f date;
begin
  if p_freq = 'daily' then
    t := loc; f := loc - 1;
  elsif p_freq = 'weekly' then
    t := loc - (extract(isodow from loc)::int - 1); f := t - 7;
  else
    t := date_trunc('month', loc)::date; f := (t - interval '1 month')::date;
  end if;
  p_from := f::timestamp at time zone p_tz;
  p_to := t::timestamp at time zone p_tz;
end $$;

create or replace function public.report_templates_check() returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from dashboards d where d.id = new.dashboard_id and d.company_id = new.company_id) then
    raise exception 'le tableau de bord n''appartient pas à l''entreprise' using errcode = '23514';
  end if;
  -- destinataires : uniquement des destinataires de l'entreprise (avec e-mail)
  if exists (select 1 from unnest(new.recipient_ids) u(id) left join recipients r on r.id = u.id
             where r.id is null or r.company_id <> new.company_id or coalesce(r.contact_email, '') = '') then
    raise exception 'destinataire invalide (hors entreprise ou sans e-mail)' using errcode = '23514';
  end if;
  begin
    perform now() at time zone new.tz;
  exception when others then
    raise exception 'fuseau horaire inconnu : %', new.tz using errcode = '23514';
  end;
  if tg_op = 'INSERT' or new.frequency is distinct from old.frequency or new.send_hour is distinct from old.send_hour
     or new.weekday is distinct from old.weekday or new.monthday is distinct from old.monthday
     or new.tz is distinct from old.tz or (new.enabled and not old.enabled) then
    new.next_run_at := report_next_run(new.frequency, new.send_hour, new.weekday, new.monthday, new.tz, now());
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists report_templates_check on public.report_templates;
create trigger report_templates_check before insert or update on public.report_templates
  for each row execute function public.report_templates_check();

alter table public.report_templates enable row level security;
drop policy if exists report_templates_select on public.report_templates;
create policy report_templates_select on public.report_templates for select using (can_view_dashboard(dashboard_id));
drop policy if exists report_templates_write on public.report_templates;
create policy report_templates_write on public.report_templates for all
  using (can_manage_company(company_id)) with check (can_manage_company(company_id));

alter table public.report_runs enable row level security;
drop policy if exists report_runs_select on public.report_runs;
create policy report_runs_select on public.report_runs for select
  using (exists (select 1 from report_templates t where t.id = template_id and can_view_dashboard(t.dashboard_id)));

-- archives des rapports (HTML + CSV), lues via URL signées
insert into storage.buckets (id, name, public) values ('reports', 'reports', false) on conflict (id) do nothing;

-- lecture des archives par les membres de l'entreprise (chemin <company_id>/<template_id>/<run>.html|csv)
drop policy if exists reports_read on storage.objects;
create policy reports_read on storage.objects for select to authenticated
  using (bucket_id = 'reports' and exists (
    select 1 from public.report_templates t
    where t.id::text = (storage.foldername(name))[2] and t.company_id::text = (storage.foldername(name))[1]
      and public.can_view_dashboard(t.dashboard_id)));

-- cron : modèles échus toutes les 15 min (secret partagé avec ts-build, stocké dans le vault)
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'report_run_url') then
    perform vault.create_secret(replace((select decrypted_secret from vault.decrypted_secrets where name = 'ts_build_url'), '/ts-build', '/report-run'), 'report_run_url');
  end if;
  perform cron.unschedule('report-run') where exists (select 1 from cron.job where jobname = 'report-run');
  perform cron.schedule('report-run', '*/15 * * * *', $c$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'report_run_url'),
      headers := jsonb_build_object('content-type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ts_archive_cron_secret')),
      body := '{"limit": 3}'::jsonb, timeout_milliseconds := 150000)
  $c$);
end $$;
