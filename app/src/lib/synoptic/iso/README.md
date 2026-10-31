# Vue isométrique du synoptique

- `lib/` : copie de `iso_lib/src` (bibliothèque de dessin isométrique : géométrie, catalogue de symboles, ports, routeur orthogonal 3D, étiquettes). **Source de vérité : `iso_lib/` (hors dépôt)** tant que le format n'est pas stabilisé. Les catalogues de dessin portent `/* eslint-disable */` et `// @ts-nocheck` (code massif compilé sans `strictNullChecks` dans iso_lib) ; le noyau (`modele`, `routeur`, `reseau`, `scene`, `etiquettes`…) est typé strictement.
- `format.ts` : section `iso` du document, vues disponibles, conversion vers le document de la bibliothèque, équipements du résumé mobile.
- `etats.ts` : état en direct depuis les variables, mapping des 10 états iso ↔ moteur.
- `familles.ts` : familles métier, emplacements de variables, accessoires posables sur tuyau.
- `edition.ts` : opérations d'édition pures (pose, liaison, accessoire, suppression, plan).
- `grille.ts` : projection, aimantation, grille au sol.
- `iso.css` : styles de la scène et de la palette (variables du portail).

Voir `docs/flux/synoptique.md`, section « Mode isométrique ».
