# Grille des tableaux de bord

Mise en page des tuiles d'un tableau de bord (vue, édition, vue partagée). Code : `app/src/lib/dashboardGrid.ts` (fonctions pures, testées), `app/src/composables/useGridEditing.ts` (glisser-déposer et redimensionnement), `app/src/style.css` (classes `.dash-grid` / `.dash-tile`), `views/admin/DashboardView.vue` et `SharedDashboardView.vue`.

## Principe : une vraie grille 2D

À partir de 768 px (bureau et tablette) la grille a **12 colonnes** et des **rangées de hauteur fixe** :

- `grid-auto-rows: 54px` (variable `--row-unit`, écart 12 px) ; une tuile occupe `rows` rangées (`grid-row: span var(--rs)`), donc `rows` rangées = `54·rows + 12·(rows − 1)` px (ex. 14 rangées = 912 px) ;
- `grid-auto-flow: row dense` : une petite tuile comble le trou à côté d'une grande. Un synoptique de 6 colonnes × 14 rangées avec, à la suite, deux jauges de 6 colonnes × 7 rangées : les jauges se placent côte à côte avec le synoptique, l'une sous l'autre.
- Sous 768 px : empilement simple en une colonne, hauteurs automatiques (rangées fixes et poignées désactivées). Entre 768 et 1023 px (tablette), une tuile de moins de 6 colonnes passe à 6.

**Pourquoi pas un placement explicite (x, y) comme gridstack ?** Pour empiler 2 ou 3 tuiles à côté d'un synoptique haut, l'ordre du tableau + le remplissage dense suffisent, sans nouveau format de stockage, sans migration, avec un glisser-déposer qui reste « insérer avant / après » (déjà en place). Contrepartie : la position n'est pas libre au pixel, c'est « le premier trou où la tuile tient, dans l'ordre du tableau » ; une petite tuile placée plus loin dans la liste peut donc remonter à côté d'une grande. Le résultat est déterministe et visible en direct pendant le déplacement (barre d'insertion). Si un jour il faut des vides volontaires, ajouter `options.x / options.y` et `grid-column-start / grid-row-start` sans toucher au reste.

## Stockage et compatibilité

Dans le jsonb `options` du bloc (colonne `width` conservée pour les anciens lecteurs) :

| clé | sens |
|---|---|
| `options.w` | colonnes (2–12) ; `width` (`1/4`…`full`) est mis à jour en parallèle |
| `options.rows` | hauteur en rangées de 54 px (2–60 ; 4 minimum pour un synoptique) |
| `options.h` | **ancien** format : rangées de 120 px. Lu (×2, même hauteur en px car 54 + 12 = 66 = ½ × (120 + 12)), jamais réécrit : dès qu'on touche à la taille, `rows` est écrit et `h` supprimé |
| absent | hauteur **par défaut du type** (ancien `h = 1`, nouvelles tuiles) |

Hauteur par défaut (`autoRows`), estimée d'après le type et le contenu : courbe 5 rangées (plus si plusieurs séries ou graphiques séparés), valeur 3, jauge 4 (cuve / barre verticale 5, barre horizontale 3, plusieurs jauges : selon le nombre par ligne), voyant 3, statut selon les champs et les box, carte 6, image 5, tableau selon les variables, texte selon sa longueur, historique d'alarmes selon `limit`, signalements 8, synoptique 8 (= ancien `h = 4`, 516 px). Une tuile dont le contenu dépasse défile verticalement dans sa tuile (`overflow-y-auto` à partir de 768 px) au lieu de déborder sur sa voisine.

Les anciens tableaux gardent donc leurs hauteurs explicites à l'identique ; seules les tuiles « automatiques » prennent une hauteur fixe estimée (avant : celle du contenu, avec la rangée la plus haute de la ligne pour toute la ligne).

Une version de l'application antérieure à celle-ci ignore `options.rows` : elle affiche la tuile en hauteur automatique. Les largeurs restent lues partout.

## Édition

En mode « Modifier » (≥ 768 px), chaque tuile a trois poignées : **angle** (largeur + hauteur), **bord droit** (largeur seule), **bord bas** (hauteur seule). Pendant le geste :

- la tuile et la mise en page **ne bougent pas** ; un **fantôme** en pointillés (boîte aimantée, positionnée sur la tuile) suit le pointeur, avec « *6 col. × 12 rangées · 554 × 780 px* » ;
- l'aimantation est indépendante en largeur (colonnes) et en hauteur (rangées de 54 px) ;
- la taille n'est appliquée qu'au relâchement ; Échap ou annulation du pointeur abandonne le geste ; si une dimension n'a pas changé sur une tuile à hauteur par défaut, la hauteur reste « par défaut ».

Le bloc offre aussi, dans « modifier », un curseur de hauteur (rangées et px) et un bouton *auto*. Le déplacement par glisser-déposer (barre d'insertion avant / après) est inchangé ; avec le remplissage dense, le résultat se lit dans l'ordre du tableau.

## Tests

- Unitaires : `app/tests/unit/lib/dashboardGrid.spec.ts` (colonnes, conversion des anciens `h`, hauteurs par défaut, `resizeTo` par axe, boîte du fantôme).
- E2E (TEST) : `~/depots/myHexa-tools/e2e/grille.mjs` (redimensionnement, fantôme, insertion, enregistrement, mobile) et `grille_libre.mjs` (synoptique 6 col. × 14 rangées + 2 jauges empilées, positions par `getBoundingClientRect`, redimensionnements aux trois poignées, dessin contenu dans la tuile, cadrage enregistré, tablette et mobile ; tableau « E2E grille libre » créé puis supprimé). Captures : `~/.hermes/cache/scratch/grille_libre_*.png`.
