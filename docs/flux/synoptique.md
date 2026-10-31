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
| `lib/synoptic/environnement.ts` | édition permise = écran ≥ 1024 px **et** pointeur fin ; mode d'affichage mobile / tablette / bureau |
| `lib/synoptic/resume.ts` | résumé mobile (alarmes + cartes par zone ou ouvrage), pur et testé |
| `lib/synoptic/resume-config.ts` | modifications pures de `modele.resume` (épingler, masquer, déplacer, renommer, réordonner, cartes perso) |
| `lib/synoptic/familles-picto.ts` | table unique type de symbole → famille de pictogramme |
| `lib/synoptic/engine/` | moteur de rendu et d'édition portés du prototype (`moteur.ts`, `geom.ts`, `synoptique.css`, `types.ts`) |
| `composables/useSynoptic.ts` | charge la version courante, valeurs en direct (store `live`) ou du statut 30 min |
| `composables/useAppFrame.ts` | rectangle de la zone de contenu (pour l'agrandissement) |
| `components/synoptic/SynopticCanvas.vue` | squelette DOM du moteur + cycle de vie |
| `components/synoptic/SynopticTile.vue` | la tuile (âge / direct, Agrandir, Éditer) |
| `components/synoptic/SynopticSummary.vue` | le résumé affiché dans la tuile sur mobile |
| `components/synoptic/SynopticResumeEditor.vue` | onglet « Résumé mobile » de l'éditeur (cartes, équipements, aperçu téléphone) |
| `components/synoptic/SynopticMobileFull.vue` | dessin en plein écran mobile / tablette (gestes, croix, retour) |
| `components/synoptic/SynopticFrame.vue` | cadre plein-application (sans Fullscreen API), Échap ferme |
| `components/synoptic/SynopticWidgetOptions.vue` | options du bloc : box, synoptique existant, vide, import JSON, cadrage |
| `components/synoptic/SynopticCadrageOptions.vue` · `lib/synoptic/cadrage.ts` | réglage « Cadrage » (aperçu, zoom, enregistrer la vue) et calculs purs du cadrage relatif |
| `views/admin/SynopticView.vue` · `SynopticEditView.vue` | routes `/admin/synoptic/:id` et `/admin/synoptic/:id/edit` |

Le moteur est un unique module (`engine/moteur.ts`, ~2 300 lignes) : le prototype l'écrivait en 14 fichiers concaténés, ici chaque instance vit dans une fermeture (plusieurs synoptiques par page possibles, aucun global). Ses sections sont séparées par des bandeaux `MODULE : …` ; l'intérieur est volontairement non typé (`any`), seule l'interface publique (`engine/types.ts`) est typée.

## Comportement

- **Direct** : la tuile annonce ses variables via `setWanted` (voir `DashboardView.vue`) ; sans direct, dernières valeurs du statut (30 min), comme les autres tuiles. Une variable sans valeur donne un état *inconnu*, jamais « en marche ».
- **Agrandir** : la tuile couvre la zone de contenu (menu latéral conservé), Échap ou « Retour » ferme.
- **Édition** : route plein cadre ; bouton « Éditer le synoptique » visible seulement si l'utilisateur peut modifier le tableau ET `peutEditerIci()`. Sur mobile / tactile, la route redirige vers la vue avec un avis court. Enregistrer = nouvelle version puis retour au tableau.

## Taille de la tuile et cadrage

- **Hauteur libre** : la tuile n'a plus de hauteur minimale (`min-h-[360px]` supprimé) ni de lien avec sa largeur ; sa hauteur est celle que lui donne la grille (`options.rows`, au moins 4 rangées de 54 px = 252 px, 8 par défaut ; voir [grille.md](grille.md)).
- **Le dessin s'ajuste à la tuile** : le moteur observe la taille du `svg` (`ResizeObserver`) et recalcule la vue à chaque changement (fenêtre, menu latéral, tuile redimensionnée) : tout le dessin, centré, entièrement visible (« contain »). Pendant le geste de redimensionnement la tuile ne bouge pas (fantôme, voir grille.md) ; le dessin se réajuste au relâchement, sans scintillement.
- **Cadrage enregistré** (options de la tuile, section « Cadrage ») : un aperçu à la forme de la tuile se déplace à la souris et se zoome (curseur 1× à 8× ou Ctrl + molette). *Enregistrer la vue actuelle* écrit `options.synoptic_cadre = { x, y, w, h }` : un **rectangle du dessin en fractions** de son étendue (0 à 1). Il ne dépend pas de la taille de la tuile : quelle que soit sa forme, ce rectangle y tient en entier, centré ; seule la marge change de côté. *Ajuster automatiquement* (défaut) supprime l'option. L'aperçu est indicatif (grille supposée de 1 200 px). Moteur : `creerSynoptique({ cadreVue })`, `instance.definirVue(c | null)`, `instance.vue()`, rappel `host.onVue`. Maths pures : `lib/synoptic/cadrage.ts` (`vueDepuisCadre`, `cadreDepuisVue`, `cadreAvecZoom`).
- Si l'utilisateur zoome ou déplace le dessin avec la souris dans la tuile, la vue n'est plus suivie jusqu'à « ⤢ » (ajuster) : comportement du moteur inchangé. Résumé mobile et plein écran inchangés (le cadrage n'y est pas utilisé).

## Mobile et tablette

Trois modes d'affichage (`modeAffichage()` dans `environnement.ts`, réactif via `useModeAffichage()`) :

| Mode | Condition | Tuile du tableau de bord |
|---|---|---|
| **mobile** | écran < 768 px **ou** `(pointer: coarse)` | résumé, aucun geste capté, bouton « Voir le synoptique » |
| **tablette** | 768 – 1023 px, pointeur fin | dessin **sans capture de geste** + bouton « Plein écran » |
| **bureau** | ≥ 1024 px, pointeur fin | inchangé : dessin interactif, « Agrandir », « Éditer » |

- **Pourquoi** : sur téléphone, un dessin zoomable dans une tuile qui défile se bat avec la page (zoom par erreur, glisser qui déplace tantôt le dessin tantôt la page). La tuile ne capte donc plus rien ; les gestes n'existent que dans le plein écran.
- **Résumé** (`construireResume(doc, valeurs)`) : d'abord les alarmes actives (équipement en alarme ou en défaut, voyants du bandeau), puis une carte par zone (`modele.zones`) ; une zone qui contient plusieurs ouvrages (cuve, décanteur, silhouette, filtre, échangeur) est scindée par ouvrage. Un équipement sans zone suit son ouvrage dans cet ordre : agitateur (`params.agitateur`), même variable que le niveau d'un ouvrage, même préfixe de repère (`CF-PIT-01` → `CF-RV-01`), proximité sur le dessin, sinon la carte « Autres équipements ». État de la carte : défaut (alarme) > marche > arrêt > normal > inconnu. Valeurs (3 au plus, sans doublon de variable) : niveau, mesures avec unité, vitesse, vannes ouvertes. Mêmes règles d'état que le moteur (variable absente = *inconnu*) ; les états déduits (`derive`) du moteur ne sont pas repris. Chaque carte porte son `cadre` (boîte englobante dans le dessin).
- **Valeurs vivantes** : les mêmes que la tuile de bureau (`useSynoptic` : direct sinon dernier statut) ; l'indicateur DIRECT / âge de la barre est conservé, le nombre d'alarmes vient du résumé.
- **Plein écran** (`SynopticMobileFull.vue`) : `position: fixed` sur `<body>` (Teleport), `100dvh`, `z-index` 1000 au-dessus du menu et de l'en-tête, sans Fullscreen API ; défilement du body bloqué pendant l'ouverture ; marges `safe-area` (croix, boutons de zoom), donc aussi en paysage. Gestes (moteur, option `gestes`) : pincement à deux doigts, déplacement à un doigt (le doigt restant reprend sans saut), double tap = tout voir. Depuis une carte : `instance.cadrer(cadre)` centre et zoome sur l'ouvrage.
- **Fermeture** : croix discrète (zone tactile 44 px, pastille semi-transparente, en haut à gauche), retour du téléphone, Échap. À l'ouverture on ajoute une entrée d'historique avec `history.pushState({ …history.state, synopticPleinEcran: true }, '')` (même adresse, état du routeur conservé) ; `popstate` ferme. La croix et Échap font `history.back()` pour dépiler cette entrée, donc ouvrir/fermer n'empile rien.
- **Option moteur `gestes: false`** (tuile de tablette) : ni molette, ni pointeur, `touch-action: auto`, boutons de zoom masqués ; le clic sur un équipement ouvre toujours sa fiche.
- **Édition** : jamais sur mobile ni tablette (`usePeutEditerIci`).
- **Thèmes** : variables du thème uniquement (`bg-card`, `text-destructive`, `bg-signal`, `border-border`…), aucune couleur en dur.

### Personnaliser le résumé mobile

Le résumé est **automatique par défaut** ; l'éditeur (bureau seulement) permet de le corriger. Onglet **« Résumé mobile »** de la barre de l'éditeur (à côté de « Dessin », composant `SynopticResumeEditor.vue`) :

- **Gauche** : les cartes calculées. Pour chacune : glisser par la poignée ou ↑ ↓ pour réordonner, titre modifiable, « Masquer » (carte retirée du résumé), puis le détail (« + n équip. ») avec ses équipements : **Épingler**, **Masquer**, **pictogramme** (automatique, une famille, ou « Aucun »), **→ carte** (déplacer vers une autre carte) et les **valeurs affichées** (3 au plus, à cocher parmi les variables analogiques de la carte). « **+ carte** » crée une carte personnalisée (titre + équipements cochés) ; « Supprimer cette carte » rend ses équipements à leur carte automatique.
- **Droite** : aperçu **en direct** au format téléphone (390 px, une colonne) : c'est `SynopticSummary.vue` avec les valeurs courantes de la box, donc exactement la tuile mobile (sans valeur reçue : états inconnus).
- **« Rétablir l'automatique »** supprime toute la section `resume` (après confirmation). Un équipement sélectionné dans le dessin propose aussi, dans le panneau de propriétés, la case « Épingler dans le résumé mobile ».
- **Enregistrement** : comme le reste du document (bouton Enregistrer ou Ctrl+S = nouvelle version, même circuit que le dessin) ; les corrections passent par l'historique annuler / rétablir du moteur (`instance.setResume`). Les raccourcis du dessin (Suppr, flèches, Ctrl+Z) sont neutralisés sous cet onglet.

**Modèle** : section optionnelle `modele.resume` (types `ResumeConfig` dans `engine/types.ts`). Un document sans cette section se comporte exactement comme avant ; une entrée qui désigne un équipement ou une carte disparus est ignorée.

```json
"resume": {
  "equipements": { "P1": { "epingle": true, "masque": false, "carte": "Z2", "famille": "vanne" } },
  "cartes":      { "Z1": { "titre": "Skid", "ordre": 0, "masquee": false, "valeurs": ["NIV1", "T1"] } },
  "cartesPerso": [ { "id": "perso-1", "titre": "Pompes", "equipements": ["P1", "P2"] } ]
}
```

| Correction | Effet |
|---|---|
| `epingle` | toujours montré (pictogramme + ses valeurs niveau / mesure / vitesse) dans sa carte, **avant** l'ordre automatique et **sans compter dans la limite** (4 pictogrammes, 3 valeurs) ; les cases libres restent remplies automatiquement. Plus de 4 épingles : tous restent montrés |
| `masque` | jamais montré en pictogramme ni en valeur ; **ses alarmes restent affichées** (voir ci-dessous). Épingler lève le masquage et inversement |
| `carte` | rattache l'équipement à une autre carte (id d'une zone, d'un ouvrage ou d'une carte personnalisée) |
| `famille` | famille de pictogramme forcée (`pompe`, `moteur`, `ventilateur`, `vanne`, `cuve`, `registre`, `batterie`, `roue`, `flamme`, `filtre`) ou `aucun` ; `aucun` l'emporte sur l'épingle |
| carte : `titre` | renomme la carte (les alarmes qui la citent suivent) |
| carte : `ordre` | rang d'affichage : les cartes avec un rang passent d'abord (par rang, **même devant une carte en alarme**, car les alarmes restent en tête du résumé), les autres suivent dans l'ordre automatique, cartes en alarme devant |
| carte : `masquee` | carte absente du résumé |
| carte : `valeurs` | variables affichées (3 au plus, dans l'ordre choisi) ; « — » tant qu'une variable n'a pas répondu ; elles remplacent les valeurs automatiques et épinglées ; si aucune variable n'existe plus, retour à l'automatique |
| `cartesPerso` | carte créée par l'utilisateur ; ses équipements quittent leur carte automatique |

- **Choix de sécurité : masquer ne supprime jamais une alarme.** La liste d'alarmes du haut du résumé, le compteur d'alarmes de la carte et l'état « défaut » de la carte sont calculés sur **tous** les équipements, masqués ou non, et sur toutes les cartes, y compris une carte masquée. Un équipement masqué ou une carte masquée en défaut apparaît donc toujours dans le bandeau d'alarmes. L'état marche / arrêt d'une carte tient aussi compte de ses équipements masqués.
- **Cartes CVC** (bandeaux CTA, lignes hydrauliques) : seuls le titre, l'ordre et le masquage s'appliquent ; leurs pictogrammes et valeurs restent ceux de leurs modules.
- **Code** : `resume.ts` calcule d'abord les groupes automatiques (`formerGroupes`), puis applique les corrections (`appliquerRattachements`, pictogrammes, valeurs, ordre) en fonction pure ; `construireResume(doc, valeurs, { auto: true })` ignore la section. `detailResume` renvoie en plus les cartes masquées et les équipements (utilisé par l'éditeur). Les modifications de `modele.resume` sont des fonctions pures dans `resume-config.ts` (épingler, masquer, déplacer, renommer, réordonner, créer une carte…). Tests : `tests/unit/lib/synoptic/resume-config.spec.ts` ; E2E : `resume_config.mjs`.

#### Familles de pictogrammes déclaratives

Chaque type de symbole déclare sa famille de pictogramme à **un seul endroit** : la table exportée `FAMILLE_PICTO_PAR_TYPE` de `lib/synoptic/familles-picto.ts` (`type` → famille, ou `null` s'il n'a pas de pictogramme). Un nouveau symbole du catalogue n'a qu'à y ajouter sa ligne ; un test échoue si un type du catalogue du moteur n'y figure pas. Les pictogrammes des modules CVC se déclarent dans `engine/cvc-modele.ts` (champ `picto` du module).

## Famille CVC (traitement d'air et chaufferie)

Deux éléments paramétriques, dessinés en SVG par `engine/cvc-dessin.ts` à partir du modèle pur `engine/cvc-modele.ts` (géométrie, états, ports, résumé mobile ; testé dans `tests/unit/lib/synoptic/cvc.spec.ts`). Les documents existants (process) ne sont pas touchés : seuls les types `cta` et `hydro` passent par cette branche (`geom.ts`, `symCvc` dans `moteur.ts`).

- **Bandeau CTA** (`type: "cta"`, palette « CVC ») : une gaine de 160 de haut (axe y=80), modules de 60 ou 120 de large posés bout à bout. `params.flux` = `simple` (un étage) ou `double` (extraction en haut, de droite à gauche ; soufflage en bas ; modules doubles 120×320 qui relient les deux étages : récupérateur à plaques ou à roue, caisson de mélange). `params.colonnes` = liste de colonnes `{ haut?, bas?, double? }`, chaque module `{ id, k, libelle?, w? }`.
  Modules : air neuf, reprise, soufflage, rejet (flèche colorée par type d'air), registre, filtre plan / à poches, batteries chaude / froide / électrique (piquages d'eau), humidificateur, piège à son, ventilateur, sonde, gaine, récupérateur à plaques, roue, caisson de mélange.
- **Lignes hydrauliques** (`type: "hydro"`, palette « Chaufferie ») : deux lignes horizontales, aller (y=50, chaud) et retour (y=110, froid) ; une rangée par départ (pas 160), reliées par des collecteurs verticaux dès qu'il y a plusieurs rangées. Modules : chaudière, PAC, pompe, vanne 2 voies, vanne 3 voies mélangeuse, échangeur, bouteille de découplage, ballon ECS, vase, pot à boue, filtre, compteur d'énergie, clapet, isolement, sonde, départ réseau, arrivée.
- **Emplacements de variables** : un module a ses propres emplacements, nommés `<id module>:<grandeur>` (`VE1:marche`, `VE1:defaut`, `VE1:frequence`, `BC:sortie_t`, `BC:position`, `FS1:dp`…). Ils sont créés, renommés et retirés avec les modules (`synchroniserSlots`) ; les règles de conversion existantes s'appliquent comme pour les autres symboles. Les valeurs sont écrites en étiquettes au-dessus (étage haut : au-dessus de la gaine ; étage bas : sous l'étage du haut) et le nom du module sous la gaine.
- **États** identiques partout : vert = marche, gris = arrêt, rouge + pastille « ! » = défaut, position intermédiaire = « modulant » (lames de registre à 45°, vanne proportionnelle). Le ventilateur et la roue tournent en marche, la couronne des pompes aussi (animations CSS, coupées avec `prefers-reduced-motion`).
- **Couleurs** : uniquement des variables du thème (`--air-neuf`, `--air-souffle`, `--air-repris`, `--air-rejete`, `--eau-aller`, `--eau-retour`, `--flamme`, valeurs clair et sombre dans `synoptique.css`).
- **Édition** : le panneau de propriétés d'un bandeau liste les modules (libellé, flèches ◀ ▶, retrait, largeur, ligne aller/retour) et propose « Ajouter un module » (par groupes) ; le type de CTA (simple / double) et, en hydraulique, l'ajout d'un départ s'y règlent aussi.
- **Résumé mobile** (`cartesCvc`) : CTA → cartes « Soufflage » (ventilateur du bas, T, humidité, Hz), « Reprise » (ventilateur du haut, T, CO₂), « Récupération », « Batteries » (T de sortie et position de vanne, qualifiées par le nom du module), « Filtres et registres » ; hydraulique → une carte par départ. Pictogrammes : ventilateur, registre, batterie, roue, flamme, filtre, pompe, vanne.
- **Limites** : pas de conduites libres entre un bandeau et les autres symboles hors des ports `in`/`out` (et `p3`/`p4` en double flux) ; les alarmes d'un bandeau sont celles de ses modules (défaut, antigel, colmatage).

## Ajouter un symbole

1. Géométrie (taille, ports) : `G.EXTRA` dans `engine/geom.ts` (`{ rw, rh, ports }`).
2. Dessin : fonction du symbole dans la section `symboles` de `engine/moteur.ts` (suivre un symbole voisin, p. ex. `ventilateur`), avec les classes d'état (`marche`, `arret`, `defaut`, `inconnu`) déjà stylées dans `synoptique.css`.
3. Logique d'état : branche du type dans `etat(eq)` ; emplacements éventuels dans `etatExtra`.
4. Palette : entrée du catalogue des symboles (groupe Procédé / Machine…).
5. Pictogramme du résumé mobile : une ligne dans `FAMILLE_PICTO_PAR_TYPE` (`lib/synoptic/familles-picto.ts`), `null` si le symbole n'en a pas.
6. Test : ajouter un cas dans `tests/unit/lib/synoptic/`.

Les symboles propres à une entreprise se dessinent dans l'éditeur de formes (stockés dans `modele.bibliotheque`), sans toucher au code.

## Mode isométrique

Un synoptique peut avoir une vue **2D** (moteur historique), une vue **isométrique**, ou les deux. Le choix de la vue d'ouverture est enregistré dans le document (`iso.vue`).

**Format.** Le document v2 reçoit une section optionnelle `iso` (`app/src/lib/synoptic/iso/format.ts`) : `composants` (type du catalogue, x/y au sol, z hauteur, rotation, état fixe), `liaisons` (ports reliés, DN, fluide, `accessoires` posés à l'abscisse `s` du tuyau), `sol` (étendue de la grille), `vue`, `instruments`. Chaque objet porte en plus `libelle` et `slots` (variables reliées, même forme que les équipements 2D : `{ variable, regle? }`). Un document sans `iso` se comporte exactement comme avant : `avecIso(doc)` le renvoie tel quel, `variablesLiees` n'ajoute rien, l'import ne crée pas la section. La section est omise tant que la scène est vide.

**Éditeur** (PC uniquement, bascule « 2D | Iso » dans la barre ; le 2D reste monté dessous, ses modifications ne sont pas perdues) : grille isométrique au sol (2 axes à 30° + axe de hauteur gradué), palette du catalogue (vannes et capteurs « sur un tuyau » en tête), pose aimantée (pas 10/20/40), glisser pour déplacer, `R` quart de tour, hauteur z par champ ou `[` / `]`, `L` (ou « Relier ») puis clic sur deux ports : le routeur de la bibliothèque trace le tuyau (coudes, tés, ponts) et le recalcule quand on déplace un appareil. Une vanne ou un capteur armé (ou déposé) sur un tuyau se cale dans l'axe ; il glisse le long du tuyau. DN et fluide se règlent sur la liaison. Profondeur : automatique, ou « premier plan » / « arrière-plan » (`PageUp` / `PageDown`). Annuler / rétablir propre à la vue iso ; enregistrement par le circuit habituel (nouvelle version, brouillon / publication inchangés), `Ctrl+S`.

**Variables et états en direct** (`iso/etats.ts`) : mêmes emplacements que le 2D (marche, défaut, ouvert / fermé, position, niveau, valeur, vitesse selon la famille, `iso/familles.ts`) et même panneau (sélecteur de variable, règle `{ op, val }`). Les 10 états de la bibliothèque (arrêt, marche, défaut, alarme, modulant, ouvert, fermé, inconnu, consigne, maintenance) sont mappés sur ceux du moteur (`ETAT_ISO_VERS_MOTEUR`, test de totalité). Une grandeur reliée sans mesure n'affiche rien (pas de valeur fixe trompeuse). Les valeurs reliées des appareils sans instrument sont posées en étiquettes (placement automatique, `etiquettes.ts`).

**Résumé mobile** : `avecIso` ajoute au document les équipements iso (pompes, cuves, vannes, capteurs reliés ou nommés) comme équipements du moteur (`type_iso`) ; `familleDe` lit `FAMILLE_PICTO_PAR_TYPE_ISO` (un test exige qu'aucun symbole du catalogue iso ne manque).

**Affichage** : `SynopticVue.vue` choisit la vue (tuile, vue agrandie, plein écran mobile) et affiche la bascule quand les deux existent ; le dessin iso est chargé à la demande (chunk séparé, ~70 ko gzip). Thèmes clair / sombre par les variables CSS du portail ; édition réservée au PC, consultation OK tablette / mobile.

**Origine du code.** `app/src/lib/synoptic/iso/lib/` est une copie de `iso_lib/src` (source de vérité tant que le format n'est pas stabilisé : `~/suivi/projets/myhexa_support/synoptique/iso_lib/`). Écarts : imports `import type`, suppression de code mort, `any` justifiés dans `modele.ts` / `types.ts`. Les catalogues de dessin (pompes, vannes, cuves, chaufferie, CTA…) gardent `/* eslint-disable */` et `// @ts-nocheck` : code de dessin massif qui ne compile pas en `strictNullChecks`. Pour resynchroniser : recopier, puis relancer `eslint`, `vue-tsc` et `vitest`.

**Limites connues.** Le glisser-déposer depuis la palette n'a pas d'aperçu fantôme (le clic « armer puis poser » est la voie testée) ; pas de multi-sélection ; pas de copier-coller ; une seule hauteur z par appareil (pas de plans / étages éditables, `plan` du modèle non exposé) ; routage automatique sans point de passage manuel (`via` conservé mais non éditable) ; la bascule 2D / iso n'est pas partagée entre vues (pas de lien entre un équipement 2D et son jumeau iso) ; mobile : pincer / glisser seulement, pas d'édition.

Tests : `tests/unit/lib/synoptic/iso-format.spec.ts` (format, rétrocompatibilité, routage via le moteur, mapping d'états, résumé) ; e2e `myHexa-tools/e2e/synopt_iso.mjs`.

## Tests

- Unitaires : `app/tests/unit/lib/synoptic/` (règles, documents / import-export, géométrie, annuler/rétablir sur le vrai moteur monté dans jsdom).
- Unitaires du résumé : `tests/unit/lib/synoptic/resume.spec.ts` (automatique) et `resume-config.spec.ts` (corrections `modele.resume`, familles de pictogrammes).
- E2E résumé mobile : `~/depots/myHexa-tools/e2e/resume_config.mjs` (`BASE=… node resume_config.mjs`) : sur une copie du synoptique STEMI, épingler, masquer, renommer, réordonner, carte personnalisée, enregistrer, tuile mobile avant / après ; captures `resume_config_*.png`.
- Cadrage : `tests/unit/lib/cadrage.spec.ts` ; E2E `grille_libre.mjs` (enregistrement, rechargement, redimensionnement, retour à l'automatique).
- E2E TEST : `~/depots/myHexa-tools/e2e/synopt_e2e.mjs` (tableau, tuile, import STEMI, agrandir, éditeur, conduite, variable, enregistrement, mobile).
- E2E mobile : `~/depots/myHexa-tools/e2e/synopt_mobile.mjs` (`BASE=… node synopt_mobile.mjs`, tableau Démo STEMI) : résumé, défilement de la page par glissement, plein écran, gestes, croix / retour / Échap, paysage, tablette, thèmes clair et sombre ; captures `~/.hermes/cache/scratch/mobile_synopt_*.png`.

## Explorateur de bibliothèque

Grand dialogue (≈ 80 % de l'écran) `SynopticExplorateur.vue`, logique pure dans `lib/synoptic/explorateur.ts`. Ouvert par « Tout voir… » du Spotlight, par le bouton « ▦ Bibliothèque » des palettes 2D et iso, ou par Ctrl+Maj+K.
- Arbre : Tout, Favoris, Récents, Familles (repliables, compteurs qui suivent recherche et filtre), Ma bibliothèque (une entrée par bibliothèque importée).
- Recherche = index du Spotlight ; filtre 2D / Iso / Tout. Vignettes SVG rendues à la volée, en chargement paresseux (IntersectionObserver).
- Seul le **clic** (ou le clavier) sélectionne un symbole : le survol ne fait qu'un léger surlignage, donc l'état choisi dans le détail ne se perd pas. Pastille de statut sur chaque vignette iso : gris = brouillon, bleu = revu, vert = validé.
- Détail : aperçu, états (planche du symbole), variantes, mots-clés. « ⤢ Agrandir » (ou Espace) ouvre l'aperçu en grand (≈ 70 % de l'écran) : symbole entier, états et variantes, fond clair ou sombre, zoom à la molette (glisser pour déplacer, double-clic = 100 %), ← → pour le symbole voisin. Actions : ★ (touche F), « Poser » (↵, arme et ferme), glisser vers le dessin (iso).
- Import / export JSON : `bibliotheque.ts` ; un symbole de bibliothèque se pose en composition (`poserComposition`).
- Palettes : Favoris, puis Récents, puis familles repliées. Favoris et récents sont partagés (stockage local) ; l'évènement `myhexa:preferences` les tient à jour.

## Qualité des symboles

La bibliothèque iso doit contenir **moins de symboles, mais mieux faits**. Le marché visé est la France (bâtiment tertiaire, industrie, énergie) : les références sont françaises et européennes.

### Grille de critères

Un symbole n'est « validé » que s'il respecte tous ces points :

1. **Perspective juste** : tous les ronds sont des ellipses sur le plan xy, xz ou yz (jamais un `<circle>` plat).
2. **Brides et tuyaux coaxiaux** : deux ports face à face d'un composant en ligne ont le même axe.
3. **Parties cachées réellement cachées** : ce qui est derrière n'apparaît pas (roues, arrière des brides…).
4. **Silhouette reconnaissable** au premier coup d'œil, à la taille d'une vignette.
5. **3 tons, 2 à 3 détails signifiants**, pas de micro-détails.
6. **Conforme à ce qu'on voit en France** (équipements, normes, repères européens).
7. **Clair et sombre** : lisible sur les deux fonds.
8. **États lisibles** : marche, défaut, etc. se distinguent sans légende.

### Contrôles automatiques

`app/src/lib/synoptic/iso/qualite/` ; test `tests/unit/lib/synoptic/qualite-symboles.spec.ts` ; rapport : `pnpm qualite:symboles` (JSON + Markdown dans `~/.hermes/cache/scratch/qualite/`, ou `--sortie`).
Pour chaque symbole, dans chaque état et chaque variante (et 4 rotations) :
- **erreurs dures** (le test échoue) : exception au rendu, taille ou SVG invalide, port hors de la boîte `taille()`, direction de port non unitaire, deux ports seuls face à face presque alignés mais décalés (≤ 15), texte rendu en miroir (déterminant négatif) ;
- **avertissements** (rapport seulement) : pièces hors de la boîte, cercles non projetés (`<circle>` dont la transformation conserve les cercles, hors badges et LED), ports opposés très décalés (voulu ?), identifiants de port en double, mots-clés FR / EN absents, nom vide ou en doublon, dessin bien plus petit que la boîte.
- Les erreurs dures déjà présentes à l'introduction du contrôle sont listées dans `tests/unit/lib/synoptic/fixtures/qualite-erreurs-connues.json` : le test échoue sur toute **nouvelle** erreur ; en corrigeant un symbole, on retire sa ligne (`pnpm qualite:symboles --maj-dette` réécrit la liste).

### Planche de revue

`pnpm qualite:revue` produit `revue.html` (page autonome) et une capture `revue_<famille>.png` par famille. Chaque symbole y est montré en grand, états marche et défaut, fond clair **et** sombre, avec son id, son nom, son statut et ses avertissements. Le relecteur coche « Validé » ou « À refaire », commente ; les décisions restent dans le navigateur (localStorage) et s'exportent en JSON (« Exporter »). `pnpm qualite:appliquer <revue-symboles-….json> [--dry]` les reporte dans le champ `statut` du fichier source du symbole (recherche de `id: '<id>'` ; une définition produite par une fabrique est signalée, à éditer à la main). « À refaire » remet le symbole en `brouillon`.

### Cycle de vie

`brouillon` (défaut) → `revu` (corrigé, en attente de validation) → `valide` (validé par la revue) ; `obsolete` = retiré des propositions (explorateur, Spotlight, palettes) mais toujours dessiné : un document existant qui l'utilise s'affiche comme avant (`remplacePar` indique le symbole de remplacement). Champs `statut` et `remplacePar` de `SymboleDef` ; règles de visibilité dans `lib/synoptic/statut.ts`.

**Règle pour la diffusion publique : seuls les symboles « validés » seront proposés.** L'option existe (`OptionsStatut.seulementValides`, acceptée par `estPropose`, `symbolesProposes` et `entreesIso`) mais n'est **pas activée** : `OPTIONS_STATUT_DEFAUT.seulementValides = false`.
