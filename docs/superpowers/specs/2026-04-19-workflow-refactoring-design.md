# Design — Migration Notion → Supabase : Sous-projet 4 (Refonte workflows n8n)

**Date** : 2026-04-19
**Auteur** : Julien Talbourdet (avec assistance Claude)
**Statut** : En attente de validation
**Dépend de** : [Sous-projet 1](2026-04-19-notion-to-supabase-migration-discovery-design.md), [Sous-projet 2](2026-04-19-supabase-setup-design.md), [Sous-projet 3](2026-04-19-data-migration-notion-to-supabase-design.md)

## Contexte

Les 3 tables Supabase (`companies`, `recipients`, `devices`) sont populées (2+2+2 rows, données de test). Reports est vide en attente d'ingestion live. Ce sous-projet refactorise les 5 workflows n8n qui consomment Notion pour qu'ils lisent/écrivent dans Supabase.

## Scope

**In** (5 workflows) :
- `Ingestion` (actif) — status push des devices
- `Location Update` (actif) — géocodage + update location
- `Report View` (actif) — consultation détail device
- `Supervision` (actif) — dashboard multi-devices
- `TestRepport - DEV` (inactif) — génère tokens view + envoie emails

**Out** :
- `TestRepport` (doublon inactif) — non refactoré
- `Création Projets` (archivé) — non refactoré

## Décisions figées

| Point | Décision |
|---|---|
| Stratégie | **In-place** — modification directe des workflows actifs |
| Ordre | Wipe datatable → Ingestion → Report View → Location Update → Supervision → TestRepport-DEV |
| DB access | Nœud Postgres natif via credential `Supabase myHexa` (`Kh5BwREIcIPXrGT5`) |
| `datatable RcU1aznrTruL4VC4` | Conservé (schéma intact), contenu vidé, repeuplé avec UUIDs Supabase par TestRepport-DEV |
| Downtime | Bref (secondes) pendant chaque swap — acceptable (données de test) |

## État initial du datatable

`RcU1aznrTruL4VC4` contient actuellement des lignes avec :
- `token` : token de view aléatoire
- `expires_at` : date d'expiration (7j)
- `device_ids` : string comma-separated de **Notion page IDs** (invalides après migration)

**Action** : truncate en premier step du sous-projet. Les colonnes restent, les lignes disparaissent. TestRepport-DEV refactoré repeuplera avec des UUIDs Supabase.

## Ordre d'exécution

1. **Wipe datatable** (opération manuelle ou via workflow jetable)
2. **Refactor Ingestion** — tant qu'il est sur Notion, les push actuels partent dans Notion → statut non visible
3. **Refactor Report View** — doit se passer avant Supervision qui en dépend visuellement
4. **Refactor Location Update** — indépendant des autres
5. **Refactor Supervision** — consomme la table reports via JOIN LATERAL
6. **Refactor TestRepport - DEV** — régénère les tokens avec UUIDs Supabase

## Refactorings détaillés

### 1. Ingestion (`X33NGxNIjpyUNvvS`)

**Webhook inchangé** : `POST /ingress/:device-name/status`, body = JSON statut complet, header `Authorization: Bearer <token>`.

**Nouveaux nodes** (remplacent les Notion/HTTP nodes) :

| Node | Opération |
|---|---|
| `Code in JavaScript` (Parse auth header) | Inchangé — extrait token du header |
| `Postgres: Find Device by Token` | `SELECT id FROM devices WHERE token = $1 LIMIT 1` — 0 ou 1 ligne |
| `If valid device` | Si 0 ligne → respond 401, sinon continue |
| `Postgres: Insert Report` | `INSERT INTO reports (device_id, type, payload, received_at) VALUES ($1, 'status', $2::jsonb, now())` |
| `Postgres: Update Last Connection` | `UPDATE devices SET last_connection_at = now() WHERE id = $1` |
| `Respond to Webhook` | 200 OK |

**Nœuds supprimés** : `Get many database pages` (Notion), `Append a block1` (Notion), `Get many child blocks` (Notion), `HTTP Request` (Notion delete blocks), `Update Derniere connexion` (Notion), `Code in JavaScript1` (chunking).

**Rationale** : Supabase ne requiert pas le chunking des blocs Notion, et la table `reports` étant append-only, l'historique est conservé.

### 2. Report View (`K6gY6Zcxy29OOJ1v`)

**Webhook inchangé** : `GET /report/view?t=<token>&d=<uuid_device>`.

**Nouveaux nodes** :

| Node | Opération |
|---|---|
| `Get Token Row` | Inchangé — datatable lookup sur `token` |
| `Validate` (JS) | Inchangé — vérifie token valide + expires_at + deviceId ∈ device_ids |
| `Postgres: Get Device + Last Status` | Requête unique avec JOIN LATERAL (voir ci-dessous) |
| `Build Detail HTML` (JS) | Ajusté : lit la nouvelle structure `device` + `status` (jsonb) au lieu de parser les blocs Notion |
| `Respond 200` | Inchangé |

**Requête SQL** :
```sql
SELECT d.id, d.name, d.address, d.latitude, d.longitude,
       r.payload AS status, r.received_at AS status_received_at
FROM devices d
LEFT JOIN LATERAL (
  SELECT payload, received_at FROM reports
  WHERE device_id = d.id AND type = 'status'
  ORDER BY received_at DESC LIMIT 1
) r ON true
WHERE d.id = $1
```

**Nœuds supprimés** : `Get Device Page` (HTTP Notion), `Get Device Blocks` (Notion), `Parse status` (code).

### 3. Location Update (`u85ZmX7GSWSUW15u`)

**Webhook inchangé** : `POST /location/update` (body : `token`, `deviceId` (UUID), `address`).

**Nouveaux nodes** :

| Node | Opération |
|---|---|
| `Get Token Row` + `Validate` | Inchangés |
| `Geocode` (HTTP OSM) | Inchangé |
| `Process Geocode` (JS) | Inchangé |
| `If geocoded` | Inchangé |
| `Postgres: Update Device Location` | `UPDATE devices SET address = $1, latitude = $2, longitude = $3 WHERE id = $4` |
| `Set redirect` + `Respond Redirect` | Inchangés |

**Nœud supprimé** : `Update Notion` (Notion databasePage update).

### 4. Supervision (`ZGaGgRA7xywQzn8h`)

**Webhook inchangé** : `GET /report/supervision?t=<token>`.

**Nouveaux nodes** :

| Node | Opération |
|---|---|
| `Get Token Row` + `Validate` | Inchangés |
| `Code: Parse device IDs` (plus besoin) | Remplacé par conversion du string comma-separated en array |
| `Postgres: Get Devices with Last Status` | 1 requête pour tous les devices du token |
| `Build Supervision HTML` | Ajusté : itère sur les lignes SQL au lieu de parser Notion |

**Requête SQL** :
```sql
SELECT d.id, d.name, d.address, d.company_id,
       c.name AS company_name,
       r.payload AS status, r.received_at AS status_received_at
FROM devices d
LEFT JOIN companies c ON c.id = d.company_id
LEFT JOIN LATERAL (
  SELECT payload, received_at FROM reports
  WHERE device_id = d.id AND type = 'status'
  ORDER BY received_at DESC LIMIT 1
) r ON true
WHERE d.id = ANY($1::uuid[])
ORDER BY c.name, d.name
```

**Nœuds supprimés** : `Explode device IDs` (code, remplacé par la conversion inline), `Loop devices` (SplitInBatches), `Get Device Page` (HTTP Notion), `Get Device Blocks` (Notion), `Parse device status`, `Aggregate devices`.

**Gain** : 1 requête SQL au lieu d'une boucle avec 2 appels Notion par device.

### 5. TestRepport - DEV (`lNN8H7GWvv4dYcqc`)

**Trigger** : Manual Trigger (on l'active après test, schedule optionnel).

**Nouveaux nodes** :

| Node | Opération |
|---|---|
| `Postgres: Get Recipients` | `SELECT id, company_id, name, contact_email FROM recipients WHERE contact_email IS NOT NULL` |
| `Loop recipients` (SplitInBatches) | Inchangé |
| `Postgres: Get Company Devices` | `SELECT id FROM devices WHERE company_id = $1` — array des UUIDs |
| `Postgres: Get Devices with Last Status` | Comme dans Supervision |
| `Generate token` (JS) | Crypto-safe random string + expires_at |
| `Store token` (dataTable) | INSERT dans `RcU1aznrTruL4VC4` avec `device_ids` = UUIDs joined by comma |
| `Build email` (JS) | Construit HTML avec liens `/report/view` et `/report/supervision` |
| `Send Gmail` | Inchangé |

**Nœuds supprimés** : `Get contacts`, `Get contact company`, `Get company devices`, `Get many child blocks`, `Parse device status` (tous Notion).

## Critères de succès

- [ ] Datatable `RcU1aznrTruL4VC4` vidé
- [ ] Ingestion refactoré, test avec un token device réel (via curl) → INSERT dans `reports` + UPDATE `last_connection_at`
- [ ] Report View refactoré, GET `/report/view?t=X&d=UUID` → HTML correct avec dernier status
- [ ] Location Update refactoré, POST → UPDATE de devices, géocodage inchangé
- [ ] Supervision refactoré, GET → HTML correct avec tous les devices du token
- [ ] TestRepport-DEV refactoré, exécution manuelle → 2 emails envoyés (1 par recipient), tokens insérés en datatable avec UUIDs Supabase, liens dans les emails fonctionnels
- [ ] Aucun workflow actif ne dépend plus de la credential Notion `bZvpOZzcwrJOAA4y` (prérequis sous-projet 5)

## Rollback

Si un refactor échoue ou casse :
- **In-place edit** → on peut revenir à la version précédente via l'historique des versions n8n (`n8n_workflow_versions`)
- Chaque workflow a un `versionId` précédent connu avant refactoring

## Hors scope

- Création Projets (archivé) — abandonné définitivement si non utile
- TestRepport (doublon inactif) — supprimable en sous-projet 5
- Archivage de la credential Notion + des DB Notion — sous-projet 5
- Optimisations performances (indexes supplémentaires, partitioning `reports`) — futur
