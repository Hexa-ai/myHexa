# Split Signalements / Interventions — Design

**Date :** 2026-05-17
**Branche cible :** master (ou nouvelle `feat/signalements-interventions`)
**Statut :** Approuvé pour plan d'implémentation

## Contexte

Aujourd'hui, le QR code collé sur chaque équipement amène n'importe quel scanner à `/intervention?d=...` — un formulaire unique qui sert à la fois :

- aux techniciens pour journaliser une intervention faite sur place,
- (implicitement) à tout passant pour signaler un problème.

La page `Alarmes` côté admin mélange alarmes capteurs, fil de l'eau et interventions sous un seul onglet « Interventions ». Le vocabulaire est confus parce que le terme « intervention » porte deux concepts orthogonaux : *action déjà faite par un tech* vs *signalement d'anomalie par un utilisateur*.

## Objectifs

- Distinguer dès le scan du QR si on dépose un **signalement** (anomalie à traiter) ou si on **consigne une intervention** (action déjà faite).
- Identifier obligatoirement le déposant (pas d'anonyme), avec email OU téléphone (au moins l'un des deux).
- Côté admin, séparer la page `Alarmes` (à traiter) de la page `Interventions` (registre des actions terrain).
- Préserver les workflows n8n actuels qui lisent `field_interventions` (`feedback_migration_no_break`).

## Hors-périmètre

- Notifications email automatiques sur nouveaux signalements (à étudier plus tard).
- Workflow d'approbation / assignation explicite (signalement → intervention liée).
- Import historique / migration de classification rétroactive des lignes existantes.

## Architecture

### Schéma DB

Migration `field_interventions` :

- `kind` text NOT NULL DEFAULT `'intervention'`, CHECK `kind IN ('signalement', 'intervention')`
- `technician_phone` text NULL
- Contrainte CHECK `technician_contact IS NOT NULL OR technician_phone IS NOT NULL` (au moins un canal de contact)
- Index `idx_field_interventions_kind_status_created` sur `(kind, status, created_at DESC)` pour les requêtes admin

Les lignes existantes restent en `kind='intervention'` (default). On garde `technician_contact` comme champ email (pour ne pas forcer un rename qui casserait n8n). Le frontend traite `technician_contact` comme l'email à afficher / saisir.

### Public — `/intervention?d=...`

Découpe en deux écrans :

**Écran 1 — choix du type :**
- Deux gros boutons côte à côte : "Signaler une anomalie" / "Consigner une intervention"
- Sous-titres courts expliquant chaque option
- Bouton retour vers la page report si besoin

**Écran 2 — formulaire (variantes selon le choix) :**

| Champ | Signalement | Intervention |
|---|---|---|
| Nom | requis | requis |
| Email | au moins un (email ou tél) | au moins un (email ou tél) |
| Téléphone | au moins un (email ou tél) | au moins un (email ou tél) |
| Gravité | requis (info / warning / error) | masquée (default `'info'`) |
| Catégorie | masquée (forcée `'incident'`) | requis (intervention / controle / autre) |
| Message | requis | requis |
| Photos | optionnel | optionnel |

Le bouton "Retour" sur l'écran 2 ramène à l'écran 1 sans perte de saisie tant que la page n'est pas rechargée.

L'API `submitIntervention` ajoute `kind` et `technician_phone` au payload, le validator de l'edge function `submit-intervention` valide la contrainte "email ou phone".

### Admin — `AlarmsView`

Refonte légère :

- 3 onglets : **Fil de l'eau** (alarmes actives + signalements ouverts), **Historique** (transitions alarmes ON/OFF), **Signalements** (renommage de l'onglet "Interventions" actuel, filtré sur `kind='signalement'`)
- Les colonnes du Fil de l'eau gardent l'ordre Date · Sévérité · Device · Source · Sujet · Détail. Les signalements apparaissent avec `Source = "Signalement"`, badge gravité = `severity` choisi par l'utilisateur.
- L'onglet Signalements filtre `kind='signalement'`. Mêmes colonnes que l'actuel onglet Interventions, sauf "Catégorie" remplacée par "Gravité" (déjà présente).

### Admin — `InterventionsView` (nouveau)

- Route `/admin/interventions`, dans `AdminLayout` enfant.
- Garde `requireAuth` (visible pour tous les destinataires loggués, pas que les admins).
- Sidebar : entrée "Interventions" entre "Alarmes" et "Destinataires" (icône clé / outil).
- Page : liste filtrable par catégorie + statut (open/resolved), même structure que l'actuel onglet, filtre `kind='intervention'`.
- Colonnes : Date · Sévérité · Device · Catégorie · Contact (nom + email/tél) · Message · Statut.
- Réutilise les helpers existants : `fmtFullDate`, `typeClass`, modal `detailRow`, lightbox photos, `toggleInterventionStatus`.

### Sidebar

Ordre final : Devices · Carte · Alarmes · **Interventions** · Destinataires (admin only)

Le badge "Alarmes" continue de compter `alarmes actives + signalements ouverts + interventions ouvertes` (= la somme actuelle), pour ne pas perdre la visibilité globale du flux à traiter.

### Vocabulaire UI

- "Intervention" / "Interventions" : action faite par un tech (catégorie / contact tech)
- "Signalement" / "Signalements" : anomalie remontée par n'importe qui (gravité / contact reporteur)
- "Demande" : non retenu (ambigu)

## Flux complets

**Scan QR → signalement :**
1. Utilisateur scanne, arrive sur écran de choix → clique "Signaler une anomalie".
2. Saisit nom, email/tél, gravité, message, photos.
3. Submit → POST `submit-intervention` avec `kind='signalement'`, `severity='warning'` etc., `category='incident'`.
4. Côté admin : apparaît dans le Fil de l'eau et dans l'onglet Signalements.

**Scan QR → intervention :**
1. Utilisateur (tech) scanne, choisit "Consigner une intervention".
2. Saisit nom, contact, catégorie, message, photos.
3. Submit → `kind='intervention'`, `category='intervention'` (ou autre).
4. Côté admin : apparaît dans `/admin/interventions`, et compté dans le badge.

## Stratégie de test

- **Migration** : vérifier que les lignes existantes ont `kind='intervention'`, contrainte CHECK active.
- **Edge function** `submit-intervention` : tests sur les 4 combinaisons (signalement avec email, signalement avec tél, intervention avec email seul, refus si ni email ni tél).
- **UI public** : test e2e manuel pour les 2 chemins (signalement + intervention).
- **UI admin** : vérifier que les onglets / pages filtrent correctement par `kind`.

## Risques et compromis

- **Lignes existantes** classées en `'intervention'` par défaut alors qu'elles peuvent être des signalements rétroactifs : acceptable, l'admin peut corriger manuellement plus tard.
- **n8n** : si des workflows écrivent dans `field_interventions`, ils doivent maintenant fournir `kind`. Le default à `'intervention'` permet une compatibilité ascendante sans modification immédiate. À vérifier au déploiement.
- **`severity` pour interventions** : actuellement la colonne existe et est utilisée. On la laisse remplie en `'info'` par défaut pour les interventions (peut être ajustée par l'admin via le modal de détail si besoin).
- **Promotion signalement → intervention** : non implémenté ; un admin peut éditer la ligne directement en SQL si vraiment besoin.
