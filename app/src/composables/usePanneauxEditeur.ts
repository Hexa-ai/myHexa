// Panneaux repliables et redimensionnables des éditeurs de synoptique (2D et iso) + plein écran.
// - volet gauche (palette) et droit (propriétés) : bouton chevron, touches `[` et `]`, Ctrl+B et Ctrl+Alt+B ;
// - poignée de redimensionnement (souris et clavier), largeurs et états mémorisés en localStorage ;
// - « focus dessin » : replie les deux volets d'un coup (Ctrl+Maj+B) ;
// - plein écran (API Fullscreen) sur la zone de l'éditeur : touche F et F11 (interceptée).
// Le composable ne touche pas au DOM des volets : il fournit l'état, les styles et les gestionnaires ; chaque éditeur les branche.
// Rien n'est lié à Vue hors `ref` / `computed` : testable sans monter de composant (voir `installer()` / `detruire()`).
import { computed, getCurrentInstance, onBeforeUnmount, onMounted, ref } from 'vue'

export type CotePanneau = 'gauche' | 'droite'

export interface LimitesPanneau {
  min: number
  max: number
  defaut: number
}

export const LIMITES_PANNEAUX: Record<CotePanneau, LimitesPanneau> = {
  gauche: { min: 140, max: 420, defaut: 196 },
  droite: { min: 240, max: 640, defaut: 344 },
}

export const CLE_STOCKAGE_PANNEAUX = 'myhexa.editeur.panneaux'
/** largeur donnée à un volet par un appui sur ← / → de sa poignée */
export const PAS_CLAVIER_PANNEAU = 16

interface StockageMinimal {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
}

export interface OptionsPanneaux {
  /** élément mis en plein écran (par défaut, toute la page : les fenêtres du Spotlight et de l'explorateur y restent visibles) */
  zone?: () => HTMLElement | null
  /** appelé après chaque changement de volet ou de plein écran, une fois le DOM à jour (réajuste le canevas) */
  surChangement?: () => void
  /** clé de stockage (une paire de largeurs par clé) */
  cle?: string
  stockage?: StockageMinimal | null
  limites?: Partial<Record<CotePanneau, LimitesPanneau>>
}

interface EtatStocke {
  gaucheOuvert: boolean
  droiteOuvert: boolean
  largeurGauche: number
  largeurDroite: number
}

const enSaisie = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null
  return !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable === true)
}

export function usePanneauxEditeur(opt: OptionsPanneaux = {}) {
  const cleStock = opt.cle ?? CLE_STOCKAGE_PANNEAUX
  const lim: Record<CotePanneau, LimitesPanneau> = { gauche: opt.limites?.gauche ?? LIMITES_PANNEAUX.gauche, droite: opt.limites?.droite ?? LIMITES_PANNEAUX.droite }
  const stockage: StockageMinimal | null = opt.stockage !== undefined ? opt.stockage : typeof localStorage !== 'undefined' ? localStorage : null
  const clamp = (c: CotePanneau, v: number): number => Math.round(Math.max(lim[c].min, Math.min(lim[c].max, Number.isFinite(v) ? v : lim[c].defaut)))

  const lu = ((): Partial<EtatStocke> => {
    try {
      const v = JSON.parse(stockage?.getItem(cleStock) ?? '{}')
      return v && typeof v === 'object' ? v : {}
    } catch {
      return {}
    }
  })()
  const gaucheOuvert = ref(lu.gaucheOuvert !== false)
  const droiteOuvert = ref(lu.droiteOuvert !== false)
  const largeurGauche = ref(clamp('gauche', typeof lu.largeurGauche === 'number' ? lu.largeurGauche : lim.gauche.defaut))
  const largeurDroite = ref(clamp('droite', typeof lu.largeurDroite === 'number' ? lu.largeurDroite : lim.droite.defaut))
  const pleinEcran = ref(false)
  /** poignée en cours de glisser (pour désactiver les transitions et afficher la poignée active) */
  const redimension = ref<CotePanneau | null>(null)

  /** les deux volets sont repliés : « focus dessin » */
  const focusDessin = computed(() => !gaucheOuvert.value && !droiteOuvert.value)

  function memoriser(): void {
    try {
      const e: EtatStocke = { gaucheOuvert: gaucheOuvert.value, droiteOuvert: droiteOuvert.value, largeurGauche: largeurGauche.value, largeurDroite: largeurDroite.value }
      stockage?.setItem(cleStock, JSON.stringify(e))
    } catch {
      /* stockage refusé (navigation privée…) : l'état reste valable pour la session */
    }
  }
  /** après un changement : mémorise, puis laisse le DOM se mettre à jour avant de réajuster le canevas */
  function change(): void {
    memoriser()
    const fin = () => opt.surChangement?.()
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(fin))
    else fin()
  }

  const basculerGauche = (v?: boolean): void => { gaucheOuvert.value = v ?? !gaucheOuvert.value; change() }
  const basculerDroite = (v?: boolean): void => { droiteOuvert.value = v ?? !droiteOuvert.value; change() }
  /** focus dessin : si l'un des volets est ouvert, replie les deux ; sinon les rouvre */
  function basculerFocus(): void {
    const ouvrir = focusDessin.value
    gaucheOuvert.value = ouvrir
    droiteOuvert.value = ouvrir
    change()
  }
  function definirLargeur(c: CotePanneau, v: number): void {
    ;(c === 'gauche' ? largeurGauche : largeurDroite).value = clamp(c, v)
    change()
  }

  /* ---------------------------------------------------------------- redimensionnement */
  let nettoyageRedim: (() => void) | null = null
  /** à brancher sur `pointerdown` de la poignée du volet `c` */
  function demarrerRedim(c: CotePanneau, ev: PointerEvent): void {
    if (ev.button !== undefined && ev.button !== 0) return
    ev.preventDefault()
    const x0 = ev.clientX
    const l0 = (c === 'gauche' ? largeurGauche : largeurDroite).value
    redimension.value = c
    const sens = c === 'gauche' ? 1 : -1
    const mv = (e: PointerEvent) => {
      ;(c === 'gauche' ? largeurGauche : largeurDroite).value = clamp(c, l0 + sens * (e.clientX - x0))
    }
    const fin = () => {
      window.removeEventListener('pointermove', mv)
      window.removeEventListener('pointerup', fin)
      window.removeEventListener('pointercancel', fin)
      nettoyageRedim = null
      redimension.value = null
      change()
    }
    nettoyageRedim?.()
    window.addEventListener('pointermove', mv)
    window.addEventListener('pointerup', fin)
    window.addEventListener('pointercancel', fin)
    nettoyageRedim = fin
  }
  /** poignée au clavier : ← / → ajustent la largeur, Origine la remet par défaut ; retourne vrai si la touche a servi */
  function toucheRedim(c: CotePanneau, ev: KeyboardEvent): boolean {
    const sens = c === 'gauche' ? 1 : -1
    const l = (c === 'gauche' ? largeurGauche : largeurDroite).value
    if (ev.key === 'ArrowLeft') definirLargeur(c, l - sens * PAS_CLAVIER_PANNEAU)
    else if (ev.key === 'ArrowRight') definirLargeur(c, l + sens * PAS_CLAVIER_PANNEAU)
    else if (ev.key === 'Home') definirLargeur(c, lim[c].defaut)
    else return false
    ev.preventDefault()
    return true
  }
  const reinitialiserLargeur = (c: CotePanneau): void => definirLargeur(c, lim[c].defaut)

  /* ---------------------------------------------------------------- plein écran */
  const zoneEl = (): HTMLElement | null => opt.zone?.() ?? (typeof document !== 'undefined' ? document.documentElement : null)
  const elementPlein = (): Element | null => (typeof document !== 'undefined' ? document.fullscreenElement : null)
  function majPleinEcran(): void {
    pleinEcran.value = !!elementPlein()
    change()
  }
  async function basculerPleinEcran(): Promise<boolean> {
    if (typeof document === 'undefined') return false
    try {
      if (elementPlein()) await document.exitFullscreen()
      else {
        const z = zoneEl()
        if (!z || !z.requestFullscreen) return false
        await z.requestFullscreen()
      }
      return true
    } catch {
      return false // refusé par le navigateur (pas de geste utilisateur, iframe sans droit…)
    }
  }

  /* ---------------------------------------------------------------- clavier */
  /**
   * Raccourcis : `[` / Ctrl+B = volet gauche · `]` / Ctrl+Alt+B = volet droit · Ctrl+Maj+B = focus dessin · F et F11 = plein écran.
   * Retourne vrai si la touche a été prise. Sans effet pendant une saisie. (Sur clavier AZERTY, `[` et `]` passent par AltGr = Ctrl+Alt : toléré.)
   */
  function touche(ev: KeyboardEvent): boolean {
    if (ev.defaultPrevented) return false
    if (ev.key === 'F11') { ev.preventDefault(); void basculerPleinEcran(); return true }
    if (enSaisie(ev.target)) return false
    const k = ev.key
    const ctrl = ev.ctrlKey || ev.metaKey
    if (ctrl && !ev.shiftKey && k.toLowerCase() === 'b') {
      ev.preventDefault()
      if (ev.altKey) basculerDroite()
      else basculerGauche()
      return true
    }
    if (ctrl && ev.shiftKey && !ev.altKey && k.toLowerCase() === 'b') { ev.preventDefault(); basculerFocus(); return true }
    const altGr = ev.ctrlKey && ev.altKey
    if ((k === '[' || k === ']') && (!ctrl || altGr) && !ev.shiftKey) {
      ev.preventDefault()
      if (k === '[') basculerGauche()
      else basculerDroite()
      return true
    }
    if ((k === 'f' || k === 'F') && !ctrl && !ev.altKey && !ev.shiftKey) { ev.preventDefault(); void basculerPleinEcran(); return true }
    return false
  }

  /* ---------------------------------------------------------------- styles à brancher sur les volets */
  const styleGauche = computed(() => (gaucheOuvert.value ? { width: `${largeurGauche.value}px` } : { width: '0px' }))
  const styleDroite = computed(() => (droiteOuvert.value ? { width: `${largeurDroite.value}px` } : { width: '0px' }))

  /* ---------------------------------------------------------------- cycle de vie */
  const surClavier = (ev: KeyboardEvent) => { touche(ev) }
  let installe = false
  function installer(): void {
    if (installe || typeof document === 'undefined') return
    installe = true
    window.addEventListener('keydown', surClavier)
    document.addEventListener('fullscreenchange', majPleinEcran)
    pleinEcran.value = !!elementPlein()
  }
  function detruire(): void {
    if (!installe) return
    installe = false
    window.removeEventListener('keydown', surClavier)
    document.removeEventListener('fullscreenchange', majPleinEcran)
    nettoyageRedim?.()
    if (elementPlein()) void document.exitFullscreen().catch(() => undefined)
  }
  if (getCurrentInstance()) {
    onMounted(installer)
    onBeforeUnmount(detruire)
  }

  return {
    gaucheOuvert, droiteOuvert, largeurGauche, largeurDroite, pleinEcran, focusDessin, redimension,
    styleGauche, styleDroite, limites: lim,
    basculerGauche, basculerDroite, basculerFocus, basculerPleinEcran, definirLargeur, reinitialiserLargeur,
    demarrerRedim, toucheRedim, touche, installer, detruire,
  }
}

export type PanneauxEditeur = ReturnType<typeof usePanneauxEditeur>
/** clé d'injection : l'éditeur (SynopticEditView) crée les panneaux, la 2D et l'iso les reçoivent */
export const CLE_PANNEAUX_EDITEUR = Symbol('panneauxEditeur')
