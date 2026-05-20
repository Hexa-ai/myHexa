# Migration des workflows n8n → Supabase Edge Functions + pg_cron

Ce document décrit le setup manuel à faire **une fois** côté Supabase pour
basculer les workflows n8n `Connectivity Alerts` et `Daily Status Email` sur
des Edge Functions schedulées via `pg_cron`.

## 1. Edge Function Secrets

Dashboard → **Project Settings → Edge Functions → Secrets** → ajouter :

| Clé | Valeur | Pourquoi |
|---|---|---|
| `GMAIL_USER` | `julien.talbourdet@hexa-ai.fr` | Login SMTP Gmail Workspace |
| `GMAIL_APP_PASSWORD` | (App Password 16 car. — voir Auth SMTP déjà configuré) | Mot de passe applicatif Workspace |
| `GMAIL_FROM_NAME` | `Julien Talbourdet` *(optionnel)* | Nom affiché dans le From |
| `GEMINI_API_KEY` | (récupère sur https://aistudio.google.com/apikey) | Clé Gemini pour le brief IA hebdo |
| `CRON_SECRET` | (génère un secret aléatoire ≥ 32 car.) | Protège l'appel cron des edge functions |
| `APP_URL` | `https://my.hexa-ai.fr` | Base URL pour les liens dans les emails |

> **Astuce génération CRON_SECRET** :
> ```bash
> openssl rand -hex 32
> ```

## 2. Activer pg_cron + pg_net

Dashboard → **Database → Extensions** → activer si pas déjà fait :
- `pg_cron`
- `pg_net`

## 3. Programmer les crons

Dashboard → **SQL Editor** → exécuter (en remplaçant `<CRON_SECRET>` par la
valeur choisie à l'étape 1) :

```sql
-- Connectivity alerts every 15 minutes
SELECT cron.schedule(
  'cron-connectivity-alerts',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mlbezfyjbnjyogogqmem.supabase.co/functions/v1/cron-connectivity-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Status email every day at 7h Europe/Paris (= 5h UTC en été, 6h UTC en hiver)
-- pg_cron utilise UTC. On déclenche tous les jours à 5h UTC et la fonction
-- filtre elle-même selon le jour de la semaine en Europe/Paris.
SELECT cron.schedule(
  'cron-status-email',
  '0 5 * * *',
  $$
  SELECT net.http_post(
    url := 'https://mlbezfyjbnjyogogqmem.supabase.co/functions/v1/cron-status-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

> ⚠️ L'heure d'été/hiver fait que **5h UTC** = 7h Paris en été mais 6h Paris
> en hiver. Pour rester rigoureux : `0 6 * * *` en hiver, `0 5 * * *` en été.
> Sinon : accepter le décalage 6h↔7h sur 6 mois de l'année.

## 4. Test manuel

Tester chaque edge function avant d'attendre le cron :

```bash
# Cron secret en variable d'env locale
export CRON_SECRET=...

curl -i -X POST https://mlbezfyjbnjyogogqmem.supabase.co/functions/v1/cron-connectivity-alerts \
  -H "x-cron-secret: $CRON_SECRET"

curl -i -X POST https://mlbezfyjbnjyogogqmem.supabase.co/functions/v1/cron-status-email \
  -H "x-cron-secret: $CRON_SECRET"
```

Réponse attendue (JSON) :
- `{"ok": true, "transitions": 0, ...}` pour connectivity
- `{"ok": true, "target_companies": N, "mails_sent": M, ...}` pour status

## 5. Vérifier les crons schedulés

```sql
SELECT jobid, jobname, schedule, active FROM cron.job;
SELECT jobid, status, return_message, start_time
  FROM cron.job_run_details
  ORDER BY start_time DESC
  LIMIT 10;
```

## 6. Désactivation n8n (après double-run validé)

Dans n8n, désactiver les workflows :
- `Connectivity Alerts` (id `B9C7aWfXjagRyyMP`)
- `Daily Status Email` (id `lNN8H7GWvv4dYcqc`)

## 7. Cadence par compagnie

Cadence pilotée via le champ `companies.status_email_frequency` (`none` /
`daily` / `weekly`). Modifiable depuis l'app Vue : staff admin → fiche d'une
compagnie → bouton trio "Aucun / Hebdo (mardi) / Quotidien".

## 8. Annuler / changer un schedule

```sql
SELECT cron.unschedule('cron-status-email');
-- puis re-SELECT cron.schedule(...) avec la nouvelle cron expression
```
