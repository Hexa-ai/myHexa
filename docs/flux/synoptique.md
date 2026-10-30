# Synoptique (tuile de tableau de bord)

Un synoptique est un dessin animé d'une installation (cuves, pompes, vannes, conduites), relié aux variables d'une box.
Il s'affiche comme une tuile de tableau de bord (`type = 'synoptic'`) et s'édite sur un écran de bureau uniquement.
Origine : prototype STEMI (`~/suivi/projets/myhexa_support/synoptique/proto_stemi`). Pas de génération IA pour l'instant.

## Données

Migration : `supabase/migrations/20261031140000_synoptiques.sql`.

| Table | Rôle |
|---|---|
| `synoptics` | l'objet : `id`, `company_id`, `device_ids uuid[]` (la première box alimente le dessin), `name`, `current_version`, `created_by`, dates |
| `synoptic_versions` | documents JSON **immuables** : `(synoptic_id, version, doc jsonb, source 'manual'\|'ai'\|'import', created_at, created_by)` |

- Enregistrer = insérer une nouvelle version et avancer `current_version` (RPC `save_synoptic_version`, appelée par `lib/synoptic/api.ts`). On ne modifie jamais une version.
- Droits calqués sur les tableaux de bord : lecture si la box est visible (`is_device_visible`) / même entreprise / staff ; écriture si `can_manage_company`.
- La tuile : `dashboard_widgets` avec `type = 'synoptic'`, `sources[0].device` = la box, `options.synoptic_id`, `options.synoptic_vars` (variables reliées, annoncées au mode direct ; recalculées à l'enregistrement).

## Format du document (`doc`)

Identique à l'export du prototype : `{ schema: 'myhexa-synoptique-edition/1', modele, layout }`.
- `modele` : `equipements` (type, libellé, `slots` : emplacements `marche`, `defaut`, `niveau`, `valeur`… chacun avec `variable` et une `regle` optionnelle), `liaisons` (conduites), `bandeau`, `cartes`, `bibliotheque` (symboles de l'entreprise), `meta`.
- `layout` : taille du dessin, `noeuds` (positions), `aretes` (tracés des conduites), zones, textes.
- Un « Importer un JSON » accepte un export du prototype tel quel (`lireImport` dans `documents.ts`).

## Code

| Fichier | Rôle |
|---|---|
| `lib/synoptic/documents.ts` | schéma, document vide, validation, import |
| `lib/synoptic/regles.ts` | règle variable → état (`eq/ne/gt/ge/lt/le`), pur et testé |
| `lib/synoptic/variables.ts` | variables reliées, valeurs du statut, catalogue (ts_catalog + dernier statut) |
| `lib/synoptic/api.ts` | lecture / création / nouvelle version / synchronisation du bloc |
| `lib/synoptic/environnement.ts` | édition permise = écran ≥ 1024 px **et** pointeur fin |
| `lib/synoptic/engine/` | moteur de rendu et d'édition portés du prototype (`moteur.ts`, `geom.ts`, `synoptique.css`, `types.ts`) |
| `composables/useSynoptic.ts` | charge la version courante, valeurs en direct (store `live`) ou du statut 30 min |
| `composables/useAppFrame.ts` | rectangle de la zone de contenu (pour l'agrandissement) |
| `components/synoptic/SynopticCanvas.vue` | squelette DOM du moteur + cycle de vie |
| `components/synoptic/SynopticTile.vue` | la tuile (âge / direct, Agrandir, Éditer) |
| `components/synoptic/SynopticFrame.vue` | cadre plein-application (sans Fullscreen API), Échap ferme |
| `components/synoptic/SynopticWidgetOptions.vue` | options du bloc : box, synoptique existant, vide, import JSON |
| `views/admin/SynopticView.vue` · `SynopticEditView.vue` | routes `/admin/synoptic/:id` et `/admin/synoptic/:id/edit` |

Le moteur est un unique module (`engine/moteur.ts`, ~2 300 lignes) : le prototype l'écrivait en 14 fichiers concaténés, ici chaque instance vit dans une fermeture (plusieurs synoptiques par page possibles, aucun global). Ses sections sont séparées par des bandeaux `MODULE : …` ; l'intérieur est volontairement non typé (`any`), seule l'interface publique (`engine/types.ts`) est typée.

## Comportement

- **Direct** : la tuile annonce ses variables via `setWanted` (voir `DashboardView.vue`) ; sans direct, dernières valeurs du statut (30 min), comme les autres tuiles. Une variable sans valeur donne un état *inconnu*, jamais « en marche ».
- **Agrandir** : la tuile couvre la zone de contenu (menu latéral conservé), Échap ou « Retour » ferme.
- **Édition** : route plein cadre ; bouton « Éditer le synoptique » visible seulement si l'utilisateur peut modifier le tableau ET `peutEditerIci()`. Sur mobile / tactile, la route redirige vers la vue avec un avis court. Enregistrer = nouvelle version puis retour au tableau.

## Ajouter un symbole

1. Géométrie (taille, ports) : `G.EXTRA` dans `engine/geom.ts` (`{ rw, rh, ports }`).
2. Dessin : fonction du symbole dans la section `symboles` de `engine/moteur.ts` (suivre un symbole voisin, p. ex. `ventilateur`), avec les classes d'état (`marche`, `arret`, `defaut`, `inconnu`) déjà stylées dans `synoptique.css`.
3. Logique d'état : branche du type dans `etat(eq)` ; emplacements éventuels dans `etatExtra`.
4. Palette : entrée du catalogue des symboles (groupe Procédé / Machine…).
5. Test : ajouter un cas dans `tests/unit/lib/synoptic/`.

Les symboles propres à une entreprise se dessinent dans l'éditeur de formes (stockés dans `modele.bibliotheque`), sans toucher au code.

## Tests

- Unitaires : `app/tests/unit/lib/synoptic/` (règles, documents / import-export, géométrie, annuler/rétablir sur le vrai moteur monté dans jsdom).
- E2E TEST : `~/depots/myHexa-tools/e2e/synopt_e2e.mjs` (tableau, tuile, import STEMI, agrandir, éditeur, conduite, variable, enregistrement, mobile).
