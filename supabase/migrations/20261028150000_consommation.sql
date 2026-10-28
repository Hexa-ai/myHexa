-- MYH-011 : suivi de consommation (staff Hexa-AI uniquement).
-- Chiffres en direct par box (variables, fichiers d'historique, documents, photos, rapports en base, messages reçus)
-- + relevé quotidien (usage_daily) pour suivre la croissance et le coût moyen par box.

create table if not exists public.usage_daily (
  day date not null,
  device_id uuid not null,
  company_id uuid,
  connected boolean not null default false,
  vars int not null default 0,
  ts_files int not null default 0,
  ts_bytes bigint not null default 0,
  doc_files int not null default 0,
  doc_bytes bigint not null default 0,
  photo_files int not null default 0,
  photo_bytes bigint not null default 0,
  reports int not null default 0,
  report_bytes bigint not null default 0,
  status_24h int not null default 0,
  daily_7d int not null default 0,
  primary key (day, device_id)
);
create index if not exists usage_daily_company_day on public.usage_daily (company_id, day);
alter table public.usage_daily enable row level security;
drop policy if exists usage_daily_staff on public.usage_daily;
create policy usage_daily_staff on public.usage_daily for select to authenticated using (is_hexa_staff());
revoke insert, update, delete on public.usage_daily from anon, authenticated;

-- fichiers des buckets, rattachés à une box (historique : chemin « device=<id> » ; documents / photos : 1er dossier = id box)
create or replace function public._usage_files()
returns table (device_id uuid, bucket text, n int, bytes bigint)
language sql stable security definer set search_path = public, storage as $$
  select y.dev_txt::uuid, y.bucket_id::text, count(*)::int, coalesce(sum((y.metadata->>'size')::bigint), 0)::bigint
    from (
      select o.bucket_id, o.metadata,
             case when o.bucket_id = 'ts-archive' then substring(o.name from 'device=([0-9a-f-]{36})')
                  else substring(o.name from '^([0-9a-f-]{36})/')
             end as dev_txt
        from storage.objects o
       where o.bucket_id in ('ts-archive', 'device-docs', 'intervention-photos')
    ) y
   where y.dev_txt is not null
   group by 1, 2
$$;
revoke execute on function public._usage_files() from public, anon, authenticated;

drop function if exists public.usage_by_device(uuid);
drop function if exists public._usage_rows();
create or replace function public._usage_rows()
returns table (
  device_id uuid, device_name text, company_id uuid, company_name text, last_connection_at timestamptz,
  connected boolean, vars int, ts_files int, ts_bytes bigint, doc_files int, doc_bytes bigint,
  photo_files int, photo_bytes bigint, reports int, report_bytes bigint, status_24h int, daily_7d int, history_days int)
language sql stable security definer set search_path = public as $$
  with f as (select * from _usage_files()),
       v as (select t.device_id, count(*)::int n, coalesce(max(t.last_day - t.first_day + 1), 0)::int hd from ts_vars t group by 1),
       r as (select r.device_id, count(*)::int n, sum(pg_column_size(r.*))::bigint b,
                    count(*) filter (where r.type = 'daily' and r.received_at > now() - interval '7 days')::int d7
               from reports r group by 1),
       s as (select b.device_id, count(distinct b.ts)::int n from ts_buffer b where b.ts > now() - interval '24 hours' group by 1)
  select d.id, d.name, d.company_id, c.name, d.last_connection_at,
         coalesce(d.last_connection_at > now() - interval '1 hour', false),
         coalesce(v.n, 0),
         coalesce(ft.n, 0), coalesce(ft.bytes, 0),
         coalesce(fd.n, 0), coalesce(fd.bytes, 0),
         coalesce(fp.n, 0), coalesce(fp.bytes, 0),
         coalesce(r.n, 0), coalesce(r.b, 0),
         coalesce(s.n, 0), coalesce(r.d7, 0), coalesce(v.hd, 0)
    from devices d
    left join companies c on c.id = d.company_id
    left join v on v.device_id = d.id
    left join r on r.device_id = d.id
    left join s on s.device_id = d.id
    left join f ft on ft.device_id = d.id and ft.bucket = 'ts-archive'
    left join f fd on fd.device_id = d.id and fd.bucket = 'device-docs'
    left join f fp on fp.device_id = d.id and fp.bucket = 'intervention-photos'
$$;
revoke execute on function public._usage_rows() from public, anon, authenticated;

-- lecture staff : détail par box (optionnellement d'un client)
create or replace function public.usage_by_device(p_company uuid default null)
returns table (
  device_id uuid, device_name text, company_id uuid, company_name text, last_connection_at timestamptz,
  connected boolean, vars int, ts_files int, ts_bytes bigint, doc_files int, doc_bytes bigint,
  photo_files int, photo_bytes bigint, reports int, report_bytes bigint, status_24h int, daily_7d int, history_days int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_hexa_staff() then raise exception 'réservé à l''équipe Hexa-AI' using errcode = '42501'; end if;
  return query select * from _usage_rows() u where p_company is null or u.company_id = p_company;
end $$;

-- plateforme : taille de la base, fichiers rattachés à un client (logos, rapports PDF) et total des buckets
create or replace function public.usage_platform()
returns jsonb language plpgsql stable security definer set search_path = public, storage as $$
declare v jsonb;
begin
  if not is_hexa_staff() then raise exception 'réservé à l''équipe Hexa-AI' using errcode = '42501'; end if;
  select jsonb_build_object(
    'db_bytes', pg_database_size(current_database()),
    'buckets', (select coalesce(jsonb_agg(jsonb_build_object('bucket', bucket_id, 'files', n, 'bytes', b) order by b desc), '[]')
                  from (select bucket_id, count(*) n, coalesce(sum((metadata->>'size')::bigint), 0) b from storage.objects group by 1) x),
    'company_files', (select coalesce(jsonb_agg(jsonb_build_object('company_id', cid, 'files', n, 'bytes', b)), '[]')
                  from (select substring(name from '^([0-9a-f-]{36})/')::uuid cid, count(*) n, coalesce(sum((metadata->>'size')::bigint), 0) b
                          from storage.objects where bucket_id in ('branding', 'reports') and name ~ '^[0-9a-f-]{36}/' group by 1) y),
    'snapshot_days', (select count(distinct day) from usage_daily),
    'at', now()) into v;
  return v;
end $$;

-- relevé quotidien (cron) : une ligne par box et par jour, rejouable
create or replace function public.usage_snapshot(p_day date default (now() at time zone 'utc')::date)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is not null and not is_hexa_staff() then
    raise exception 'réservé à l''équipe Hexa-AI' using errcode = '42501';
  end if;
  insert into usage_daily (day, device_id, company_id, connected, vars, ts_files, ts_bytes, doc_files, doc_bytes,
                           photo_files, photo_bytes, reports, report_bytes, status_24h, daily_7d)
  select p_day, u.device_id, u.company_id, u.connected, u.vars, u.ts_files, u.ts_bytes, u.doc_files, u.doc_bytes,
         u.photo_files, u.photo_bytes, u.reports, u.report_bytes, u.status_24h, u.daily_7d
    from _usage_rows() u
  on conflict (day, device_id) do update set
    company_id = excluded.company_id, connected = excluded.connected, vars = excluded.vars,
    ts_files = excluded.ts_files, ts_bytes = excluded.ts_bytes, doc_files = excluded.doc_files, doc_bytes = excluded.doc_bytes,
    photo_files = excluded.photo_files, photo_bytes = excluded.photo_bytes, reports = excluded.reports,
    report_bytes = excluded.report_bytes, status_24h = excluded.status_24h, daily_7d = excluded.daily_7d;
  get diagnostics n = row_count;
  return n;
end $$;

-- tendance : totaux par jour (global ou d'un client)
create or replace function public.usage_trend(p_company uuid default null, p_days int default 90)
returns table (day date, boxes int, connected int, vars int, files int, bytes bigint, status_24h int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_hexa_staff() then raise exception 'réservé à l''équipe Hexa-AI' using errcode = '42501'; end if;
  return query
    select u.day, count(*)::int, count(*) filter (where u.connected)::int, sum(u.vars)::int,
           sum(u.ts_files + u.doc_files + u.photo_files)::int,
           sum(u.ts_bytes + u.doc_bytes + u.photo_bytes + u.report_bytes)::bigint, sum(u.status_24h)::int
      from usage_daily u
     where (p_company is null or u.company_id = p_company)
       and u.day > (now() at time zone 'utc')::date - least(greatest(p_days, 1), 730)
     group by 1 order by 1;
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.usage_by_device(uuid)', 'public.usage_platform()', 'public.usage_trend(uuid, int)',
                           'public.usage_snapshot(date)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- relevé chaque nuit à 03:20 UTC, puis un premier relevé immédiat
do $$
begin
  perform cron.unschedule('usage-snapshot') where exists (select 1 from cron.job where jobname = 'usage-snapshot');
  perform cron.schedule('usage-snapshot', '20 3 * * *', 'select public.usage_snapshot()');
end $$;
select public.usage_snapshot();
