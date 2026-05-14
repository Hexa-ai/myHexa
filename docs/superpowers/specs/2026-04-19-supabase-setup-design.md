# Design — Migration Notion → Supabase : Sous-projet 2 (Setup Supabase)

**Date** : 2026-04-19
**Auteur** : Julien Talbourdet (avec assistance Claude)
**Statut** : En attente de validation
**Dépend de** : [Sous-projet 1 — Discovery & schéma cible](2026-04-19-notion-to-supabase-migration-discovery-design.md)

## Contexte

Le sous-projet 1 a validé le schéma Postgres cible. Ce sous-projet 2 couvre le provisioning : création des objets SQL dans le projet Supabase existant, configuration de la connexion n8n, et mise en place du tooling local pour gérer les migrations futures.

## Scope

**In** :
- Arborescence locale du projet (Supabase CLI + spec docs)
- Structure du fichier de migration SQL
- Stratégie de connexion n8n → Supabase (pooler vs direct)
- Séquence d'exécution pas-à-pas

**Out** (couvert par les sous-projets suivants) :
- Copie des données depuis Notion (sous-projet 3)
- Refonte des workflows consommateurs (sous-projet 4)
- Archivage des DB Notion (sous-projet 5)

## État initial

- **Projet Supabase** : `myHexa`, West EU, `https://mlbezfyjbnjyogogqmem.supabase.co`
- **État du projet** : vierge (aucune table utilisateur) → schéma `public` sans risque de conflit
- **Supabase CLI** : non installé sur la machine locale → à installer lors de l'exécution
- **n8n** : déjà actif sur `https://srv1375596.hstgr.cloud`, aucun credential Postgres encore créé

## Arborescence locale

```
/home/talbourdet/Documents/Dev-myHexa/
├── docs/
│   └── superpowers/
│       └── specs/
│           ├── 2026-04-19-notion-to-supabase-migration-discovery-design.md
│           └── 2026-04-19-supabase-setup-design.md  (ce document)
├── supabase/                        (créé par `supabase init`)
│   ├── config.toml
│   ├── migrations/
│   │   └── <timestamp>_init_haios.sql
│   ├── seed.sql                     (vide pour l'instant)
│   └── .gitignore
└── .gitignore                       (protège .env.local, config.toml local, etc.)
```

Le répertoire `/home/talbourdet/Documents/Dev-myHexa/` devient la **racine du projet** pour tout ce qui est hors n8n.

## Supabase CLI

### Installation (à l'exécution)

Méthode sans sudo, binaire officiel depuis GitHub Releases dans `~/.local/bin` :

```bash
mkdir -p ~/.local/bin
curl -fsSL https://github.com/supabase/cli/releases/latest/download/supabase_linux_amd64.tar.gz \
  | tar -xz -C ~/.local/bin/
```

Vérifier que `~/.local/bin` est dans le `PATH` (généralement oui sur Ubuntu/Debian via `.profile`).

### Initialisation

```bash
cd /home/talbourdet/Documents/Dev-myHexa
supabase init
```

Crée `supabase/config.toml`, `supabase/migrations/`, `supabase/seed.sql`, `supabase/.gitignore`.

### Login + Link

```bash
supabase login                                      # browser flow
supabase link --project-ref mlbezfyjbnjyogogqmem    # attache au projet myHexa
```

### Application de la migration

```bash
supabase db push
```

Pousse le fichier de migration vers la DB distante. Idempotent via le tracking `supabase_migrations.schema_migrations`.

## Fichier de migration

**Un seul fichier** : `supabase/migrations/<timestamp>_init_haios.sql`

Structure :

```sql
-- ================================================================
-- Init HaiOS schema (Companies, Recipients, Devices, Reports)
-- ================================================================

-- 1. ENUM
CREATE TYPE report_type AS ENUM ('status', 'daily', 'weekly');

-- 2. Helper function (partagée par les triggers updated_at)
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. TABLE companies
CREATE TABLE companies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  contact_name    text,
  contact_email   text,
  phone           text,
  address         text,
  latitude        numeric,
  longitude       numeric,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER companies_updated_at BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4. TABLE recipients
CREATE TABLE recipients (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name            text NOT NULL,
  contact_email   text,
  phone           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON recipients (company_id);

CREATE TRIGGER recipients_updated_at BEFORE UPDATE ON recipients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 5. TABLE devices
CREATE TABLE devices (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  name                text NOT NULL,
  serial_number       text,
  mac_eth0            text,
  token               text UNIQUE,
  invoice_number      text,
  os_version          text,
  os_install_date     date,
  last_connection_at  timestamptz,
  address             text,
  latitude            numeric,
  longitude           numeric,
  has_battery         boolean NOT NULL DEFAULT false,
  has_supercap        boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON devices (company_id);
CREATE INDEX ON devices (token);

CREATE TRIGGER devices_updated_at BEFORE UPDATE ON devices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 6. TABLE reports (append-only, pas de updated_at)
CREATE TABLE reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id     uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  type          report_type NOT NULL,
  payload       jsonb NOT NULL,
  received_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON reports (device_id, type, received_at DESC);

-- 7. RLS (activé partout, 0 policy → tout bloqué sauf service_role)
ALTER TABLE companies  ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices    ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports    ENABLE ROW LEVEL SECURITY;
```

### Notes de conception

- **`reports` n'a pas de `updated_at`** : la table est append-only, chaque webhook d'ingestion insère une nouvelle ligne. Pas de trigger.
- **`updated_at` par trigger plutôt que par application** : garantit la cohérence même si un UPDATE arrive via SQL ad-hoc ou via n8n.
- **Fonction `set_updated_at` partagée** : évite la duplication de logique. Fonction stockée en schéma `public`.
- **Ordre** : enum → function → tables → index → triggers → RLS. Nécessaire pour les contraintes FK qui référencent des tables déjà créées.

## Connexion n8n → Supabase

### Choix : Session Pooler (pas la connexion directe)

La connexion directe `db.xxx.supabase.co:5432` est **IPv6-only** par défaut. Le serveur n8n (Hostinger) est probablement IPv4-only. La session pooler donne une IPv4 et une sémantique Postgres identique.

### Paramètres du credential n8n

À créer via `n8n_manage_credentials` à l'exécution :

| Champ | Valeur |
|---|---|
| Type | `postgres` |
| Name | `Supabase myHexa` |
| Host | `aws-0-eu-west-3.pooler.supabase.com` |
| Port | `5432` |
| Database | `postgres` |
| User | `postgres.mlbezfyjbnjyogogqmem` (format pooler : `postgres.<project-ref>`) |
| Password | récupéré depuis Dashboard Supabase > Project Settings > Database > Database Password |
| SSL | `require` |

**Note** : la région West EU correspond à `eu-west-3` dans l'infrastructure pooler Supabase. À vérifier dans le dashboard (Project Settings > Database > Connection string) — si différent, ajuster le host.

### Sécurité

- Le password DB n'est **jamais** commité dans le dépôt local.
- Il est stocké uniquement dans n8n (credential chiffré côté n8n).
- La Supabase CLI gère son propre token via `supabase login` (stocké dans `~/.supabase/access-token`).

## Séquence d'exécution (pour le plan writing-plans à venir)

1. Installer Supabase CLI (`~/.local/bin/supabase`), vérifier `supabase --version`
2. `supabase init` dans `/home/talbourdet/Documents/Dev-myHexa`
3. Créer le fichier `supabase/migrations/<timestamp>_init_haios.sql` avec le SQL complet
4. `supabase login` (browser flow)
5. `supabase link --project-ref mlbezfyjbnjyogogqmem`
6. `supabase db push`
7. Vérification dans le Dashboard Supabase : 4 tables, 1 enum `report_type`, RLS activé sur chaque table (pastille verte), 1 function `set_updated_at`, 3 triggers `*_updated_at`
8. Récupérer le password DB depuis le dashboard
9. Demander la valeur du host pooler exact dans le dashboard (Connection string / Session mode) pour confirmer `aws-0-eu-west-3.pooler.supabase.com`
10. Créer le credential n8n `Supabase myHexa` via `n8n_manage_credentials`
11. Test de fumée : workflow n8n jetable qui exécute `SELECT 1 AS ok` et valide le retour

## Critères de succès

- [ ] 4 tables créées dans `public`, visibles dans Dashboard Supabase
- [ ] Enum `report_type` existe avec les 3 valeurs
- [ ] RLS activé sur les 4 tables (zéro policy)
- [ ] Triggers `updated_at` fonctionnels (test : `INSERT + UPDATE` sur `companies` → `updated_at` change)
- [ ] Credential n8n `Supabase myHexa` créé et testé avec succès
- [ ] Fichier de migration versionnable dans `supabase/migrations/`

## Rollback

Si la migration foire ou si le schéma doit être ajusté avant le sous-projet 3 :

```sql
-- Dans le SQL Editor du Dashboard Supabase (pas via CLI, pour éviter le drift)
DROP TABLE IF EXISTS reports;
DROP TABLE IF EXISTS devices;
DROP TABLE IF EXISTS recipients;
DROP TABLE IF EXISTS companies;
DROP TYPE IF EXISTS report_type;
DROP FUNCTION IF EXISTS set_updated_at();
```

Puis relancer `supabase db push` après correction. À faire **avant** le sous-projet 3, jamais après (sous peine de perdre les données migrées).

## Hors scope

- Stratégie de backup (Supabase Cloud tier gratuit = backup auto 7j, suffisant pour v1)
- Monitoring / alerting sur la DB (à prévoir plus tard)
- Partitionnement de `reports` (à prévoir quand le volume l'exigera — sous-projet dédié futur)
- Policies RLS pour end-users (sous-projet futur "sharing")
