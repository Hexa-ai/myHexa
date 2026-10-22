# Réalignement dépôt ↔ production (2026-10-22)

## Pourquoi

Au 22/10/2026, le dépôt ne permettait plus de reconstruire la base de production :

- les migrations de la prod avaient été appliquées depuis Supabase (MCP) sous d'autres numéros de version ; seules 3 des 39 migrations de la prod portaient le même numéro dans le dépôt ;
- plusieurs changements avaient été faits à la main dans le dashboard et n'existaient dans aucune migration ;
- deux Edge Functions déployées étaient plus récentes que leur code dans le dépôt.

## Ce qui change dans ce commit

### Migrations (`supabase/migrations/`)

- Les 39 fichiers reprennent **exactement** l'historique de la prod (`supabase_migrations.schema_migrations` : mêmes versions, mêmes noms, mêmes instructions SQL).
- 3 fichiers `*_manual_*` reconstituent les changements faits à la main, placés juste avant la migration qui en a besoin :
  - `20260520192906_manual_recipients_allowed_device_ids` : colonne héritée de n8n, découpée puis supprimée par `20260520192907` ;
  - `20260520193135_manual_connectivity_alerts` : table d'état des alertes ;
  - `20260528003900_manual_reports_periods_and_company_limits` : `companies.max_daily_reports` / `max_weekly_reports`, `reports.period_start` / `period_end` et 2 index uniques.
- Supprimé : `20260426150000_add_device_alert_state` (jamais appliquée en prod, remplacée par `connectivity_alerts`).

**À faire une fois en prod, avec l'accord de Julien** : enregistrer les 3 fichiers manuels comme déjà appliqués, **sans les exécuter** (le premier recréerait une colonne supprimée) :

```
supabase migration repair --status applied 20260520192906 20260520193135 20260528003900 --project-ref mlbezfyjbnjyogogqmem
```

### Edge Functions

| Fonction | Choix |
|---|---|
| `cron-status-email` | code de la prod (v18 du 26/05), plus récent que le dépôt |
| `cron-connectivity-alerts` | code de la prod (v12 du 21/05), plus récent que le dépôt |
| `submit-intervention`, `invite-recipient`, `delete-recipient`, `share-device` | inchangé : identique à la prod à la mise en forme près |
| `analyze-report` | inchangé : **le dépôt est plus récent que la prod** (repli sur l'historique des alarmes, constante MAD renommée). Déployer cette fonction mettra donc en service ces changements. |

## Vérification

Sur le projet de test `myHexa-test` :

1. base vidée, puis les 42 fichiers de `supabase/migrations/` rejoués dans l'ordre ;
2. comparaison du catalogue avec la prod (tables, colonnes, contraintes, index, fonctions SQL, triggers, politiques RLS, droits, types, buckets) : **0 différence** ;
3. données et fichiers de la prod recopiés, Edge Functions de cette branche déployées, tests de fumée OK.

## Écarts restants côté prod (hors dépôt, à décider)

- **Tâches pg_cron** : la prod n'a que `cron-status-email` (tous les jours à 5 h UTC). `cron-connectivity-alerts` **n'est pas planifiée** : les alertes de perte de connexion ne partent donc pas depuis Supabase. Il faut vérifier si n8n les envoie encore.
- **Fonctions mortes encore déployées en prod**, absentes du dépôt depuis le 20/05 : `view-report`, `view-periodic-report`, `view-supervision`, `recover-link`, `location-update` (elles lisent `report_tokens`, supprimée) et `backfill-recipients-auth` (ponctuelle, protégée par `x-cron-secret`). À supprimer.
- **Auth** : l'inscription libre est activée (`disable_signup = false`).
