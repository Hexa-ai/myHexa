# Architecture

## Les quatre briques

| Brique | Où | Rôle |
|---|---|---|
| Box HAI-P200 | chez le client | collecte les mesures de l'automate, les envoie en 4G |
| Front (portail) | `app/`, hébergé sur Netlify | interface web et PWA |
| Base PostgreSQL | `supabase/migrations/` | données, droits (RLS), fonctions SQL |
| Edge Functions | `supabase/functions/` | code serveur (Deno) : réception des box, mails, rapports, historique |

Il y a deux projets Supabase identiques en structure : **TEST** et **PROD**. Le front est construit une fois par environnement, avec les variables `VITE_*` du projet visé.

## Vue d'ensemble

```mermaid
flowchart TB
  subgraph Client["Chez le client"]
    box["Box HAI-P200"]
  end
  subgraph Netlify
    api["api.hexa-ai.fr<br/>(relais, netlify.toml)"]
    spa["my.hexa-ai.fr<br/>(app Vue, PWA)"]
  end
  subgraph Supabase["Projet Supabase (TEST ou PROD)"]
    ing["device-ingress"]
    db[("PostgreSQL<br/>tables + RLS + RPC")]
    st[("Storage<br/>ts-archive, reports, device-docs…")]
    rt["Realtime<br/>canal privé box:&lt;id&gt;"]
    edge["Edge Functions<br/>ts-build, ts-read, report-run…"]
    cron["pg_cron + pg_net"]
  end
  box -->|"POST /ingress/&lt;hostname&gt;/status, /report/daily"| api --> ing --> db
  box -->|"realtime-token puis WebSocket"| rt
  spa -->|"supabase-js (JWT utilisateur)"| db
  spa -->|"canal box:&lt;id&gt; (présence + valeurs)"| rt
  spa -->|"invoke"| edge
  cron -->|"x-cron-secret"| edge
  db -->|"triggers pg_net"| edge
  edge --> db
  edge --> st
```

## Chemin des données d'une box (ingestion)

```mermaid
sequenceDiagram
  participant B as Box
  participant N as Netlify (api.hexa-ai.fr)
  participant I as device-ingress
  participant D as PostgreSQL
  participant T as ts-build
  B->>N: POST /ingress/<hostname>/status (Bearer jeton box)
  N->>I: relais tel quel
  I->>D: rpc ingest_status (+ apply_device_location, + ingest_remote)
  I-->>B: 200 (JSON, + commandes en attente si bloc remote)
  B->>N: POST /ingress/<hostname>/report/daily
  N->>I: relais
  I->>D: rpc ingest_report -> table reports
  D->>T: trigger ts_after_report (pg_net)
  T->>D: remplit l'historique Parquet (Storage ts-archive)
```

Détail : [flux/ingestion.md](flux/ingestion.md).

## Le direct temps réel

```mermaid
sequenceDiagram
  participant B as Box
  participant I as device-ingress / realtime-token
  participant R as Supabase Realtime
  participant P as Portail (onglet ouvert)
  B->>I: POST /<hostname>/realtime-token (Bearer jeton box)
  I-->>B: JWT court (rôle box_rt, topic box:<id>) + params
  B->>R: se connecte, présence {role:'box', fw, caps}
  P->>R: rejoint box:<id> (JWT utilisateur, RLS is_device_visible)
  P->>R: présence {role:'viewer', mode, fmt:2, vars}
  R-->>B: la présence change
  B->>R: broadcast "valeurs" (+ "etat")
  R-->>P: valeurs en direct
```

Détail : [flux/temps-reel.md](flux/temps-reel.md).

## Tâches planifiées et déclencheurs

```mermaid
flowchart LR
  c1["pg_cron: cron-connectivity-alerts (*/15)"] --> f1["cron-connectivity-alerts"]
  c2["pg_cron: weather (2,17,32,47 * * * *)"] --> f2["cron-weather"]
  c3["pg_cron: firmware-releases (7 * * * *)"] --> f3["cron-firmware-releases"]
  c4["pg_cron: report-run (*/15)"] --> f4["report-run"]
  c5["pg_cron: usage-snapshot (03:20)"] --> s5["fonction SQL usage_snapshot"]
  c6["cron-status-email (voir supabase/cron-setup.md)"] --> f6["cron-status-email"]
  t1["trigger ts_after_report"] --> f7["ts-build"]
  t2["trigger push_after_status"] --> f8["push-alarm"]
  f7 --> f9["analyze-report"]
```

Les planifications des quatre premières lignes et de `usage-snapshot` sont créées par des migrations (`20261029220000_cron_connectivity.sql`, `20261030090000_meteo.sql`, `20261029210000_versions_depot.sql`, `20261024130000_report_templates_proto.sql`, `20261028150000_consommation.sql`). `cron-status-email` est décrit dans `supabase/cron-setup.md` (mise en place à la main). Un cron horaire pour `ts-build` est mentionné dans l'en-tête de `supabase/functions/ts-build/index.ts` mais **aucune migration ne le crée** : il est à vérifier dans le projet cible (`select * from cron.job`).

Les URL des fonctions et le secret des crons sont lus dans le **Vault** Supabase par les tâches (noms de secrets Vault comme `ts_build_url`) ; voir [exploitation](exploitation/README.md).

## Netlify

`netlify.toml` fait quatre choses :

1. construit le front (`base = "app"`, `pnpm install --frozen-lockfile && pnpm build`, publie `dist`) ;
2. **relaie** `https://api.hexa-ai.fr/*` vers la fonction `device-ingress` (règles `status = 200`, donc transparentes pour la box ; elles doivent rester **avant** la règle `/*` de l'application) ;
3. renvoie toute autre URL de `my.hexa-ai.fr` vers `/index.html` (application monopage) ;
4. ajoute des en-têtes de sécurité (`X-Frame-Options: DENY`, etc.) et interdit le cache de `sw.js` et `manifest.webmanifest`.

## Les rôles d'utilisateurs

Voir [backend/securite-rls.md](backend/securite-rls.md). En résumé : **staff Hexa** (admin d'une entreprise marquée `is_hexa_internal`) voit tout ; **admin** d'entreprise gère son entreprise ; **viewer** consulte ; un destinataire peut aussi recevoir des **box partagées** d'une autre entreprise.

## Où est le code de chaque chose ?

| Je cherche… | Fichier |
|---|---|
| les écrans et les URL | `app/src/router/index.ts`, `app/src/views/` |
| la session et les rôles côté front | `app/src/stores/auth.ts`, `app/src/router/guards.ts` |
| les appels à la base | `app/src/composables/use*.ts` |
| l'appel des Edge Functions | `app/src/lib/api.ts` (`callEdge`) |
| le direct | `app/src/stores/live.ts`, `app/src/lib/live/` |
| la réception des box | `supabase/functions/device-ingress/index.ts` + fonctions SQL `ingest_*` |
| les règles d'accès | `supabase/migrations/*` (`create policy`, `is_device_visible`…) |

## Hérité / mort à connaître

- L'ancien flux **n8n** (ingestion, alertes de connectivité, mail de statut) a été remplacé par des Edge Functions. Il en reste des traces : le préfixe d'URL `/ingress/...` et la réponse `{"message":"Workflow was started"}` dans `device-ingress` sont gardés **exprès** pour le firmware.
- Les fonctions `view-report`, `recover-link`, `location-update` et la table `report_tokens` n'existent plus (la table est supprimée par la migration `20260520195717_drop_report_tokens.sql`). Le test `app/tests/unit/lib/api.spec.ts` les cite encore : voir [exploitation](exploitation/README.md).
- `docs/realignement-prod-2026-10.md` liste des fonctions mortes qui seraient encore déployées en prod.
