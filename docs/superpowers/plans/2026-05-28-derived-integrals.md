# Variables dérivées par intégration temporelle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Générer automatiquement à l'ingestion une variable `counter` dérivée (volume depuis un débit, énergie depuis une puissance) par intégration temporelle, stockée dans une nouvelle colonne `reports.derived_payload` pré-bucketisée en bars, consommée transparemment par le composant rapport existant.

**Architecture:** Trigger Postgres `BEFORE INSERT OR UPDATE OF payload ON reports WHEN type IN ('daily','weekly')` qui appelle une fonction PL/pgSQL `compute_derived_variables(payload jsonb, period_start timestamptz, period_end timestamptz, period_kind text) RETURNS jsonb`. Calcul en deux étapes : (1) série cumulative interne par intégration trapézoïdale avec clamp négatifs et coupure aux gaps > 15 min ; (2) bucketing en bars (1h pour daily, 24h pour weekly) avec interpolation linéaire aux bornes. Côté frontend : ajouter `derived_payload` à la sélection Supabase et fusionner les variables avant rendu — aucune modification de composant.

**Tech Stack:** PostgreSQL 15 (PL/pgSQL), Supabase migrations, Vue 3 + TypeScript (composable `usePeriodicReport`), spec : `docs/superpowers/specs/2026-05-28-derived-integrals-design.md`.

---

## File Structure

**Migrations (Postgres) — un seul fichier pour rester atomique** :
- Create: `supabase/migrations/20260528100000_derived_integrals.sql`
  - Colonne `reports.derived_payload jsonb`
  - Fonction `compute_derived_variables(jsonb, timestamptz, timestamptz, text) RETURNS jsonb`
  - Fonction wrapper trigger `reports_compute_derived_trg() RETURNS trigger`
  - Trigger `reports_compute_derived` sur `reports`
  - Fonction utilitaire `rebuild_derived(uuid) RETURNS void`

**Tests SQL** (nouvelle convention — pas de framework, scripts vérifiés à la main puis par psql) :
- Create: `supabase/tests/derived_integrals.sql` (assertions via `DO $$ ... ASSERT ... $$`)

**Frontend** :
- Modify: `app/src/composables/usePeriodicReport.ts` (sélection + fusion `payload.variables ⊕ derived_payload.variables`)
- Modify: `app/src/types/supabase.ts` (régénéré via `supabase gen types typescript`)

**Aucune modification** : `PeriodicReport.vue`, `DeviceReport.vue`, `SeriesChart.vue`, workflows n8n.

---

## Task 0 : Vérifier les pré-requis schéma

**Files:**
- Read: `supabase/migrations/` (audit), `app/src/types/supabase.ts`

- [ ] **Step 1: Vérifier que `reports` a bien les colonnes `period_start` et `period_end` en `timestamptz`**

Run :
```bash
psql "$DATABASE_URL" -c "\d reports"
```
Expected : présence de `period_start | timestamptz` et `period_end | timestamptz`.

Si absentes → STOP, créer une migration préliminaire pour les ajouter avant de continuer (hors scope de ce plan, mais signaler à l'auteur du plan).

- [ ] **Step 2: Vérifier que la table `reports` n'a pas déjà une colonne `derived_payload`**

Run :
```bash
psql "$DATABASE_URL" -c "\d reports" | grep derived_payload || echo "OK absent"
```
Expected : `OK absent`.

---

## Task 1 : Migration — colonne + squelette fonctions

**Files:**
- Create: `supabase/migrations/20260528100000_derived_integrals.sql`

- [ ] **Step 1: Créer le fichier de migration avec la colonne, les signatures de fonctions stubs et le trigger**

```sql
-- Migration : variables dérivées par intégration temporelle
-- Spec : docs/superpowers/specs/2026-05-28-derived-integrals-design.md

-- 1. Colonne
alter table public.reports
  add column if not exists derived_payload jsonb;

-- 2. Fonction principale — stub pour cette task, remplie en Task 2
create or replace function public.compute_derived_variables(
  p_payload jsonb,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_period_kind text
) returns jsonb
  language plpgsql
  immutable
as $$
begin
  -- Stub Task 1 : implémentation complète en Task 2
  return jsonb_build_object('variables', '[]'::jsonb);
end
$$;

-- 3. Wrapper trigger
create or replace function public.reports_compute_derived_trg()
  returns trigger
  language plpgsql
as $$
begin
  new.derived_payload := public.compute_derived_variables(
    new.payload, new.period_start, new.period_end, new.type::text
  );
  return new;
end
$$;

-- 4. Trigger
drop trigger if exists reports_compute_derived on public.reports;
create trigger reports_compute_derived
  before insert or update of payload on public.reports
  for each row
  when (new.type in ('daily','weekly'))
  execute function public.reports_compute_derived_trg();

-- 5. Fonction utilitaire de re-traitement
create or replace function public.rebuild_derived(p_report_id uuid)
  returns void
  language sql
as $$
  update public.reports set payload = payload where id = p_report_id;
$$;
```

- [ ] **Step 2: Appliquer la migration localement**

Run :
```bash
supabase db reset --local  # ou supabase migration up si DB déjà à jour
```
Expected : migration appliquée sans erreur.

- [ ] **Step 3: Smoke test du trigger (stub) sur un INSERT daily**

Run :
```sql
insert into reports (device_id, type, payload, period_start, period_end)
select id, 'daily'::report_type, '{"variables":[]}'::jsonb,
       now() - interval '1 day', now()
from devices limit 1
returning derived_payload;
```
Expected : `derived_payload = {"variables": []}`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260528100000_derived_integrals.sql
git commit -m "feat(reports): scaffold derived_payload column + trigger stub"
```

---

## Task 2 : Implémentation de l'intégration trapézoïdale + bucketing

**Files:**
- Modify: `supabase/migrations/20260528100000_derived_integrals.sql` (remplir le corps de `compute_derived_variables`)

> Note : on **édite la migration créée en Task 1** tant qu'elle n'a pas été push en prod. Si elle a déjà été appliquée en prod, créer une migration `20260528100100_derived_integrals_impl.sql` qui fait `create or replace function compute_derived_variables ...` avec le nouveau corps.

- [ ] **Step 1: Remplacer le corps de `compute_derived_variables` par l'implémentation complète**

Remplacer le bloc `begin ... return ... end` du stub par :

```sql
declare
  v_unit_factors constant jsonb := jsonb_build_object(
    'm3/h',  1.0/3600, 'l/h',   1.0/3600, 'l/min', 1.0/60, 'l/s',   1.0,
    'kw',    1.0/3600, 'w',     1.0/3600, 'kva',   1.0/3600
  );
  v_unit_outputs constant jsonb := jsonb_build_object(
    'm3/h', 'm³', 'l/h', 'L', 'l/min', 'L', 'l/s', 'L',
    'kw', 'kWh', 'w', 'Wh', 'kva', 'kVAh'
  );
  v_bucket_seconds bigint;
  v_derived jsonb := '[]'::jsonb;
  v_existing_names text[] := '{}'::text[];
  v_var jsonb;
  v_unit text;
  v_unit_norm text;
  v_kind text;  -- 'flow' | 'power'
  v_factor numeric;
  v_out_unit text;
  v_src_name text;
  v_new_name text;
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
  v_bucket_count int;
  v_bucket_idx int;
  v_b_start timestamptz; v_b_end timestamptz;
  v_cumul_start numeric; v_cumul_end numeric;
  v_bucket_val numeric;
  v_bucket_arr jsonb;
  v_bucket_sum numeric; v_bucket_min numeric; v_bucket_max numeric;
  v_bucket_vals numeric[];
  v_median numeric;
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

  -- Collecter noms existants (pour anti-collision)
  select coalesce(array_agg(lower(coalesce(v->>'name',''))), '{}')
    into v_existing_names
  from jsonb_array_elements(p_payload->'variables') v;

  for v_var in select * from jsonb_array_elements(p_payload->'variables')
  loop
    -- Filtres
    if coalesce(v_var->>'category','') <> 'measure' then continue; end if;

    v_unit := coalesce(v_var->>'unit','');
    v_unit_norm := lower(regexp_replace(replace(v_unit,'³','3'), '\s*/\s*', '/', 'g'));
    v_unit_norm := regexp_replace(v_unit_norm, '\s+', '', 'g');

    if not (v_unit_factors ? v_unit_norm) then continue; end if;

    v_factor   := (v_unit_factors->>v_unit_norm)::numeric;
    v_out_unit := v_unit_outputs->>v_unit_norm;
    v_kind     := case when v_unit_norm in ('m3/h','l/h','l/min','l/s') then 'flow' else 'power' end;

    -- Timeseries
    v_pts := v_var->'chart'->'points';
    if jsonb_typeof(v_pts) <> 'array' then continue; end if;
    v_n := jsonb_array_length(v_pts);
    if v_n < 2 then continue; end if;

    -- Nom dérivé
    v_src_name := coalesce(v_var->>'name','');
    if v_kind = 'flow' then
      v_new_name := regexp_replace(v_src_name, '(?i)(debit|flow)[_\s]*', '', 'g');
      v_new_name := nullif(v_new_name, '');
      v_new_name := 'Volume' || coalesce('_' || v_new_name, '_' || v_src_name);
    else
      v_new_name := regexp_replace(v_src_name, '(?i)(puissance|power)[_\s]*', '', 'g');
      v_new_name := nullif(v_new_name, '');
      v_new_name := 'Energie' || coalesce('_' || v_new_name, '_' || v_src_name);
    end if;

    -- Anti-collision
    if lower(v_new_name) = any(v_existing_names) then
      raise notice 'derived_integrals: skip % (collision with existing variable)', v_new_name;
      continue;
    end if;

    -- Étape 1 : série cumulative (parallèle arrays ts/val)
    v_cumul := 0;
    v_cumul_ts := '{}'::timestamptz[];
    v_cumul_val := '{}'::numeric[];
    v_t_prev := null;
    v_v_prev := null;

    for v_i in 0 .. v_n - 1 loop
      begin
        v_t_cur := (v_pts->v_i->>'ts')::timestamptz;
      exception when others then
        raise notice 'derived_integrals: skip variable % (invalid ts)', v_src_name;
        v_t_cur := null;
        exit;
      end;
      v_v_cur := (v_pts->v_i->>'value')::numeric;

      if v_t_prev is not null then
        v_dt := extract(epoch from (v_t_cur - v_t_prev));
        if v_dt > 0 and v_dt <= 900 then
          v_inc := ((greatest(v_v_prev,0) + greatest(v_v_cur,0)) / 2.0) * v_dt * v_factor;
          v_cumul := v_cumul + v_inc;
        end if;
        -- gap > 15 min ou dt <= 0 → cumul inchangé sur l'intervalle
      end if;

      v_cumul_ts  := v_cumul_ts || v_t_cur;
      v_cumul_val := v_cumul_val || v_cumul;
      v_t_prev := v_t_cur;
      v_v_prev := v_v_cur;
    end loop;

    if v_t_cur is null then continue; end if;  -- skip si ts invalide rencontré

    -- Étape 2 : bucketing
    v_bucket_count := greatest(1, ceil(extract(epoch from (p_period_end - p_period_start)) / v_bucket_seconds)::int);
    v_bucket_arr  := '[]'::jsonb;
    v_bucket_vals := '{}'::numeric[];
    v_bucket_sum := 0; v_bucket_min := null; v_bucket_max := null;

    for v_bucket_idx in 0 .. v_bucket_count - 1 loop
      v_b_start := p_period_start + (v_bucket_idx     * v_bucket_seconds) * interval '1 second';
      v_b_end   := p_period_start + ((v_bucket_idx+1) * v_bucket_seconds) * interval '1 second';
      v_cumul_start := public._derived_interpolate_cumul(v_cumul_ts, v_cumul_val, v_b_start);
      v_cumul_end   := public._derived_interpolate_cumul(v_cumul_ts, v_cumul_val, v_b_end);
      v_bucket_val  := greatest(0, v_cumul_end - v_cumul_start);

      v_bucket_arr := v_bucket_arr || jsonb_build_object(
        'ts', to_char(v_b_start at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'value', v_bucket_val
      );
      v_bucket_vals := v_bucket_vals || v_bucket_val;
      v_bucket_sum := v_bucket_sum + v_bucket_val;
      v_bucket_min := least(coalesce(v_bucket_min, v_bucket_val), v_bucket_val);
      v_bucket_max := greatest(coalesce(v_bucket_max, v_bucket_val), v_bucket_val);
    end loop;

    -- Médiane
    select percentile_cont(0.5) within group (order by x)
      into v_median from unnest(v_bucket_vals) x;

    v_derived := v_derived || jsonb_build_object(
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
    );
  end loop;

  return jsonb_build_object('variables', v_derived);
end
```

- [ ] **Step 2: Ajouter la fonction d'interpolation linéaire (avant `compute_derived_variables`)**

```sql
create or replace function public._derived_interpolate_cumul(
  p_ts timestamptz[],
  p_val numeric[],
  p_target timestamptz
) returns numeric
  language plpgsql
  immutable
as $$
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
$$;
```

Cette fonction doit être déclarée **avant** `compute_derived_variables` dans le fichier de migration (Postgres résout les dépendances par ordre d'apparition pour `create or replace`).

- [ ] **Step 3: Appliquer la migration mise à jour**

Run :
```bash
supabase db reset --local
```
Expected : migration s'applique sans erreur.

- [ ] **Step 4: Smoke test manuel — 24 samples constants 3 m³/h sur 24h**

Run (psql) :
```sql
with src as (
  select jsonb_agg(jsonb_build_object(
    'ts', (timestamp '2026-05-28 00:00:00+00' + (i || ' hour')::interval),
    'value', 3
  ) order by i) as pts
  from generate_series(0, 24) i
)
select compute_derived_variables(
  jsonb_build_object('variables', jsonb_build_array(jsonb_build_object(
    'name', 'Debit_eau', 'category', 'measure', 'unit', 'm³/h',
    'chart', jsonb_build_object('type', 'line', 'points', (select pts from src))
  ))),
  '2026-05-28 00:00:00+00'::timestamptz,
  '2026-05-29 00:00:00+00'::timestamptz,
  'daily'
) -> 'variables' -> 0 -> 'stats' -> 'last';
```
Expected : `72.0` (3 m³/h × 24h = 72 m³), tolérance ±0.01.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260528100000_derived_integrals.sql
git commit -m "feat(reports): implement trapezoidal integration + bucketing for derived variables"
```

---

## Task 3 : Suite de tests SQL

**Files:**
- Create: `supabase/tests/derived_integrals.sql`

- [ ] **Step 1: Créer la suite de tests**

```sql
-- Suite de tests pour compute_derived_variables
-- Exécution : psql "$DATABASE_URL" -f supabase/tests/derived_integrals.sql
-- Échoue à la première assertion violée.

\set ON_ERROR_STOP on

-- Helper inline : génère une timeseries
do $$
declare
  r jsonb;
  s numeric;
begin
  -- T1 : 24h constant 3 m³/h → 72 m³
  r := compute_derived_variables(
    jsonb_build_object('variables', jsonb_build_array(jsonb_build_object(
      'name','Debit_eau','category','measure','unit','m³/h',
      'chart', jsonb_build_object('type','line','points',(
        select jsonb_agg(jsonb_build_object(
          'ts', to_char(timestamp '2026-01-01 00:00:00+00' + (i||' hour')::interval, 'YYYY-MM-DD"T"HH24:MI:SSOF'),
          'value', 3
        ) order by i) from generate_series(0,24) i
      ))
    ))),
    '2026-01-01 00:00:00+00','2026-01-02 00:00:00+00','daily'
  );
  s := (r->'variables'->0->'stats'->>'last')::numeric;
  assert abs(s - 72) < 0.1, format('T1 failed: expected ~72, got %s', s);
  raise notice 'T1 OK: %', s;
end $$;

-- T2 : rampe 0 → 6 m³/h sur 1h, 1 sample/min → ~3 m³
do $$
declare r jsonb; s numeric;
begin
  r := compute_derived_variables(
    jsonb_build_object('variables', jsonb_build_array(jsonb_build_object(
      'name','Debit','category','measure','unit','m3/h',
      'chart', jsonb_build_object('type','line','points',(
        select jsonb_agg(jsonb_build_object(
          'ts', to_char(timestamp '2026-01-01 00:00:00+00' + (i||' minute')::interval,'YYYY-MM-DD"T"HH24:MI:SSOF'),
          'value', 6.0 * i / 60.0
        ) order by i) from generate_series(0,60) i
      ))
    ))),
    '2026-01-01 00:00:00+00','2026-01-02 00:00:00+00','daily'
  );
  s := (r->'variables'->0->'stats'->>'last')::numeric;
  assert abs(s - 3) < 0.05, format('T2 failed: expected ~3, got %s', s);
  raise notice 'T2 OK: %', s;
end $$;

-- T3 : sample négatif → clampé à 0
do $$
declare r jsonb; s numeric;
begin
  r := compute_derived_variables(
    jsonb_build_object('variables', jsonb_build_array(jsonb_build_object(
      'name','Debit','category','measure','unit','m³/h',
      'chart', jsonb_build_object('type','line','points', jsonb_build_array(
        jsonb_build_object('ts','2026-01-01T00:00:00+00','value',3),
        jsonb_build_object('ts','2026-01-01T00:05:00+00','value',-100),
        jsonb_build_object('ts','2026-01-01T00:10:00+00','value',3)
      ))
    ))),
    '2026-01-01 00:00:00+00','2026-01-02 00:00:00+00','daily'
  );
  s := (r->'variables'->0->'stats'->>'last')::numeric;
  -- 5 min de moyenne (3+0)/2 = 1.5 m³/h, puis 5 min de (0+3)/2 = 1.5 m³/h
  -- = 1.5*(10/60) = 0.25 m³
  assert abs(s - 0.25) < 0.01, format('T3 failed: expected ~0.25, got %s', s);
  raise notice 'T3 OK: %', s;
end $$;

-- T4 : unité non whitelistée → absente
do $$
declare r jsonb;
begin
  r := compute_derived_variables(
    jsonb_build_object('variables', jsonb_build_array(jsonb_build_object(
      'name','Temp','category','measure','unit','°C',
      'chart', jsonb_build_object('type','line','points', jsonb_build_array(
        jsonb_build_object('ts','2026-01-01T00:00:00+00','value',20),
        jsonb_build_object('ts','2026-01-01T01:00:00+00','value',22)
      ))
    ))),
    '2026-01-01 00:00:00+00','2026-01-02 00:00:00+00','daily'
  );
  assert jsonb_array_length(r->'variables') = 0, 'T4 failed: should be empty';
  raise notice 'T4 OK';
end $$;

-- T5 : 1 seul sample → ignoré
do $$
declare r jsonb;
begin
  r := compute_derived_variables(
    jsonb_build_object('variables', jsonb_build_array(jsonb_build_object(
      'name','Debit','category','measure','unit','m³/h',
      'chart', jsonb_build_object('type','line','points', jsonb_build_array(
        jsonb_build_object('ts','2026-01-01T00:00:00+00','value',5)
      ))
    ))),
    '2026-01-01 00:00:00+00','2026-01-02 00:00:00+00','daily'
  );
  assert jsonb_array_length(r->'variables') = 0, 'T5 failed: should be empty';
  raise notice 'T5 OK';
end $$;

-- T6 : 60 samples L/min de 10 L/min sur 60 min → 600 L
do $$
declare r jsonb; s numeric;
begin
  r := compute_derived_variables(
    jsonb_build_object('variables', jsonb_build_array(jsonb_build_object(
      'name','Debit','category','measure','unit','L/min',
      'chart', jsonb_build_object('type','line','points',(
        select jsonb_agg(jsonb_build_object(
          'ts', to_char(timestamp '2026-01-01 00:00:00+00' + (i||' minute')::interval,'YYYY-MM-DD"T"HH24:MI:SSOF'),
          'value', 10
        ) order by i) from generate_series(0,60) i
      ))
    ))),
    '2026-01-01 00:00:00+00','2026-01-02 00:00:00+00','daily'
  );
  s := (r->'variables'->0->'stats'->>'last')::numeric;
  assert abs(s - 600) < 1, format('T6 failed: expected ~600, got %s', s);
  raise notice 'T6 OK: %', s;
end $$;

-- T7 : collision (Volume_eau déjà présent) → skip
do $$
declare r jsonb;
begin
  r := compute_derived_variables(
    jsonb_build_object('variables', jsonb_build_array(
      jsonb_build_object('name','Volume_eau','category','counter','unit','m³',
        'chart', jsonb_build_object('type','bar','points', jsonb_build_array(
          jsonb_build_object('ts','2026-01-01T00:00:00+00','value',1)
        ))
      ),
      jsonb_build_object('name','Debit_eau','category','measure','unit','m³/h',
        'chart', jsonb_build_object('type','line','points', jsonb_build_array(
          jsonb_build_object('ts','2026-01-01T00:00:00+00','value',3),
          jsonb_build_object('ts','2026-01-01T01:00:00+00','value',3)
        ))
      )
    )),
    '2026-01-01 00:00:00+00','2026-01-02 00:00:00+00','daily'
  );
  assert jsonb_array_length(r->'variables') = 0, 'T7 failed: should be empty (collision)';
  raise notice 'T7 OK';
end $$;

-- T8 : trigger ne fire pas sur type='status' (insert via SQL pour vérifier)
do $$
declare did uuid; dp jsonb;
begin
  select id into did from devices limit 1;
  if did is null then
    raise notice 'T8 SKIP: no devices in DB';
    return;
  end if;
  insert into reports (device_id, type, payload, period_start, period_end)
  values (did, 'status', '{"variables":[]}'::jsonb, now() - interval '1 minute', now())
  returning derived_payload into dp;
  assert dp is null, format('T8 failed: derived_payload should be NULL for status, got %s', dp);
  raise notice 'T8 OK';
  -- cleanup
  delete from reports where device_id = did and type = 'status' and payload = '{"variables":[]}'::jsonb;
end $$;

\echo 'All tests passed.'
```

- [ ] **Step 2: Lancer la suite**

Run :
```bash
psql "$DATABASE_URL" -f supabase/tests/derived_integrals.sql
```
Expected : 7 `NOTICE: Tn OK: …` puis `All tests passed.`. Si une assertion échoue, le script s'arrête sur l'erreur.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/derived_integrals.sql
git commit -m "test(reports): suite de validation compute_derived_variables"
```

---

## Task 4 : Frontend — fusion `payload ⊕ derived_payload` dans le composable

**Files:**
- Modify: `app/src/composables/usePeriodicReport.ts`

- [ ] **Step 1: Lire le composable existant pour repérer la sélection Supabase et la construction du résultat**

Run :
```bash
grep -n "select\|payload" app/src/composables/usePeriodicReport.ts
```
Expected : repérage de la ligne `.select('payload, received_at, period_start, period_end')` (~ligne 41) et de la construction `payload: (reportRes.data?.payload as PeriodicPayload | undefined) ?? null` (~ligne 63).

- [ ] **Step 2: Modifier la sélection pour inclure `derived_payload`**

Remplacer :
```ts
.select('payload, received_at, period_start, period_end')
```
par :
```ts
.select('payload, derived_payload, received_at, period_start, period_end')
```

- [ ] **Step 3: Fusionner les variables avant retour**

Remplacer la construction du résultat (ligne ~63) :
```ts
payload: (reportRes.data?.payload as PeriodicPayload | undefined) ?? null,
```
par :
```ts
payload: (() => {
  const base = (reportRes.data?.payload as PeriodicPayload | undefined) ?? null
  const derived = (reportRes.data as { derived_payload?: PeriodicPayload | null } | null)?.derived_payload
  if (!base) return null
  const derivedVars = derived?.variables ?? []
  if (derivedVars.length === 0) return base
  return { ...base, variables: [...(base.variables ?? []), ...derivedVars] }
})(),
```

- [ ] **Step 4: Type-check**

Run :
```bash
cd app && pnpm typecheck
```
Expected : 0 erreur.

- [ ] **Step 5: Test visuel manuel — charger un device avec une variable débit/puissance et vérifier que la variable dérivée apparaît avec son bargraphe**

Run :
```bash
cd app && pnpm dev
```
Naviguer vers un rapport `daily` d'un device qui a une variable de débit ou de puissance dans son payload. Vérifier visuellement :
- La variable `Volume_*` ou `Energie_*` apparaît en bas de la liste
- Le bargraphe affiche bien les bars heure par heure
- `stats.last` correspond au total

Si pas de device avec données réelles : injecter un rapport de test :
```sql
insert into reports (device_id, type, payload, period_start, period_end)
select id, 'daily'::report_type,
  jsonb_build_object('variables', jsonb_build_array(jsonb_build_object(
    'name','Debit_eau','category','measure','unit','m³/h','has_chart',true,
    'chart', jsonb_build_object('type','line','points',(
      select jsonb_agg(jsonb_build_object(
        'ts', to_char(date_trunc('day', now()) + (i||' hour')::interval, 'YYYY-MM-DD"T"HH24:MI:SSOF'),
        'value', 3
      ) order by i) from generate_series(0,24) i
    ))
  ))),
  date_trunc('day', now()), date_trunc('day', now()) + interval '1 day'
from devices limit 1;
```

- [ ] **Step 6: Commit**

```bash
git add app/src/composables/usePeriodicReport.ts
git commit -m "feat(reports): fusionner derived_payload dans le composable rapport"
```

---

## Task 5 : Régénérer les types Supabase

**Files:**
- Modify: `app/src/types/supabase.ts`

- [ ] **Step 1: Régénérer**

Run (commande exacte selon le setup local, à adapter au projet) :
```bash
supabase gen types typescript --local > app/src/types/supabase.ts
# ou : supabase gen types typescript --project-id <id> > app/src/types/supabase.ts
```
Expected : la définition de la table `reports` inclut maintenant `derived_payload: Json | null`.

- [ ] **Step 2: Vérifier la régénération**

Run :
```bash
grep -A 5 "reports:" app/src/types/supabase.ts | head -20
```
Expected : champ `derived_payload` présent.

- [ ] **Step 3: Type-check**

Run :
```bash
cd app && pnpm typecheck
```
Expected : 0 erreur.

- [ ] **Step 4: Commit**

```bash
git add app/src/types/supabase.ts
git commit -m "chore(types): régénérer supabase types avec derived_payload"
```

---

## Task 6 : Backfill historique

**Files:**
- Aucun fichier nouveau — opération one-shot via SQL.

- [ ] **Step 1: Comptage initial**

Run :
```sql
select count(*) from reports
where type in ('daily','weekly') and derived_payload is null;
```
Noter le nombre N.

- [ ] **Step 2: Backfill par lots de 500 jusqu'à 0**

Exécuter en boucle :
```sql
do $$
declare r int;
begin
  loop
    with todo as (
      select id from reports
      where type in ('daily','weekly') and derived_payload is null
      limit 500
    )
    update reports r set payload = r.payload from todo where r.id = todo.id;
    get diagnostics r = row_count;
    raise notice 'updated %', r;
    exit when r = 0;
  end loop;
end $$;
```

- [ ] **Step 3: Vérifier que tous les rapports sont traités**

Run :
```sql
select count(*) from reports
where type in ('daily','weekly') and derived_payload is null;
```
Expected : 0.

- [ ] **Step 4: Échantillonnage**

Run :
```sql
select id, type, jsonb_array_length(derived_payload->'variables') as nb_derived
from reports
where type in ('daily','weekly')
order by received_at desc
limit 20;
```
Expected : majorité avec 0 variables dérivées (les devices sans débit/puissance), quelques-uns avec 1+ pour les devices concernés.

- [ ] **Step 5: Pas de commit** — backfill est un acte d'opération en DB, rien à committer.

---

## Task 7 : Validation finale

- [ ] **Step 1: Re-run tests SQL en bout de chaîne**

Run :
```bash
psql "$DATABASE_URL" -f supabase/tests/derived_integrals.sql
```
Expected : `All tests passed.`

- [ ] **Step 2: Valider visuellement sur device réel**

Charger dans le navigateur le rapport daily du device qui a motivé la demande client (celui avec `Debit_*` ou similaire) et vérifier que la nouvelle variable `Volume_*` apparaît avec un bargraphe lisible (pas de chute à 0 due au reset compteur source).

- [ ] **Step 3: Build production**

Run :
```bash
cd app && pnpm build
```
Expected : 0 erreur.

- [ ] **Step 4: Sanity check `analyze-report`**

`analyze-report` ne consomme pas `derived_payload` (hors scope). Vérifier qu'aucun appel n'a régressé en lançant manuellement la fonction sur un rapport récent :
```bash
curl -X POST "$SUPABASE_URL/functions/v1/analyze-report" \
  -H "Authorization: Bearer $SERVICE_ROLE" \
  -d '{"report_id":"<id_d_un_daily_récent>"}'
```
Expected : 200 OK, comportement inchangé.

---

## Self-Review Notes

**Couverture spec :**
- §2 D1 (détection par unité) → Task 2 step 1 (whitelist `v_unit_factors`)
- §2 D2 (counter cumulatif drop-in) → Task 2 step 1 (`'category', 'counter'`, bars pré-bucketisés)
- §2 D3 (colonne `derived_payload`) → Task 1 step 1
- §2 D4 (trigger Postgres) → Task 1 step 1
- §2 D5 (daily/weekly only) → Task 1 step 1 (clause `when` du trigger)
- §2 D6 (renommage) → Task 2 step 1 (regex Volume_/Energie_)
- §2 D7 (gap > 15 min) → Task 2 step 1 (clause `v_dt <= 900`)
- §2 D8 (clamp négatifs) → Task 2 step 1 (`greatest(..., 0)`)
- §2 D9 (collision skip) → Task 2 step 1 (`v_existing_names`)
- §3 whitelist unités → Task 2 step 1 (`v_unit_factors`, `v_unit_outputs`)
- §6 algorithme → Task 2 step 1 + step 2
- §7 frontend → Task 4
- §8 backfill → Task 6
- §9 tests → Task 3 (T1–T8) + Task 7

**Risque résiduel identifié :** la fonction `compute_derived_variables` n'est marquée `immutable` que par convention (elle ne lit pas de tables externes). Si plus tard on veut indexer dessus en expression index, OK. Sinon aucun impact.
