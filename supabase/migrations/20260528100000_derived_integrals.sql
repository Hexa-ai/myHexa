-- Variables dérivées par intégration temporelle (débit→volume, puissance→énergie)
-- Spec : docs/superpowers/specs/2026-05-28-derived-integrals-design.md
-- Plan : docs/superpowers/plans/2026-05-28-derived-integrals.md

-- ============================================================================
-- 1. Colonne destination
-- ============================================================================
alter table public.reports
  add column if not exists derived_payload jsonb;

comment on column public.reports.derived_payload is
  'Variables dérivées calculées par compute_derived_variables() (intégration trapézoïdale débit→volume, puissance→énergie). Même forme que payload, fusionnée côté front pour affichage transparent.';

-- ============================================================================
-- 2. Helper : interpolation linéaire d'une série (ts, val) à un instant cible
-- ============================================================================
create or replace function public._derived_interpolate_cumul(
  p_ts timestamptz[],
  p_val numeric[],
  p_target timestamptz
) returns numeric
  language plpgsql
  immutable
as $f$
declare
  v_n int := array_length(p_ts, 1);
  v_i int;
  v_dt numeric;
begin
  if v_n is null or v_n = 0 then return 0; end if;
  if p_target <= p_ts[1] then return p_val[1]; end if;
  if p_target >= p_ts[v_n] then return p_val[v_n]; end if;
  for v_i in 2 .. v_n loop
    if p_target <= p_ts[v_i] then
      v_dt := extract(epoch from (p_ts[v_i] - p_ts[v_i-1]));
      if v_dt = 0 then return p_val[v_i-1]; end if;
      return p_val[v_i-1] + (p_val[v_i] - p_val[v_i-1])
                            * extract(epoch from (p_target - p_ts[v_i-1])) / v_dt;
    end if;
  end loop;
  return p_val[v_n];
end
$f$;

-- ============================================================================
-- 3. Fonction principale : compute_derived_variables
-- Seuil de gap adaptatif = max(15 min, 3 × delta médian) pour gérer aussi
-- bien les samplings serrés (5 min en daily) que larges (1h en weekly).
-- ============================================================================
create or replace function public.compute_derived_variables(
  p_payload jsonb,
  p_period_start date,
  p_period_end date,
  p_period_kind text,
  p_timezone text default 'UTC'
) returns jsonb
  language plpgsql
  immutable
as $f$
declare
  v_unit_factors constant jsonb := jsonb_build_object(
    'm3/h',  1.0/3600, 'l/h',   1.0/3600, 'l/min', 1.0/60, 'l/s',   1.0,
    'kw',    1.0/3600, 'w',     1.0/3600, 'kva',   1.0/3600
  );
  v_unit_outputs constant jsonb := jsonb_build_object(
    'm3/h', 'm³', 'l/h', 'L', 'l/min', 'L', 'l/s', 'L',
    'kw', 'kWh', 'w', 'Wh', 'kva', 'kVAh'
  );
  v_tz text;
  v_period_start_ts timestamptz;
  v_period_end_ts   timestamptz;
  v_bucket_seconds bigint;
  v_derived jsonb := '[]'::jsonb;
  v_existing_names text[] := '{}'::text[];
  v_var jsonb;
  v_unit text;
  v_unit_norm text;
  v_kind text;
  v_factor numeric;
  v_out_unit text;
  v_src_name text;
  v_new_name text;
  v_base text;
  v_pts jsonb;
  v_n int;
  v_cumul numeric;
  v_cumul_ts timestamptz[];
  v_cumul_val numeric[];
  v_i int;
  v_t_prev timestamptz; v_t_cur timestamptz;
  v_v_prev numeric;     v_v_cur numeric;
  v_dt numeric;
  v_inc numeric;
  v_skip_var boolean;
  v_bucket_count int;
  v_bucket_idx int;
  v_b_start timestamptz; v_b_end timestamptz;
  v_cumul_start numeric; v_cumul_end numeric;
  v_bucket_val numeric;
  v_bucket_arr jsonb;
  v_bucket_sum numeric; v_bucket_min numeric; v_bucket_max numeric;
  v_bucket_vals numeric[];
  v_median numeric;
  v_ts_raw text;
  v_deltas numeric[];
  v_median_delta numeric;
  v_gap_threshold numeric;
begin
  if p_payload is null
     or jsonb_typeof(p_payload->'variables') <> 'array'
     or p_period_start is null or p_period_end is null then
    return jsonb_build_object('variables', '[]'::jsonb);
  end if;

  v_bucket_seconds := case p_period_kind
    when 'daily'  then 3600
    when 'weekly' then 86400
    else 0
  end;
  if v_bucket_seconds = 0 then
    return jsonb_build_object('variables', '[]'::jsonb);
  end if;

  v_tz := coalesce(nullif(p_timezone,''), 'UTC');
  v_period_start_ts := (p_period_start::timestamp) at time zone v_tz;
  v_period_end_ts   := (p_period_end::timestamp)   at time zone v_tz;

  select coalesce(array_agg(lower(coalesce(v->>'name',''))), '{}')
    into v_existing_names
  from jsonb_array_elements(p_payload->'variables') v;

  for v_var in select * from jsonb_array_elements(p_payload->'variables')
  loop
    if coalesce(v_var->>'category','') <> 'measure' then continue; end if;

    v_unit := coalesce(v_var->>'unit','');
    v_unit_norm := lower(replace(v_unit, '³', '3'));
    v_unit_norm := regexp_replace(v_unit_norm, '\s*/\s*', '/', 'g');
    v_unit_norm := regexp_replace(v_unit_norm, '\s+', '', 'g');

    if not (v_unit_factors ? v_unit_norm) then continue; end if;

    v_factor   := (v_unit_factors->>v_unit_norm)::numeric;
    v_out_unit := v_unit_outputs->>v_unit_norm;
    v_kind     := case when v_unit_norm in ('m3/h','l/h','l/min','l/s') then 'flow' else 'power' end;

    v_pts := v_var->'chart'->'points';
    if jsonb_typeof(v_pts) <> 'array' then continue; end if;
    v_n := jsonb_array_length(v_pts);
    if v_n < 2 then continue; end if;

    v_src_name := coalesce(v_var->>'name','');
    if v_kind = 'flow' then
      v_base := regexp_replace(v_src_name, '(?i)[_\s]*(debit|flow)[_\s]*', '_', 'g');
      v_base := trim(both '_' from v_base);
      v_new_name := 'Volume' || case when v_base = '' then '_' || v_src_name else '_' || v_base end;
    else
      v_base := regexp_replace(v_src_name, '(?i)[_\s]*(puissance|power)[_\s]*', '_', 'g');
      v_base := trim(both '_' from v_base);
      v_new_name := 'Energie' || case when v_base = '' then '_' || v_src_name else '_' || v_base end;
    end if;

    if lower(v_new_name) = any(v_existing_names) then
      raise notice 'derived_integrals: skip % (collision)', v_new_name;
      continue;
    end if;

    -- Pass 1 : parse timestamps + collecte des deltas pour seuil adaptatif
    v_cumul_ts := '{}'::timestamptz[];
    v_cumul_val := '{}'::numeric[];
    v_deltas := '{}'::numeric[];
    v_t_prev := null;
    v_skip_var := false;

    for v_i in 0 .. v_n - 1 loop
      v_ts_raw := v_pts->v_i->>'ts';
      begin
        v_t_cur := to_timestamp(v_ts_raw::bigint / 1000.0);
      exception when others then
        begin
          v_t_cur := v_ts_raw::timestamptz;
        exception when others then
          raise notice 'derived_integrals: skip % (invalid ts %)', v_src_name, v_ts_raw;
          v_skip_var := true;
          exit;
        end;
      end;
      if v_t_prev is not null then
        v_dt := extract(epoch from (v_t_cur - v_t_prev));
        if v_dt > 0 then v_deltas := v_deltas || v_dt; end if;
      end if;
      v_cumul_ts := v_cumul_ts || v_t_cur;
      v_t_prev := v_t_cur;
    end loop;

    if v_skip_var then continue; end if;
    if array_length(v_deltas, 1) is null then continue; end if;

    select percentile_cont(0.5) within group (order by x)
      into v_median_delta from unnest(v_deltas) x;

    -- Seuil de gap = max(15 min, 3 × delta médian)
    v_gap_threshold := greatest(900, 3 * v_median_delta);

    -- Pass 2 : intégration trapézoïdale avec seuil adaptatif
    v_cumul := 0;
    v_t_prev := null;
    v_v_prev := null;

    for v_i in 0 .. v_n - 1 loop
      v_t_cur := v_cumul_ts[v_i + 1];
      v_v_cur := (v_pts->v_i->>'value')::numeric;
      if v_t_prev is not null then
        v_dt := extract(epoch from (v_t_cur - v_t_prev));
        if v_dt > 0 and v_dt <= v_gap_threshold then
          v_inc := ((greatest(v_v_prev,0) + greatest(v_v_cur,0)) / 2.0) * v_dt * v_factor;
          v_cumul := v_cumul + v_inc;
        end if;
      end if;
      v_cumul_val := v_cumul_val || v_cumul;
      v_t_prev := v_t_cur;
      v_v_prev := v_v_cur;
    end loop;

    -- Étape bucketing
    v_bucket_count := greatest(1, ceil(extract(epoch from (v_period_end_ts - v_period_start_ts)) / v_bucket_seconds)::int);
    v_bucket_arr  := '[]'::jsonb;
    v_bucket_vals := '{}'::numeric[];
    v_bucket_sum := 0;
    v_bucket_min := null;
    v_bucket_max := null;

    for v_bucket_idx in 0 .. v_bucket_count - 1 loop
      v_b_start := v_period_start_ts + (v_bucket_idx     * v_bucket_seconds) * interval '1 second';
      v_b_end   := v_period_start_ts + ((v_bucket_idx+1) * v_bucket_seconds) * interval '1 second';
      v_cumul_start := public._derived_interpolate_cumul(v_cumul_ts, v_cumul_val, v_b_start);
      v_cumul_end   := public._derived_interpolate_cumul(v_cumul_ts, v_cumul_val, v_b_end);
      v_bucket_val  := greatest(0, v_cumul_end - v_cumul_start);

      v_bucket_arr := v_bucket_arr || jsonb_build_array(jsonb_build_object(
        'ts',    (extract(epoch from v_b_start) * 1000)::bigint,
        'value', v_bucket_val
      ));
      v_bucket_vals := v_bucket_vals || v_bucket_val;
      v_bucket_sum := v_bucket_sum + v_bucket_val;
      v_bucket_min := least(coalesce(v_bucket_min, v_bucket_val), v_bucket_val);
      v_bucket_max := greatest(coalesce(v_bucket_max, v_bucket_val), v_bucket_val);
    end loop;

    select percentile_cont(0.5) within group (order by x)
      into v_median from unnest(v_bucket_vals) x;

    v_derived := v_derived || jsonb_build_array(jsonb_build_object(
      'name',           v_new_name,
      'category',       'counter',
      'unit',           v_out_unit,
      'description',    format('Dérivé de ''%s'' par intégration temporelle', v_src_name),
      'derived_from',   v_src_name,
      'derived_method', 'trapezoidal_integration',
      'has_chart',      true,
      'chart',          jsonb_build_object('type', 'bar', 'points', v_bucket_arr),
      'stats',          jsonb_build_object(
        'last',   v_bucket_sum,
        'min',    coalesce(v_bucket_min, 0),
        'max',    coalesce(v_bucket_max, 0),
        'mean',   case when v_bucket_count > 0 then v_bucket_sum / v_bucket_count else 0 end,
        'median', coalesce(v_median, 0)
      )
    ));
  end loop;

  return jsonb_build_object('variables', v_derived);
end
$f$;

-- ============================================================================
-- 4. Trigger wrapper
-- ============================================================================
create or replace function public.reports_compute_derived_trg()
  returns trigger
  language plpgsql
as $f$
begin
  new.derived_payload := public.compute_derived_variables(
    new.payload,
    new.period_start,
    new.period_end,
    new.type::text,
    coalesce(new.payload->'metadata'->>'timezone', 'UTC')
  );
  return new;
end
$f$;

drop trigger if exists reports_compute_derived on public.reports;
create trigger reports_compute_derived
  before insert or update of payload on public.reports
  for each row
  when (new.type in ('daily','weekly'))
  execute function public.reports_compute_derived_trg();

-- ============================================================================
-- 5. Fonction utilitaire de re-traitement
-- ============================================================================
create or replace function public.rebuild_derived(p_report_id uuid)
  returns void
  language sql
as $f$
  update public.reports set payload = payload where id = p_report_id;
$f$;
