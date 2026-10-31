// Entrées de recherche tirées des catalogues : symboles iso (registre de la bibliothèque de dessin), symboles 2D (palette du moteur),
// symboles des bibliothèques importées. Un seul endroit pour savoir « quels symboles existent, avec quel nom court et quelle famille ».
import type { SymboleDef } from './iso/lib/types'
import { estAccessoireIso } from './iso/familles'
import { entreeSymbole, type Entree } from './recherche'
import { FAMILLE_MA_BIBLIOTHEQUE, idSymboleBibliotheque, type Bibliotheque } from './bibliotheque'

/** nom court affiché : le nom du catalogue sans sa parenthèse descriptive */
export const nomCourt = (nom: string): string => nom.replace(/\s*[(—].*$/, '').trim() || nom

/** symboles 2D de la palette du moteur : [clé, nom, famille] (à garder alignés avec FAMILLES_PALETTE de engine/moteur.ts : un test le vérifie) */
export const PALETTE_2D: ReadonlyArray<{ cle: string; nom: string; famille: string }> = [
  { cle: 'cuve', nom: 'Cuve', famille: 'Procédé' },
  { cle: 'decanteur', nom: 'Décanteur', famille: 'Procédé' },
  { cle: 'silo', nom: 'Silo / trémie', famille: 'Procédé' },
  { cle: 'bassin', nom: 'Bassin ouvert', famille: 'Procédé' },
  { cle: 'pompe', nom: 'Pompe', famille: 'Procédé' },
  { cle: 'compresseur', nom: 'Compresseur', famille: 'Procédé' },
  { cle: 'ventilateur', nom: 'Ventilateur', famille: 'Procédé' },
  { cle: 'vanne', nom: 'Vanne', famille: 'Procédé' },
  { cle: 'vanne_reg', nom: 'Vanne de régulation', famille: 'Procédé' },
  { cle: 'vanne_man', nom: 'Vanne manuelle', famille: 'Procédé' },
  { cle: 'vanne_3v', nom: 'Vanne 3 voies', famille: 'Procédé' },
  { cle: 'clapet', nom: 'Clapet anti-retour', famille: 'Procédé' },
  { cle: 'filtre', nom: 'Filtre', famille: 'Procédé' },
  { cle: 'echangeur', nom: 'Échangeur', famille: 'Procédé' },
  { cle: 'cta_simple', nom: 'CTA simple flux', famille: 'CVC' },
  { cle: 'cta_double', nom: 'CTA double flux', famille: 'CVC' },
  { cle: 'chaufferie', nom: 'Chaufferie', famille: 'Chaufferie' },
  { cle: 'collecteur', nom: 'Collecteur', famille: 'Chaufferie' },
  { cle: 'moteur', nom: 'Moteur', famille: 'Machine' },
  { cle: 'agitateur', nom: 'Agitateur', famille: 'Machine' },
  { cle: 'convoyeur', nom: 'Convoyeur', famille: 'Machine' },
  { cle: 'verin', nom: 'Vérin', famille: 'Machine' },
  { cle: 'disjoncteur', nom: 'Disjoncteur', famille: 'Électrique' },
  { cle: 'transformateur', nom: 'Transformateur', famille: 'Électrique' },
  { cle: 'variateur', nom: 'Variateur', famille: 'Électrique' },
  { cle: 'mesure', nom: 'Mesure', famille: 'Génériques' },
  { cle: 'voyant', nom: 'Voyant', famille: 'Génériques' },
  { cle: 'carte', nom: 'Carte auxiliaire', famille: 'Génériques' },
  { cle: 'texte', nom: 'Texte', famille: 'Génériques' },
  { cle: 'zone', nom: 'Zone', famille: 'Génériques' },
  { cle: 'image', nom: 'Image', famille: 'Génériques' },
]

export const FAMILLE_ACCESSOIRES = 'Sur un tuyau (vannes, capteurs)'

export function entreesIso(catalogue: readonly SymboleDef[]): Entree[] {
  return catalogue.map((d) => entreeSymbole('iso', d.id, nomCourt(d.nom), d.famille, [d.nom, d.id, estAccessoireIso(d.id) ? 'sur tuyau accessoire' : '']))
}

export const entrees2d = (): Entree[] => PALETTE_2D.map((p) => entreeSymbole('2d', p.cle, p.nom, p.famille))

export function entreesBibliotheques(bibs: readonly Bibliotheque[]): Entree[] {
  return bibs.flatMap((b) =>
    b.symboles.map((s) => ({ ...entreeSymbole('iso', idSymboleBibliotheque(b.id, s.id), s.nom, FAMILLE_MA_BIBLIOTHEQUE, [b.nom, ...(s.motsCles ?? [])]), detail: b.nom })),
  )
}
