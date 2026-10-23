-- PROTOTYPE (myHexa-test uniquement) — historique des séries temporelles des box.
-- Couche d'affichage multi-résolution en base ; l'archive Parquet (Storage) est produite à partir d'elle
-- par la fonction ts-archive. Voir ~/suivi/projets/myhexa_support/historique_timeseries_parquet.md.
--
-- Une ligne = (box, variable, niveau, jour local, source) avec des tableaux de valeurs :
--   level 'pt' : points irréguliers (ts = secondes depuis t0)   — états/alarmes du rapport, statuts 30 min
--   level '5m' : 288 cases de 5 min (courbes du rapport journalier, 5 variables max aujourd'hui)
--   level '1h' : 24 cases (dérivé du 5m, ou rapport hebdo, ou compteurs du journalier, ou statuts)
--   level '1d' : 1 case (stats min/max/moyenne du rapport : TOUTES les favorites, ou dérivé)
--   src 'r' = rapport, 's' = statut (dernière valeur toutes les 30 min, toutes les variables)
-- Compteurs : v_avg porte le total de la case (somme), pas une moyenne.
-- Les rapports sont purgés par quota (companies.max_*_reports) et le statut est écrasé à chaque envoi :
-- cette table est donc la seule mémoire longue, alimentée dès l'ingestion.

create table if not exists public.ts_vars (
  device_id uuid not null references public.devices(id) on delete cascade,
  var text not null,
  category text,
  unit text,
  description text,
  updated_at timestamptz not null default now(),
  primary key (device_id, var)
);

create table if not exists public.ts_series (
  device_id uuid not null references public.devices(id) on delete cascade,
  var text not null,
  level text not null check (level in ('pt', '5m', '1h', '1d')),
  day date not null,
  src char(1) not null check (src in ('r', 's')),
  t0 timestamptz not null,
  step_s int,
  ts int[],
  v_avg float8[] not null,
  v_min float8[],
  v_max float8[],
  updated_at timestamptz not null default now(),
  primary key (device_id, var, level, day, src)
);
create index if not exists ts_series_range_idx on public.ts_series (device_id, level, day);

alter table public.ts_vars enable row level security;
alter table public.ts_series enable row level security;
drop policy if exists ts_vars_select on public.ts_vars;
create policy ts_vars_select on public.ts_vars for select using (is_device_visible(device_id));
drop policy if exists ts_series_select on public.ts_series;
create policy ts_series_select on public.ts_series for select using (is_device_visible(device_id));

-- valeur numérique tolérante (true/false, "12.3", 12.3) ; null sinon
create or replace function public.ts_num(j jsonb) returns float8 language sql immutable as $$
  select case jsonb_typeof(j)
    when 'number' then (j #>> '{}')::float8
    when 'boolean' then case when (j #>> '{}')::boolean then 1 else 0 end
    when 'string' then case when (j #>> '{}') ~ '^\s*-?[0-9]+(\.[0-9]+)?([eE][-+]?[0-9]+)?\s*$' then (j #>> '{}')::float8 end
  end
$$;

-- agrège un niveau fin en 1h et 1d (même source), en respectant la nature (compteur = somme)
create or replace function public.ts_derive(p_device uuid, p_var text, p_day date, p_src char, p_from text)
returns void language plpgsql security definer set search_path = public as $$
declare r record; v_counter boolean; v_t0 timestamptz;
begin
  select coalesce(category = 'counter', false) into v_counter from ts_vars where device_id = p_device and var = p_var;
  v_counter := coalesce(v_counter, false);
  select * into r from ts_series where device_id = p_device and var = p_var and level = p_from and day = p_day and src = p_src;
  if r is null then return; end if;
  v_t0 := date_trunc('hour', r.t0);

  if p_from in ('5m', 'pt') then
    insert into ts_series (device_id, var, level, day, src, t0, step_s, v_avg, v_min, v_max)
    select p_device, p_var, '1h', p_day, p_src, v_t0, 3600,
           array_agg(x.a order by g.h), array_agg(x.mi order by g.h), array_agg(x.ma order by g.h)
    from generate_series(0, 23) g(h)
    left join (
      select h, case when v_counter then sum(v) else avg(v) end a, min(coalesce(vmin, v)) mi, max(coalesce(vmax, v)) ma
      from (
        select floor(extract(epoch from (
                 case when p_from = '5m' then r.t0 + make_interval(secs => (i - 1) * r.step_s)
                      else r.t0 + make_interval(secs => r.ts[i]) end) - v_t0) / 3600)::int h,
               r.v_avg[i] v, r.v_min[i] vmin, r.v_max[i] vmax
        from generate_subscripts(r.v_avg, 1) i
      ) y where v is not null
      group by h
    ) x on x.h = g.h
    having count(x.a) > 0
    on conflict (device_id, var, level, day, src) do update
      set t0 = excluded.t0, v_avg = excluded.v_avg, v_min = excluded.v_min, v_max = excluded.v_max, updated_at = now();
  end if;

  -- 1d : seulement si le rapport n'a pas déjà fourni ses stats (plus exactes : calculées sur le brut)
  if p_src = 's' or not exists (select 1 from ts_series where device_id = p_device and var = p_var and level = '1d'
                                and day = p_day and src = 'r' and step_s = -1) then
    insert into ts_series (device_id, var, level, day, src, t0, step_s, v_avg, v_min, v_max)
    select p_device, p_var, '1d', p_day, p_src, date_trunc('day', r.t0), 86400,
           array[case when v_counter then sum(v) else avg(v) end], array[min(coalesce(vmin, v))], array[max(coalesce(vmax, v))]
    from (select s.v_avg[i] v, s.v_min[i] vmin, s.v_max[i] vmax
            from ts_series s, generate_subscripts(s.v_avg, 1) i
           where s.device_id = p_device and s.var = p_var and s.level = case when p_from = 'pt' and p_src = 's' then 'pt' else '1h' end
             and s.day = p_day and s.src = p_src) x
    where v is not null
    having count(*) > 0
    on conflict (device_id, var, level, day, src) do update
      set v_avg = excluded.v_avg, v_min = excluded.v_min, v_max = excluded.v_max, updated_at = now()
      where ts_series.step_s <> -1;
  end if;
end;
$$;

-- rapport journalier / hebdo -> séries
create or replace function public.ts_ingest_report(p_report uuid)
returns int language plpgsql security definer set search_path = public as $$
declare rep record; v record; v_n int := 0; v_pts jsonb; v_np int; v_t0 timestamptz; v_cat text; v_day date; d int;
begin
  select id, device_id, type::text t, period_start, payload into rep from reports where id = p_report;
  if rep.id is null or rep.t not in ('daily', 'weekly') or rep.period_start is null then return 0; end if;

  for v in select x from jsonb_array_elements(coalesce(rep.payload -> 'variables', '[]')) x where x ->> 'name' is not null loop
    v_cat := lower(coalesce(v.x ->> 'category', 'measure'));
    if v_cat = 'position' or v.x -> 'chart' ->> 'type' in ('text', 'map') then continue; end if;
    insert into ts_vars (device_id, var, category, unit, description)
    values (rep.device_id, v.x ->> 'name', v_cat, nullif(v.x ->> 'unit', ''), nullif(v.x ->> 'description', ''))
    on conflict (device_id, var) do update
      set category = excluded.category, unit = coalesce(excluded.unit, ts_vars.unit),
          description = coalesce(excluded.description, ts_vars.description), updated_at = now();

    v_pts := case when jsonb_typeof(v.x -> 'chart' -> 'points') = 'array' then v.x -> 'chart' -> 'points' else '[]' end;
    v_np := jsonb_array_length(v_pts);
    v_t0 := case when v_np > 0 then to_timestamp((v_pts -> 0 ->> 'ts')::float8 / 1000) end;

    if rep.t = 'daily' then
      -- stats du jour (toutes les favorites) : 1d exact ; step_s = -1 marque « venant des stats »
      if ts_num(v.x -> 'stats' -> 'mean') is not null or ts_num(v.x -> 'stats' -> 'max') is not null then
        insert into ts_series (device_id, var, level, day, src, t0, step_s, v_avg, v_min, v_max)
        values (rep.device_id, v.x ->> 'name', '1d', rep.period_start, 'r', coalesce(v_t0, rep.period_start::timestamptz), -1,
                array[coalesce(ts_num(v.x -> 'stats' -> 'mean'), ts_num(v.x -> 'stats' -> 'last'))],
                array[ts_num(v.x -> 'stats' -> 'min')], array[ts_num(v.x -> 'stats' -> 'max')])
        on conflict (device_id, var, level, day, src) do update
          set t0 = excluded.t0, step_s = -1, v_avg = excluded.v_avg, v_min = excluded.v_min, v_max = excluded.v_max, updated_at = now();
      end if;
      if v_np = 0 then v_n := v_n + 1; continue; end if;

      if v.x -> 'chart' ->> 'type' = 'step' then
        insert into ts_series (device_id, var, level, day, src, t0, ts, v_avg)
        select rep.device_id, v.x ->> 'name', 'pt', rep.period_start, 'r', v_t0,
               array_agg(round(((p ->> 'ts')::float8 / 1000 - extract(epoch from v_t0)))::int order by o),
               array_agg(ts_num(p -> 'value') order by o)
        from jsonb_array_elements(v_pts) with ordinality e(p, o)
        on conflict (device_id, var, level, day, src) do update set t0 = excluded.t0, ts = excluded.ts, v_avg = excluded.v_avg, updated_at = now();
        perform ts_derive(rep.device_id, v.x ->> 'name', rep.period_start, 'r', 'pt');
      elsif v_np >= 200 then  -- courbe 5 min (288 points)
        insert into ts_series (device_id, var, level, day, src, t0, step_s, v_avg)
        select rep.device_id, v.x ->> 'name', '5m', rep.period_start, 'r', v_t0,
               round(((v_pts -> 1 ->> 'ts')::float8 - (v_pts -> 0 ->> 'ts')::float8) / 1000)::int,
               array_agg(ts_num(p -> 'value') order by o)
        from jsonb_array_elements(v_pts) with ordinality e(p, o)
        on conflict (device_id, var, level, day, src) do update
          set t0 = excluded.t0, step_s = excluded.step_s, v_avg = excluded.v_avg, updated_at = now();
        perform ts_derive(rep.device_id, v.x ->> 'name', rep.period_start, 'r', '5m');
      else  -- compteur (barres horaires) ou courbe courte : niveau 1h
        insert into ts_series (device_id, var, level, day, src, t0, step_s, v_avg)
        select rep.device_id, v.x ->> 'name', '1h', rep.period_start, 'r', v_t0, 3600,
               array_agg(ts_num(p -> 'value') order by o)
        from jsonb_array_elements(v_pts) with ordinality e(p, o)
        on conflict (device_id, var, level, day, src) do update set t0 = excluded.t0, v_avg = excluded.v_avg, updated_at = now();
        perform ts_derive(rep.device_id, v.x ->> 'name', rep.period_start, 'r', '1h');
      end if;
    else
      -- hebdo : 168 points horaires (ou 7 barres jour pour un compteur) ; complète les jours sans journalier
      if v_np >= 24 and v.x -> 'chart' ->> 'type' = 'line' then
        for d in 0 .. (v_np / 24) - 1 loop
          v_day := rep.period_start + d;
          insert into ts_series (device_id, var, level, day, src, t0, step_s, v_avg)
          select rep.device_id, v.x ->> 'name', '1h', v_day, 'r', v_t0 + make_interval(days => d), 3600,
                 array_agg(ts_num(p -> 'value') order by o)
          from jsonb_array_elements(v_pts) with ordinality e(p, o) where o > d * 24 and o <= (d + 1) * 24
          on conflict (device_id, var, level, day, src) do nothing;
          perform ts_derive(rep.device_id, v.x ->> 'name', v_day, 'r', '1h');
        end loop;
      elsif v.x -> 'chart' ->> 'type' = 'bar' and v_np = 7 then
        for d in 0 .. 6 loop
          insert into ts_series (device_id, var, level, day, src, t0, step_s, v_avg)
          values (rep.device_id, v.x ->> 'name', '1d', rep.period_start + d, 'r', v_t0 + make_interval(days => d), 86400,
                  array[ts_num(v_pts -> d -> 'value')])
          on conflict (device_id, var, level, day, src) do nothing;
        end loop;
      end if;
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- statut (toutes les 30 min) -> points 'pt' source 's' + 1h/1d dérivés, pour TOUTES les variables
create or replace function public.ts_ingest_status(p_device uuid, p_payload jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare v record; v_ts timestamptz; v_tz text; v_day date; v_val float8; v_n int := 0; v_t0 timestamptz;
begin
  v_ts := coalesce((p_payload ->> 'timestamp')::timestamptz, now());
  v_tz := coalesce(nullif(p_payload -> 'device' ->> 'timezone', ''), 'Europe/Paris');
  begin
    v_day := (v_ts at time zone v_tz)::date;
  exception when others then
    v_tz := 'Europe/Paris'; v_day := (v_ts at time zone v_tz)::date;
  end;
  v_t0 := (v_day::timestamp) at time zone v_tz;  -- minuit local
  for v in select x from jsonb_array_elements(case when jsonb_typeof(p_payload -> 'variables') = 'array' then p_payload -> 'variables' else '[]' end) x loop
    v_val := ts_num(v.x -> 'value');
    if v_val is null or v.x ->> 'name' is null or lower(coalesce(v.x ->> 'category', '')) = 'position' then continue; end if;
    insert into ts_vars (device_id, var, category, unit, description)
    values (p_device, v.x ->> 'name', lower(coalesce(v.x ->> 'category', 'measure')), nullif(v.x ->> 'unit', ''), nullif(v.x ->> 'description', ''))
    on conflict (device_id, var) do update
      set unit = coalesce(excluded.unit, ts_vars.unit), description = coalesce(excluded.description, ts_vars.description),
          category = coalesce(ts_vars.category, excluded.category), updated_at = now();
    insert into ts_series (device_id, var, level, day, src, t0, ts, v_avg)
    values (p_device, v.x ->> 'name', 'pt', v_day, 's', v_t0, array[extract(epoch from v_ts - v_t0)::int], array[v_val])
    on conflict (device_id, var, level, day, src) do update
      set ts = ts_series.ts || excluded.ts, v_avg = ts_series.v_avg || excluded.v_avg, updated_at = now()
      where not (excluded.ts[1] = any (ts_series.ts));  -- même statut renvoyé deux fois : ignoré
    perform ts_derive(p_device, v.x ->> 'name', v_day, 's', 'pt');
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- lecture : choisit le niveau selon la plage, préfère le rapport au statut, renvoie [t_ms, moy, min, max]
create or replace function public.ts_query(p_device uuid, p_vars text[], p_from timestamptz, p_to timestamptz, p_level text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_span interval := p_to - p_from; v_level text; v_out jsonb;
begin
  if not is_device_visible(p_device) then raise exception 'forbidden'; end if;
  if p_to <= p_from or v_span > interval '5 years' then raise exception 'plage invalide'; end if;
  if coalesce(array_length(p_vars, 1), 0) between 1 and 200 is not true then raise exception 'variables : 1 à 200'; end if;
  v_level := coalesce(p_level, case when v_span <= interval '4 days' then '5m' when v_span <= interval '62 days' then '1h' else '1d' end);

  with cand as (
    select s.*, case
        when v_level = '5m' then array_position(array['5m:r', 'pt:r', 'pt:s', '1h:r', '1h:s', '1d:r', '1d:s'], s.level || ':' || s.src)
        when v_level = '1h' then array_position(array['1h:r', 'pt:r', '1h:s', '1d:r', '1d:s'], s.level || ':' || s.src)
        else array_position(array['1d:r', '1d:s'], s.level || ':' || s.src) end pref
    from ts_series s
    where s.device_id = p_device and s.var = any (p_vars)
      and s.day between (p_from - interval '1 day')::date and (p_to + interval '1 day')::date
  ), best as (
    select distinct on (var, day) * from cand where pref is not null order by var, day, pref
  ), pts as (
    select b.var, b.level, b.src,
           case when b.level = 'pt' then b.t0 + make_interval(secs => b.ts[i])
                when b.step_s = -1 then b.t0
                else b.t0 + make_interval(secs => (i - 1) * b.step_s) end t,
           b.v_avg[i] a, coalesce(b.v_min[i], b.v_avg[i]) mi, coalesce(b.v_max[i], b.v_avg[i]) ma
    from best b, generate_subscripts(b.v_avg, 1) i
  )
  select jsonb_build_object(
    'level', v_level,
    'from', p_from, 'to', p_to,
    'series', coalesce(jsonb_agg(jsonb_build_object(
        'var', z.var, 'unit', tv.unit, 'category', tv.category, 'description', tv.description,
        'sources', z.sources, 'points', z.points) order by z.var), '[]'))
  into v_out
  from (
    select var, jsonb_agg(distinct level || ':' || src) sources,
           jsonb_agg(jsonb_build_array((extract(epoch from t) * 1000)::bigint, a, mi, ma) order by t) points
    from pts where t >= p_from and t <= p_to and a is not null
    group by var
  ) z left join ts_vars tv on tv.device_id = p_device and tv.var = z.var;
  return v_out;
end;
$$;

-- catalogue : variables d'une box, avec la profondeur d'historique disponible
create or replace function public.ts_catalog(p_device uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not is_device_visible(p_device) then null else coalesce((
    select jsonb_agg(jsonb_build_object(
      'var', v.var, 'unit', v.unit, 'category', v.category, 'description', v.description,
      'first_day', x.first_day, 'last_day', x.last_day, 'days', x.days, 'fine', x.fine) order by v.var)
    from ts_vars v
    join lateral (
      select min(day) first_day, max(day) last_day, count(distinct day) days,
             bool_or(level = '5m') fine
      from ts_series s where s.device_id = v.device_id and s.var = v.var
    ) x on x.days > 0
    where v.device_id = p_device), '[]') end
$$;

revoke all on function public.ts_derive(uuid, text, date, char, text), public.ts_ingest_report(uuid),
  public.ts_ingest_status(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ts_query(uuid, text[], timestamptz, timestamptz, text), public.ts_catalog(uuid) to authenticated;

-- branchement sur l'ingestion : jamais bloquant (une erreur d'historique ne doit pas perdre le rapport)
create or replace function public.ts_after_report() returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.type::text = 'status' then
      perform ts_ingest_status(new.device_id, new.payload);
    else
      perform ts_ingest_report(new.id);
    end if;
  exception when others then
    raise warning 'historique : % (%)', sqlerrm, new.id;
  end;
  return null;
end;
$$;
drop trigger if exists ts_after_report on public.reports;
create trigger ts_after_report after insert or update of payload on public.reports
  for each row execute function public.ts_after_report();

-- ── Archive Parquet (Supabase Storage, bucket privé ts-archive) ─────────────────────────────
-- 1 fichier par box et par jour (tous niveaux, colonne level), + agrégats 1h par mois et 1d par an.
-- Écrit par l'Edge Function ts-archive (service role) ; ce journal dit quoi régénérer.
insert into storage.buckets (id, name, public) values ('ts-archive', 'ts-archive', false)
on conflict (id) do nothing;

create table if not exists public.ts_archive (
  device_id uuid not null references public.devices(id) on delete cascade,
  day date not null,
  path text not null,
  rows int not null,
  bytes int not null,
  archived_at timestamptz not null default now(),
  primary key (device_id, day)
);
alter table public.ts_archive enable row level security;
drop policy if exists ts_archive_select on public.ts_archive;
create policy ts_archive_select on public.ts_archive for select using (is_device_visible(device_id));

-- jours à (ré)archiver : modifiés depuis le dernier export
create or replace function public.ts_archive_todo(p_limit int default 50)
returns table (device_id uuid, company_id uuid, day date) language sql stable security definer set search_path = public as $$
  select s.device_id, d.company_id, s.day
  from ts_series s join devices d on d.id = s.device_id
  left join ts_archive a on a.device_id = s.device_id and a.day = s.day
  group by s.device_id, d.company_id, s.day, a.archived_at
  having a.archived_at is null or max(s.updated_at) > a.archived_at
  order by s.day, s.device_id
  limit p_limit
$$;
revoke all on function public.ts_archive_todo(int) from public, anon, authenticated;
