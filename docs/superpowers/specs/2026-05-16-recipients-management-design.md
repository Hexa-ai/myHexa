# Gestion des destinataires (membres & externes) — Design

**Date :** 2026-05-16
**Branche :** `feat/vue-migration`
**Statut :** Approuvé, prêt pour plan d'implémentation

## Contexte

Le portail Vue+Supabase migre les fonctionnalités d'administration historiquement gérées via n8n + emails. La table `recipients` distingue deux concepts orthogonaux (voir mémoire `myhexa-recipients-model`) :

- `role` (`admin` | `viewer`) — permission intra-entreprise.
- `auth_user_id` (NULL | NOT NULL) — encode le type : `NULL` = **externe** (reçoit emails seulement), `NOT NULL` = **membre** (peut se connecter au portail).

Aujourd'hui, `recipients` n'a aucune UI de gestion : on édite à la main en base. L'objectif est de fournir aux admins d'une entreprise une page CRUD complète avec invitation automatique des membres.

## Objectifs

- Permettre aux destinataires `role=admin` de gérer la liste des destinataires de leur entreprise depuis le portail.
- Inviter des membres par email via magic-link Supabase Auth, sans intervention manuelle (pas de copier-coller de lien).
- Scoper l'accès par devices via `allowed_device_ids` (NULL = tous les devices de l'entreprise).
- Ne pas exposer de service_role key côté navigateur.
- Ne pas casser les workflows n8n existants qui lisent `role` (`admin`/`viewer`).

## Hors-périmètre

- Révocation Auth (downgrade membre → externe en gardant la ligne destinataire).
- Audit log / historique de modifications.
- Import CSV en masse.
- Gestion multi-entreprise pour un même email (un destinataire = une ligne par entreprise, déjà supporté en DB).

## Architecture

### Route et navigation

- Nouvelle route enfant de `/admin` : `path: 'recipients'`, `name: 'admin-recipients'`, composant `RecipientsView`.
- Garde route-level `requireAdmin` (en plus du `requireAuth` parent) qui redirige vers `/admin/devices` si `auth.recipient.role !== 'admin'`. Cette garde devient réutilisable pour d'autres routes admin-only futures.
- `AdminLayout.vue` : l'entrée "Recipients" actuellement marquée `soon` (lignes ~171-179) devient un `<router-link :to="{name:'admin-recipients'}">` visible uniquement si `role === 'admin'` (`v-if`).

### Composants Vue

```
views/admin/RecipientsView.vue
└── components/recipients/
    ├── RecipientsTable.vue          ← liste + tri + recherche
    ├── RecipientFormDrawer.vue      ← drawer create+edit partagé
    └── DeviceMultiSelect.vue        ← sélecteur multi-devices
```

**`RecipientsView.vue`** — orchestrateur :
- Charge la liste des destinataires de la company (`useRecipients` composable autour de `supabase.from('recipients').select(...).eq('company_id', auth.companyId)`).
- Charge la liste des devices de la company pour le sélecteur (réutilise le store devices si déjà disponible, sinon fetch local).
- Gère ouverture/fermeture du drawer en mode create ou edit.
- Bouton **"Ajouter un destinataire"** en header.

**`RecipientsTable.vue`** — affichage :
- Colonnes : Nom · Email · Téléphone · Type (Membre/Externe, dérivé de `auth_user_id`) · Rôle (admin/viewer) · Devices (count ou "Tous") · Actions.
- Recherche full-text simple (nom + email).
- Tri sur Nom (par défaut) et Type.
- Actions par ligne :
  - **Éditer** (toujours)
  - **Supprimer** (toujours, avec confirmation)
  - **Renvoyer l'invite** (si type=membre ET `auth_user_id IS NULL`)
  - **Inviter comme membre** (si type=externe — déclenche l'edge function avec type=member sur la ligne existante)

**`RecipientFormDrawer.vue`** — formulaire :
- Champs : nom (requis), email (requis, format), téléphone (optionnel), type (membre/externe, radio), rôle (admin/viewer, radio), devices (multi-select, vide = tous).
- En mode **edit** : email read-only (préserve le lien Auth déjà établi + invite déjà envoyée).
- En mode **create** type=membre : on prévient l'admin qu'un email d'invitation sera envoyé.
- Soumission :
  - **Create** → POST edge function `invite-recipient`.
  - **Edit** → UPDATE direct via supabase-js (RLS garantit la limitation).

### Edge Function : `invite-recipient`

Seul point qui détient `service_role`. Située dans `supabase/functions/invite-recipient/`.

**Endpoint :** POST avec Authorization: Bearer <JWT> de l'admin appelant.

**Body :**
```json
{
  "name": "...",
  "contact_email": "...",
  "phone": "...",
  "role": "admin" | "viewer",
  "type": "member" | "external",
  "allowed_device_ids": ["uuid", ...] | null,
  "recipient_id": "uuid" | null   // present si "promouvoir externe → membre"
}
```

**Logique :**
1. Décode le JWT, récupère `auth.uid()`.
2. Cherche le destinataire de l'appelant via `auth_user_id` → en extrait `company_id` et `role`.
3. Refuse 403 si `role !== 'admin'`.
4. Si `recipient_id` fourni (promotion) : vérifie qu'il appartient à la même `company_id`. Sinon : insère une nouvelle ligne `recipients` avec `auth_user_id=NULL`.
5. Si `type === 'member'` : appelle `supabaseAdmin.auth.admin.inviteUserByEmail(contact_email, { redirectTo: '<APP_URL>/login' })`.
6. Retourne `{ recipient: {...}, invited: boolean }`.

**Erreurs :** 401 (pas de JWT valide), 403 (pas admin), 409 (email déjà destinataire de cette company), 500 (échec invite Auth).

### Migration DB

Fichier `supabase/migrations/<timestamp>_recipients_auto_link.sql` :

1. **Index** `idx_recipients_email_company` sur `(lower(contact_email), company_id)` pour accélérer le lookup du trigger et la contrainte d'unicité.
2. **Contrainte d'unicité** `(lower(contact_email), company_id)` pour empêcher les doublons par entreprise (renvoie 409 propre côté edge function).
3. **Trigger** `on auth.users AFTER INSERT` (et AFTER UPDATE OF email) qui exécute :
   ```sql
   UPDATE public.recipients
   SET auth_user_id = NEW.id
   WHERE auth_user_id IS NULL
     AND lower(contact_email) = lower(NEW.email);
   ```
   → Lie automatiquement le compte Auth au(x) recipient(s) existant(s) lors du premier login.
4. **Policies RLS** sur `recipients` :
   - SELECT : `company_id = (SELECT company_id FROM recipients WHERE auth_user_id = auth.uid())`
   - UPDATE / DELETE : idem + `role = 'admin'` sur le destinataire appelant.
   - INSERT : refusé côté client (la création passe par l'edge function avec service_role qui bypasse RLS).

### Flux complets

**Création d'un externe :**
1. Admin remplit formulaire (type=externe).
2. Front POST `invite-recipient` → edge insère la ligne, retourne le recipient.
3. UI rafraîchit la liste.

**Création d'un membre :**
1. Admin remplit formulaire (type=membre).
2. Front POST `invite-recipient` → edge insère ligne + envoie magic-link Supabase.
3. Membre clique le lien dans l'email → Supabase crée `auth.users` row → trigger DB lie `auth_user_id` sur le recipient.
4. Membre arrive sur `/login` (puis `/admin/devices` via redirect racine).

**Promotion externe → membre :**
1. Admin clique "Inviter comme membre" sur une ligne externe.
2. Front POST `invite-recipient` avec `recipient_id` + `type=member`.
3. Edge envoie l'invite (sans toucher à la ligne). Trigger lie au premier login.

**Édition :**
1. Admin clique "Éditer" → drawer pré-rempli.
2. UPDATE direct via supabase-js (RLS).

**Suppression :**
1. Confirmation modale.
2. DELETE direct via supabase-js (RLS).
3. Le compte `auth.users` n'est pas supprimé (un même email peut servir ailleurs).

## Stratégie de test

- **Edge function** : tests unitaires sur les cas 401/403/409, mock du JWT et de `auth.admin.inviteUserByEmail`.
- **Trigger DB** : test SQL — insérer un recipient, créer un auth user avec même email, vérifier que `auth_user_id` est rempli.
- **UI** : test Vitest sur `RecipientFormDrawer` (validation requise/email), tests d'intégration `RecipientsView` avec supabase mocké.
- **E2E manuel** : créer un membre depuis un compte admin, vérifier réception email, login du membre, vérifier `auth_user_id` lié et accès `/admin/devices`.

## Risques et compromis

- **Trigger sur `auth.users`** : nécessite des droits étendus sur le schéma `auth`. Supabase autorise les triggers `on auth.users` via migration (pattern documenté). Si refusé en prod, fallback : appeler le link dans l'edge function après création de l'user, ou faire le link dans `stores/auth.ts` au moment de `loadRecipient`.
- **Unicité `(lower(email), company_id)`** : empêche un même email d'avoir deux lignes recipients dans une même entreprise. Vérifier qu'aucune donnée existante ne viole la contrainte avant déploiement (requête de pré-check incluse dans la migration).
- **Email read-only en édition** : si un admin a fait une faute de frappe lors de la création d'un membre, il devra supprimer et recréer. Acceptable, l'invite n'aura de toute façon pas pu aboutir.
- **`role=admin` peut se rétrograder lui-même** : risque de se priver d'accès. Mitigation : refuser côté UI si on édite sa propre ligne et qu'on retire `admin`, OU autoriser et compter sur la possibilité d'escalader via support. **Décision : interdire côté UI (et côté edge si on ajoute un endpoint d'update server-side plus tard).**

## Impact sur l'existant

- Aucune modification des workflows n8n. La colonne `role` continue d'être lue avec les valeurs `admin`/`viewer`.
- `stores/auth.ts` : aucun changement nécessaire (loadRecipient lit déjà `auth_user_id`).
- `AdminLayout.vue` : remplacement du placeholder "soon", ajout d'un `v-if="role==='admin'"`.
- Nouveau fichier `router/guards.ts` : ajout d'une fonction `requireAdmin` à côté de `requireAuth`.
