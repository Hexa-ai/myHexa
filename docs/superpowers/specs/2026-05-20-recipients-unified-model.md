# Spec — Modèle unifié destinataires + partage de devices

Date : 2026-05-20
Statut : validé, à implémenter

## Contexte

Le modèle actuel sépare :
- **Membres** (`recipients.auth_user_id` non null) : comptes Supabase auth
- **Externes** (`recipients.auth_user_id` null) : accès uniquement par tokens email (table `report_tokens`)

Cela double les chemins de code : token-based views (`view-report`, `view-supervision`, `view-periodic-report`, `recover-link`), routes `/report*` publiques, gestion de tokens expirant. Le partage cross-company n'est pas possible.

Avec le magic-link déjà en place côté Auth, on peut unifier : **tout destinataire est un user** avec un compte. Les magic links remplacent les tokens jetables. Un seul modèle, plus de friction parce que personne n'est obligé de définir un mot de passe.

## Modèle cible

### Table `recipients`

```
recipients
  id                       UUID PK
  auth_user_id             UUID NOT NULL  -- FK auth.users
  company_id               UUID nullable  -- compagnie d'origine
  name                     TEXT NOT NULL
  contact_email            TEXT NOT NULL UNIQUE
  phone                    TEXT
  role                     TEXT NOT NULL  -- 'admin' | 'viewer'
  restrict_to_devices      UUID[] nullable  -- limite INTRA-compagnie (NULL = tous)
  shared_devices           UUID[] nullable  -- AJOUTS depuis d'autres compagnies
  created_at, updated_at
```

Changements vs aujourd'hui :
- `auth_user_id` devient `NOT NULL` (tout destinataire a un compte)
- `company_id` devient `nullable` (permet les guests sans rattachement)
- Renomme `allowed_device_ids` → split en `restrict_to_devices` + `shared_devices`

### Sémantique de la visibilité

Pseudo-code de calcul des devices visibles par un recipient :

```
visible_devices(r) =
  IF r.company_id IS NULL
    r.shared_devices                                       -- guest pur
  ELSE
    (IF r.restrict_to_devices IS NULL
       THEN devices WHERE company_id = r.company_id        -- défaut : tous
       ELSE devices WHERE id = ANY(r.restrict_to_devices)) -- restreint
    ∪ devices WHERE id = ANY(r.shared_devices)             -- + extras
```

### Matrice des cas

| Cas | `company_id` | `restrict_to_devices` | `shared_devices` | Visibilité |
|---|---|---|---|---|
| Membre classique (auto-suit) | A | NULL | NULL | Tous de A |
| Membre restreint dans sa compagnie | A | `[d1, d2]` | NULL | d1, d2 de A |
| Membre A + 1 device de B | A | NULL | `[d_B1]` | Tous de A + d_B1 |
| Membre restreint + bonus | A | `[d1, d2]` | `[d_B1]` | d1, d2, d_B1 |
| Guest pur (consultant indé) | NULL | (ignoré) | `[d1, d2, d3]` | d1, d2, d3 |

## Règles métier

### Qui peut modifier quoi

| Action | Staff Hexa admin | Admin compagnie A |
|---|---|---|
| Créer recipient avec company_id = X | Oui (toute X) | Seulement X = A |
| Créer guest (company_id = NULL) | Oui | Non (réservé staff) |
| Modifier `restrict_to_devices` (intra A) | Oui | Oui pour les recipients de A |
| Ajouter device de A dans `shared_devices` (n'importe quel recipient) | Oui | Oui |
| Ajouter device de B dans `shared_devices` | Oui | Non |
| Supprimer un partage `shared_devices` (device de A) | Oui | Oui |
| Supprimer un partage `shared_devices` (device de B) | Oui | Seulement si propriétaire B le veut |

### Permission de partage en pratique

Sur la fiche d'un device (côté admin de la compagnie propriétaire ou staff) : bouton « Partager avec un destinataire externe ». Ouvre un picker d'email :
- Si l'email correspond à un user existant → ajoute le device.id à son `shared_devices`
- Sinon → invite l'user (création auth + recipient `company_id = NULL` ou rattaché si saisi) puis ajoute le partage

## Auth — comment les destinataires se connectent

| Type d'usage | Mode privilégié |
|---|---|
| Membre régulier (oncall, admin) | Email + mot de passe (défini à l'invitation Supabase) |
| Guest occasionnel (consultant) | Magic link à chaque besoin |
| Auto depuis mail transactionnel | **Magic link généré côté edge function** et embarqué dans le CTA du mail (le user clique, est authentifié direct) |

Pas de table `report_tokens` à maintenir. Pas d'expiration manuelle de tokens. Supabase Auth gère tout.

## Notifications

| Trigger | Récipiendaires | Lien dans le mail |
|---|---|---|
| Status hebdo / quotidien | Tous recipients dont `visible_devices` non vide | Magic link vers `/admin/devices` (filtré automatiquement par RLS à la visibilité du user) |
| Alarme connectivity | Tous recipients qui ont accès au device perdu/recovered | Magic link vers `/admin/devices/:id` |

Une seule logique : `supabase.auth.admin.generateLink({ type: 'magiclink', email: recipient.contact_email, options: { redirectTo: APP_URL + '/admin/devices' } })`.

## RLS — policies à mettre en place

### Sur `devices` (SELECT)

```sql
CREATE POLICY devices_visible_to_recipient ON devices FOR SELECT
USING (
  is_hexa_staff() = true
  OR EXISTS (
    SELECT 1 FROM recipients r
    WHERE r.auth_user_id = auth.uid()
    AND (
      -- Compagnie native + (pas de restriction OR id dans restrict_to_devices)
      (r.company_id = devices.company_id
        AND (r.restrict_to_devices IS NULL OR devices.id = ANY(r.restrict_to_devices)))
      -- OR partagé explicitement
      OR devices.id = ANY(r.shared_devices)
    )
  )
);
```

### Sur `reports`, `field_interventions`, `connectivity_alerts`

Mêmes règles : visible si le device sous-jacent est visible. Via une fonction `is_device_visible(device_id) RETURNS BOOLEAN`.

## Migration depuis l'existant

Étapes (chaque étape ≈ 1 commit) :

1. **Schema** : ajouter `restrict_to_devices`, `shared_devices` ; renommer/dropper `allowed_device_ids` après backfill
2. **Backfill** : pour chaque recipient existant avec `allowed_device_ids` non null, copier dans `restrict_to_devices` (sémantique restrictive intra-compagnie identique à l'ancienne, validé que les devices sont de la compagnie)
3. **Backfill auth** : créer un `auth.users` pour chaque externe (recipient sans `auth_user_id`) — Supabase Auth admin invite
4. **NOT NULL constraint** sur `auth_user_id`
5. **RLS** : nouvelle policy unifiée
6. **Edge functions** : adapter `cron-status-email`, `cron-connectivity-alerts` (génération magic link, suppression token), `invite-recipient` (nouveau schéma), nouvelle `share-device`
7. **UI** : refonte `RecipientFormDrawer` (toggle restreint + section devices partagés), bouton « Partager » sur fiche device
8. **Cleanup** : supprimer edge functions `view-report`, `view-supervision`, `view-periodic-report`, `recover-link` ; routes `/report*` ; table `report_tokens`

## Hors scope

- **Audit log** (qui a partagé quoi à qui, quand) — pourra être ajouté plus tard via une table `device_share_events`
- **Workflow d'acceptation** d'un partage côté recipient — pour l'instant, le partage est immédiat sans confirmation
- **Permission granulaire** (lecture seule vs. peut acquitter alarmes) sur les devices partagés — pour l'instant le `role` du recipient s'applique partout
