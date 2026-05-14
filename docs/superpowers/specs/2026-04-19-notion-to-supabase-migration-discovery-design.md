# Design — Migration Notion → Supabase : Sous-projet 1 (Discovery & schéma cible)

**Date** : 2026-04-19
**Auteur** : Julien Talbourdet (avec assistance Claude)
**Statut** : En attente de validation

## Contexte

Les workflows n8n actuels s'appuient sur 3 bases de données Notion (`Clients`, `Destinataires`, `Equipements`) ainsi qu'un pattern hack qui stocke les rapports de statut des équipements comme **chunks de 2000 caractères dans des blocs Notion** (workflow `Ingestion`). Cette architecture atteint ses limites :

- Pas de requêtabilité SQL sur les rapports
- Limite des propriétés Notion contournée par découpage en blocs
- Relations Notion peu adaptées aux jointures
- Noms en français mélangés aux conventions techniques du code

**Décision** : migration définitive vers Supabase (Postgres). Les workflows n8n seront refondus pour pointer directement sur Supabase, et les bases Notion seront archivées.

## Découpage du projet global

Le projet est décomposé en 5 sous-projets séquentiels, chacun avec sa propre spec + plan + implémentation. **Ce document couvre uniquement le sous-projet 1.**

| # | Sous-projet | Livrable |
|---|---|---|
| **1** | **Discovery & schéma cible** | **Ce document : spec schéma Postgres EN + mapping FR→EN + stratégie** |
| 2 | Setup Supabase | Projet Supabase, migrations SQL, RLS, credentials n8n |
| 3 | Migration des données | Workflow n8n jetable de copie Notion → Supabase |
| 4 | Refonte des workflows n8n | Chaque workflow Notion-dépendant refactorisé (un par un) |
| 5 | Bascule & décommission | Validation finale, archivage des DB Notion, doc |

## Scope du sous-projet 1

**In** :
- Décrire le schéma Postgres cible (tables, colonnes, types, contraintes, index)
- Définir le mapping champ-à-champ FR → EN
- Définir l'ordre de migration et la stratégie de résolution des FK
- Définir les critères de validation pré/post-migration

**Out** (couvert par les sous-projets suivants) :
- Provisioning Supabase
- Écriture du SQL de migration exécutable (fichiers `.sql`)
- Écriture du workflow n8n de copie
- Refactoring des workflows n8n consommateurs

## Conventions de nommage

- **Tables** : pluriel, `snake_case`, anglais → `companies`, `recipients`, `devices`, `reports`
- **Colonnes** : `snake_case`, anglais → `contact_name`, `last_connection_at`, `has_battery`
- **Clés primaires** : `id uuid` généré par `gen_random_uuid()`
- **Clés étrangères** : `<table_singular>_id` (ex. `company_id`, `device_id`)
- **Dates** : `timestamptz` avec suffixe `_at` pour les instants (`created_at`, `received_at`), `date` pour les dates calendaires (`os_install_date`)

## Schéma cible

```sql
-- 1. companies (ex-Clients)
create table companies (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  contact_name    text,
  contact_email   text,
  phone           text,
  address         text,
  latitude        numeric,
  longitude       numeric,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 2. recipients (ex-Destinataires)
create table recipients (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  name            text not null,
  contact_email   text,
  phone           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on recipients (company_id);

-- 3. devices (ex-Equipements)
create table devices (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id) on delete restrict,
  name                text not null,
  serial_number       text,
  mac_eth0            text,
  token               text unique,
  invoice_number      text,
  os_version          text,
  os_install_date     date,
  last_connection_at  timestamptz,
  address             text,
  latitude            numeric,
  longitude           numeric,
  has_battery         boolean not null default false,
  has_supercap        boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index on devices (company_id);
create index on devices (token);

-- 4. reports (nouveau — remplace le hack des chunks de blocs Notion)
create type report_type as enum ('status', 'daily', 'weekly');

create table reports (
  id            uuid primary key default gen_random_uuid(),
  device_id     uuid not null references devices(id) on delete cascade,
  type          report_type not null,
  payload       jsonb not null,
  received_at   timestamptz not null default now()
);
create index on reports (device_id, type, received_at desc);
```

### Choix de conception — justifications

- **`report_type` enum** : trois valeurs fixes connues dès maintenant (`status`, `daily`, `weekly`). Un enum est plus strict qu'un `text + CHECK`, et facile à étendre via `ALTER TYPE ... ADD VALUE`.
- **`payload jsonb`** : la structure des rapports de statut est déjà du JSON dans l'existant (voir `Report View` workflow). JSONB permet l'indexation GIN plus tard si nécessaire.
- **`on delete cascade`** sur `recipients` et `reports` : si on supprime une société ou un device, ses destinataires et rapports n'ont plus de sens.
- **`on delete restrict`** sur `devices → companies` : protection contre suppression accidentelle d'une société qui aurait encore des devices actifs.
- **`token text unique`** sur `devices` : le token identifie de façon unique un équipement côté webhook d'ingestion.
- **Index `(device_id, type, received_at desc)` sur `reports`** : cible la requête "dernier rapport de type X pour un device donné", qui sera la plus fréquente.
- **Pas de colonne `notion_id`** : décision explicite — la traçabilité post-migration n'est pas nécessaire.

## Mapping FR → EN (consolidé)

| Notion (FR) | Supabase (EN) | Type / note |
|---|---|---|
| **Clients (DB)** | `companies` | table |
| Nom | `name` | text NOT NULL |
| Nom contact | `contact_name` | text |
| Contact Email | `contact_email` | text |
| Numéro de téléphone | `phone` | text |
| Lieu (place) | `address` + `latitude` + `longitude` | éclaté en 3 colonnes |
| Equipements (relation) | — | devient FK inverse `devices.company_id` |
| Destinataires (relation) | — | devient FK inverse `recipients.company_id` |
| **Destinataires (DB)** | `recipients` | table |
| Nom | `name` | text NOT NULL |
| Contact Email | `contact_email` | text |
| Numéro de téléphone | `phone` | text |
| Clients (relation) | `company_id` | FK → companies |
| **Equipements (DB)** | `devices` | table |
| Nom | `name` | text NOT NULL |
| Numéro série | `serial_number` | text |
| Adresse MAC Eth0 | `mac_eth0` | text (le select Notion à 1 option est traité comme text libre) |
| Token | `token` | text UNIQUE |
| Numéro de facture | `invoice_number` | text |
| Version Hai-OS | `os_version` | text |
| Date Installation OS | `os_install_date` | date |
| Dernière Connexion | `last_connection_at` | timestamptz |
| Localisation | `address` | text |
| Latitude / Longitude | `latitude` / `longitude` | numeric |
| Pile (checkbox) | `has_battery` | boolean DEFAULT false |
| Super Condensateur (checkbox) | `has_supercap` | boolean DEFAULT false |
| Clients (relation) | `company_id` | FK → companies |
| Nom Client (dénormalisé) | — | abandonné (redondant avec FK) |
| Générer Token (button) | — | abandonné (UI seulement) |
| **Blocs JSON de statut (hack)** | `reports` (type=`status`) | nouvelle table |

## Cardinalité des relations

| Relation | Cardinalité | Implémentation |
|---|---|---|
| Company → Device | 1:N | FK `devices.company_id` |
| Company → Recipient | 1:N | FK `recipients.company_id` |
| Device → Report | 1:N | FK `reports.device_id` |

**Future évolution** (hors scope v1) : un client pourra inviter ses propres customers par email pour partager certains devices. Cela nécessitera une table `device_shares (device_id, user_email, role)` et des policies RLS. Le schéma v1 ne bloque pas cette évolution ; aucune action préventive n'est nécessaire maintenant (YAGNI).

## Row Level Security

Pour la v1, Supabase n'est pas exposé à des end-users — seul n8n y accède, via la clé `service_role` (bypass RLS).

- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` sur les 4 tables (best practice)
- **Zéro policy** → tout est bloqué sauf `service_role`
- Les policies seront ajoutées quand le sous-projet "sharing" (hors v1) sera lancé

## Ordre de migration

Imposé par les dépendances de clés étrangères :

```
1. companies      (aucune dépendance)
2. recipients     (FK → companies)
3. devices        (FK → companies)
4. reports        (FK → devices, mais démarre vide)
```

## Stratégie de copie (contexte — détail dans sous-projet 3)

Le workflow n8n de copie suivra ce pattern par table :

1. Paginer `/v1/databases/{notion_id}/query` → toutes les pages Notion
2. Pour chaque page :
   a. Extraire les propriétés selon le mapping ci-dessus
   b. Générer un UUID nouveau pour la ligne Postgres
   c. Enregistrer la correspondance `{notion_page_id → new_uuid}` dans une map en mémoire
3. Insert bulk dans Supabase
4. Au passage à la table suivante, résoudre les FK via la map

**Règle fail-fast** : si une page Notion référence une relation vers un ID qui n'est pas dans la map, le workflow stoppe. Pas d'insertion silencieuse de FK NULL.

### Historique des rapports de statut

**Décision : on jette.** Les blocs JSON Notion historiques ne sont pas migrés. La table `reports` démarre vide et se remplit dès la bascule du workflow `Ingestion` (sous-projet 4).

Rationale : la valeur pratique de l'historique statut est faible (on lit surtout le dernier) ; coût de migration > bénéfice.

## Validation

### Critères de succès du sous-projet 1

Ce sous-projet livre une **spec**, pas du code exécuté. Validation :

1. Revue du présent document par Julien Talbourdet (validation écrite)
2. Schéma approuvé → passage au sous-projet 2 (writing-plans)

### Pré-checks avant migration (pour le sous-projet 3)

À exécuter **avant** de lancer la copie :

- Count des pages par DB Notion (baseline pour vérification post-migration)
- Count des pages Notion ayant une relation `Clients` renseignée (baseline pour FK)
- Détection de doublons sur le champ `Token` dans Equipements (la contrainte UNIQUE côté Postgres les refuserait)

### Post-checks après migration (pour le sous-projet 3)

- Chaque table Supabase a le même nombre de lignes que sa DB Notion d'origine
- `COUNT(*) WHERE company_id IS NOT NULL` dans `recipients` et `devices` matche les counts de relations côté Notion
- Aucune ligne dans `recipients` / `devices` avec `company_id` qui ne référence pas une ligne existante dans `companies` (garanti par la contrainte FK, mais check explicite dans le rapport de migration)

### Rollback

En cas d'échec de migration : `TRUNCATE` des 4 tables Supabase, puis relance. Notion reste la source de vérité tant que la décommission (sous-projet 5) n'est pas entamée.

## Hors scope de cette spec

- Provisioning Supabase (sous-projet 2)
- Écriture des fichiers SQL de migration exécutables (sous-projet 2)
- Workflow n8n de copie (sous-projet 3)
- Refactoring des workflows `Ingestion`, `Location Update`, `Report View`, `Supervision`, `TestRepport`, `Création Projets` (sous-projet 4)
- Archivage des bases Notion (sous-projet 5)
- Table `device_shares` et policies RLS pour partage end-user (future évolution)

## Références

- Bases Notion sources :
  - Clients : `34351d7d-ad2f-8089-bae7-da24d6ea38f3`
  - Destinataires : `34351d7d-ad2f-80e0-a217-cb012eb2ad03`
  - Equipements : `34351d7d-ad2f-80d6-b151-e4b8c7dbe51e`
- Credential n8n Notion : `bZvpOZzcwrJOAA4y`
- Workflows n8n impactés (à refondre en sous-projet 4) :
  - `Ingestion` (`X33NGxNIjpyUNvvS`)
  - `Location Update` (`u85ZmX7GSWSUW15u`)
  - `Report View` (`K6gY6Zcxy29OOJ1v`)
  - `Supervision` (`ZGaGgRA7xywQzn8h`)
  - `TestRepport` (`91iqP7DfVowfbcfd`) / `TestRepport - DEV` (`lNN8H7GWvv4dYcqc`)
  - `Création Projets` (`0JA44zF0ly3sKwms`, archivé)
