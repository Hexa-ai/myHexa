# Design — Variables dérivées par intégration temporelle (débit→volume, puissance→énergie)

**Date** : 2026-05-28
**Auteur** : Julien Talbourdet
**Statut** : approuvé pour planification

## 1. Contexte et problème

Les rapports `daily`/`weekly` de myHexa affichent les variables `counter` sous forme de bargraphe : pour chaque bucket (heure en daily, jour en hebdo), on affiche `max − min` de la valeur du compteur sur le bucket. Cela suppose que le compteur est **monotone croissant** sur la période du rapport.

Un client a créé une variable `volume` de type `counter` dans son device, mais son automate remet le compteur à 0 chaque jour à minuit. Le bargraphe hebdo devient illisible (chutes brutales à chaque reset). Le device remonte par ailleurs un débit en `m³/h` en `measure`.

**Demande** : que myHexa génère automatiquement, à partir des `measure` de type débit ou puissance, une variable dérivée (volume ou énergie) par intégration temporelle, immédiatement utilisable dans les vues rapport.

## 2. Décisions structurantes

| # | Décision | Choix |
|---|---|---|
| D1 | Détection des variables à intégrer | Par unité déclarée (whitelist normalisée) |
| D2 | Type de la variable dérivée | `category: 'counter'` cumulatif depuis 0 sur la période → drop-in pour le bargraphe |
| D3 | Stockage | Nouvelle colonne `reports.derived_payload jsonb`, même forme que `payload` |
| D4 | Lieu du calcul | Trigger Postgres `BEFORE INSERT/UPDATE` (caller-agnostic : n8n actuel, Supabase futur, re-ingestion) |
| D5 | Portée | Rapports `daily` et `weekly` uniquement (pas `status`) |
| D6 | Renommage | `Debit_*` → `Volume_*`, `Puissance_*` → `Energie_*`. Si l'unité ne matche ni débit ni puissance → skip. Pas de fallback générique. |
| D7 | Gap > 15 min entre samples | Aucune intégration sur l'intervalle, série continue au même niveau |
| D8 | Valeurs négatives | Clampées à 0 |
| D9 | Collision avec une variable existante du même nom dérivé | Skip silencieux (`+ RAISE NOTICE`) |

## 3. Whitelist d'unités

Normalisation appliquée avant lookup : lowercase, `³` → `3`, suppression des espaces autour du `/`.

| Unité source normalisée | Unité dérivée | Facteur (source · seconde → dérivée) |
|---|---|---|
| `m3/h` | `m³` | 1/3600 |
| `l/h` | `L` | 1/3600 |
| `l/min` | `L` | 1/60 |
| `l/s` | `L` | 1 |
| `kw` | `kWh` | 1/3600 |
| `w` | `Wh` | 1/3600 |
| `kva` | `kVAh` | 1/3600 |

Toute autre unité → variable ignorée pour la dérivation.

## 4. Architecture

```
[Device] → [n8n Ingestion | Supabase ingestion futur]
              │ INSERT INTO reports (payload, type, ...)
              ▼
        ┌──────────────────────────────────────────────────┐
        │ Trigger BEFORE INSERT OR UPDATE OF payload       │
        │ ON reports                                       │
        │ WHEN (NEW.type IN ('daily','weekly'))            │
        │   NEW.derived_payload :=                         │
        │     compute_derived_variables(NEW.payload)       │
        └──────────────────────────────────────────────────┘
              │
              ▼
        reports.payload (intact)
        reports.derived_payload (nouveau)
              │
              ▼
        [PeriodicReport.vue / DeviceReport.vue]
        fusionne payload.variables ⊕ derived_payload.variables
        → bargraphe existant (logique max−min counter)
```

Le `payload` d'origine n'est jamais muté — auditabilité et debug préservés. Le re-traitement consiste à faire `UPDATE reports SET payload = payload WHERE …` ou appeler `rebuild_derived(report_id)`.

## 5. Schéma de données

### 5.1 Migration

```sql
alter table reports
  add column derived_payload jsonb;

-- Fonction de calcul : implémentation détaillée en §6
create or replace function compute_derived_variables(p jsonb) returns jsonb
  language plpgsql as $$ /* voir §6 */ $$;

-- Wrapper trigger qui pose NEW.derived_payload
create or replace function reports_compute_derived_trg() returns trigger
  language plpgsql as $$
begin
  new.derived_payload := compute_derived_variables(new.payload);
  return new;
end $$;

-- Trigger
create trigger reports_compute_derived
  before insert or update of payload on reports
  for each row
  when (new.type in ('daily','weekly'))
  execute function reports_compute_derived_trg();

-- Fonction utilitaire de re-traitement manuel
create or replace function rebuild_derived(rid uuid) returns void as $$
  update reports set payload = payload where id = rid;
$$ language sql;
```

Pas d'index sur `derived_payload` (pas de requête de filtrage prévue).

### 5.2 Forme de `derived_payload`

Identique à `payload`, restreinte aux variables produites :

```json
{
  "variables": [
    {
      "name": "Volume_eau",
      "category": "counter",
      "unit": "m³",
      "description": "Dérivé de 'Debit_eau' par intégration temporelle",
      "derived_from": "Debit_eau",
      "derived_method": "trapezoidal_integration",
      "stats": { "last": 12.34, "min": 0, "max": 12.34, "mean": 6.17, "median": 6.10 },
      "samples": [
        { "ts": "2026-05-28T00:00:00Z", "value": 0 },
        { "ts": "2026-05-28T00:15:00Z", "value": 0.75 },
        { "ts": "2026-05-28T00:30:00Z", "value": 1.50 }
      ]
    }
  ]
}
```

Si aucune variable n'est éligible : `{"variables": []}` (et non `null`), pour distinguer « calculé, rien à dériver » de « pas encore traité ».

## 6. Algorithme d'intégration

Pour chaque variable source éligible (catégorie `measure`, unité whitelistée, ≥ 2 samples triés par `ts` croissant) :

```
volume_cumulé ← 0
samples_dérivés ← [{ ts: t₀, value: 0 }]
pour i de 1 à n-1:
    Δt_sec ← (tᵢ - tᵢ₋₁) en secondes
    si Δt_sec > 900 (15 min):
        samples_dérivés.push({ ts: tᵢ, value: volume_cumulé })   # gap : pas d'intégration
        continue
    v₁ ← max(0, valeur_source[i-1])
    v₂ ← max(0, valeur_source[i])
    incrément ← ((v₁ + v₂) / 2) × Δt_sec × FACTEUR_UNITÉ
    volume_cumulé ← volume_cumulé + incrément
    samples_dérivés.push({ ts: tᵢ, value: volume_cumulé })
```

**Stats recalculées** sur la série dérivée :
- `last` = `volume_cumulé` final
- `min` = 0
- `max` = `last`
- `mean`/`median` = calculés sur les valeurs des samples dérivés

**Règles de nommage** :
- Unité débit → préfixe `Volume_` ; on retire `Debit`/`debit`/`Flow`/`flow` du nom source (insensible casse, séparateurs `_` ou ` `) puis on préfixe. Ex: `Debit_eau` → `Volume_eau` ; `Flow Compresseur` → `Volume_Compresseur` ; nom sans match → `Volume_<nom_source>`.
- Unité puissance → idem avec `Energie_` et retrait de `Puissance`/`puissance`/`Power`/`power`.

**Edge cases** :
- `< 2 samples` → variable ignorée
- Tous samples à 0 → série dérivée plate à 0 émise
- Timestamp invalide → variable ignorée, `RAISE NOTICE`
- Collision (`Volume_eau` déjà présent dans `payload.variables`) → variable ignorée, `RAISE NOTICE`

## 7. Côté frontend

Modification minimale dans `app/src/components/PeriodicReport.vue` et `app/src/components/DeviceReport.vue` :

```ts
const allVariables = computed(() => [
  ...(report.value?.payload?.variables ?? []),
  ...(report.value?.derived_payload?.variables ?? []),
])
```

Les variables dérivées sont déjà au format `counter` cumulatif → le composant bargraphe existant les affiche sans aucune autre modification. Les types TypeScript de `reports` (généré via `supabase gen types`) doivent être régénérés.

## 8. Backfill

Après déploiement de la migration :

1. Comptage initial : `select count(*) from reports where type in ('daily','weekly') and derived_payload is null;`
2. Backfill par lots de 500, idempotent :
   ```sql
   update reports set payload = payload
   where id in (
     select id from reports
     where type in ('daily','weekly') and derived_payload is null
     limit 500
   );
   ```
3. Répéter jusqu'à 0 ligne restante. Pas de besoin de transaction longue : le trigger calcule à la volée.

## 9. Tests

Suite SQL (`supabase/tests/derived_integrals.sql` ou pgTAP si présent) :

| # | Cas | Attendu |
|---|---|---|
| T1 | 10 samples débit constant 3 m³/h sur 1h | `last ≈ 3.0 m³` (±1%) |
| T2 | Rampe linéaire 0 → 6 m³/h sur 1h | `last ≈ 3.0 m³` (aire trapèze) |
| T3 | Gap de 30 min au milieu de la série | Volume sur l'intervalle gappé = 0 |
| T4 | Sample négatif | Clamp à 0, volume inchangé pour ce pas |
| T5 | Variable `measure` avec unité `°C` | Absente de `derived_payload` |
| T6 | Variable avec 1 sample | Absente |
| T7 | Insert d'un rapport `type='status'` | `derived_payload` reste NULL |
| T8 | Daily sans aucune variable éligible | `derived_payload = '{"variables":[]}'::jsonb` |
| T9 | 60 samples L/min de 10 L/min sur 60 min | `last ≈ 600 L` |
| T10 | Variable `Volume_eau` déjà dans `payload` | Dérivation skip, `RAISE NOTICE` |

## 10. Observabilité

- `RAISE NOTICE` (niveau silencieux par défaut) pour les skips dus à timestamps invalides ou collisions
- Fonction `rebuild_derived(report_id uuid)` exposée pour re-traitement manuel
- Vue optionnelle `reports_with_derived_count` pour monitoring : `jsonb_array_length(derived_payload->'variables')`

## 11. Hors scope

- Pas de configuration par device (la whitelist d'unités est l'opt-in implicite)
- Pas d'extension à `reports.type = 'status'` (déclenchable plus tard si besoin live)
- Pas d'utilisation des dérivées par `analyze-report` (extension future)
- Pas d'unités additionnelles au démarrage (`Nm³/h`, `t/h`, `kcal/h`, etc.) — extensibles par ajout dans la fonction
- Pas de gestion du refoulement signé (clamp à 0 = seul cas d'usage envisagé)

## 12. Risques et mitigations

| Risque | Mitigation |
|---|---|
| Performance du trigger sur gros payloads | PL/pgSQL pur, pas de réseau ; bench attendu < 10 ms par rapport de taille typique. À mesurer sur 10 plus gros rapports historiques. |
| Migration n8n → Supabase casse l'ingestion | Trigger DB est caller-agnostic, fonctionne identiquement pour les deux chemins. Aucun appel applicatif à câbler. |
| Backfill long sur historique volumineux | Lots de 500 + idempotence (`update set payload = payload`) → reprenable, pas de lock long. |
| Unité libre saisie avec typo (`m^3/h`, `m3/hr`) | Normalisation actuelle ne couvre pas → variable simplement ignorée. Documentation utilisateur à écrire séparément si besoin. |
