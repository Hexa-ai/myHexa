import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CLE_STOCKAGE_PANNEAUX, LIMITES_PANNEAUX, PAS_CLAVIER_PANNEAU, usePanneauxEditeur } from '@/composables/usePanneauxEditeur'

class Mem {
  m = new Map<string, string>()
  getItem(k: string) { return this.m.get(k) ?? null }
  setItem(k: string, v: string) { this.m.set(k, v) }
}
const touche = (key: string, extra: Partial<KeyboardEventInit> = {}, cible?: Element) => {
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra })
  if (cible) Object.defineProperty(ev, 'target', { value: cible })
  return ev
}
let stock: Mem
beforeEach(() => { stock = new Mem() })

describe('usePanneauxEditeur', () => {
  it('démarre volets ouverts, largeurs par défaut', () => {
    const p = usePanneauxEditeur({ stockage: stock })
    expect(p.gaucheOuvert.value).toBe(true)
    expect(p.droiteOuvert.value).toBe(true)
    expect(p.largeurGauche.value).toBe(LIMITES_PANNEAUX.gauche.defaut)
    expect(p.styleDroite.value).toEqual({ width: `${LIMITES_PANNEAUX.droite.defaut}px` })
    expect(p.focusDessin.value).toBe(false)
  })
  it('replie et déplie chaque volet, et mémorise', () => {
    const p = usePanneauxEditeur({ stockage: stock })
    p.basculerGauche()
    expect(p.gaucheOuvert.value).toBe(false)
    expect(p.styleGauche.value).toEqual({ width: '0px' })
    p.basculerDroite()
    expect(JSON.parse(stock.getItem(CLE_STOCKAGE_PANNEAUX)!)).toMatchObject({ gaucheOuvert: false, droiteOuvert: false })
    p.basculerGauche()
    expect(p.gaucheOuvert.value).toBe(true)
  })
  it('« focus dessin » replie les deux volets d’un coup, puis les rouvre', () => {
    const p = usePanneauxEditeur({ stockage: stock })
    p.basculerFocus()
    expect(p.gaucheOuvert.value || p.droiteOuvert.value).toBe(false)
    expect(p.focusDessin.value).toBe(true)
    p.basculerFocus()
    expect(p.gaucheOuvert.value && p.droiteOuvert.value).toBe(true)
    p.basculerGauche(false)   // un seul volet ouvert : le focus replie le second
    p.basculerFocus()
    expect(p.focusDessin.value).toBe(true)
    p.basculerFocus()
    expect(p.focusDessin.value).toBe(false)
  })
  it('restaure l’état et les largeurs mémorisés, bornés', () => {
    stock.setItem(CLE_STOCKAGE_PANNEAUX, JSON.stringify({ gaucheOuvert: false, droiteOuvert: true, largeurGauche: 9999, largeurDroite: 10 }))
    const p = usePanneauxEditeur({ stockage: stock })
    expect(p.gaucheOuvert.value).toBe(false)
    expect(p.largeurGauche.value).toBe(LIMITES_PANNEAUX.gauche.max)
    expect(p.largeurDroite.value).toBe(LIMITES_PANNEAUX.droite.min)
  })
  it('ignore un stockage corrompu ou absent', () => {
    stock.setItem(CLE_STOCKAGE_PANNEAUX, '{pas du json')
    expect(usePanneauxEditeur({ stockage: stock }).gaucheOuvert.value).toBe(true)
    expect(usePanneauxEditeur({ stockage: null }).droiteOuvert.value).toBe(true)
  })
  it('définit la largeur dans les bornes et la mémorise', () => {
    const p = usePanneauxEditeur({ stockage: stock })
    p.definirLargeur('gauche', 10)
    expect(p.largeurGauche.value).toBe(LIMITES_PANNEAUX.gauche.min)
    p.definirLargeur('droite', 500)
    expect(p.largeurDroite.value).toBe(500)
    expect(JSON.parse(stock.getItem(CLE_STOCKAGE_PANNEAUX)!).largeurDroite).toBe(500)
    p.reinitialiserLargeur('droite')
    expect(p.largeurDroite.value).toBe(LIMITES_PANNEAUX.droite.defaut)
  })
  it('redimensionne à la souris (le volet droit grandit en tirant vers la gauche) et mémorise au relâcher', () => {
    const surChangement = vi.fn()
    const p = usePanneauxEditeur({ stockage: stock, surChangement })
    p.demarrerRedim('gauche', new MouseEvent('pointerdown', { clientX: 200, button: 0 }) as PointerEvent)
    expect(p.redimension.value).toBe('gauche')
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 260 }))
    expect(p.largeurGauche.value).toBe(LIMITES_PANNEAUX.gauche.defaut + 60)
    window.dispatchEvent(new MouseEvent('pointerup', { clientX: 260 }))
    expect(p.redimension.value).toBeNull()
    expect(JSON.parse(stock.getItem(CLE_STOCKAGE_PANNEAUX)!).largeurGauche).toBe(LIMITES_PANNEAUX.gauche.defaut + 60)
    p.demarrerRedim('droite', new MouseEvent('pointerdown', { clientX: 800, button: 0 }) as PointerEvent)
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 700 }))
    expect(p.largeurDroite.value).toBe(LIMITES_PANNEAUX.droite.defaut + 100)
    window.dispatchEvent(new MouseEvent('pointerup'))
    // les déplacements suivants n'ont plus d'effet
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 0 }))
    expect(p.largeurDroite.value).toBe(LIMITES_PANNEAUX.droite.defaut + 100)
  })
  it('poignée au clavier : flèches et Origine', () => {
    const p = usePanneauxEditeur({ stockage: stock })
    const d = LIMITES_PANNEAUX.gauche.defaut
    expect(p.toucheRedim('gauche', touche('ArrowRight'))).toBe(true)
    expect(p.largeurGauche.value).toBe(d + PAS_CLAVIER_PANNEAU)
    p.toucheRedim('gauche', touche('ArrowLeft'))
    p.toucheRedim('gauche', touche('ArrowLeft'))
    expect(p.largeurGauche.value).toBe(d - PAS_CLAVIER_PANNEAU)
    p.toucheRedim('droite', touche('ArrowRight'))   // volet droit : → rétrécit
    expect(p.largeurDroite.value).toBe(LIMITES_PANNEAUX.droite.defaut - PAS_CLAVIER_PANNEAU)
    p.toucheRedim('gauche', touche('Home'))
    expect(p.largeurGauche.value).toBe(d)
    expect(p.toucheRedim('gauche', touche('a'))).toBe(false)
  })
  it('raccourcis : [ ] Ctrl+B Ctrl+Alt+B Ctrl+Maj+B', () => {
    const p = usePanneauxEditeur({ stockage: stock })
    expect(p.touche(touche('['))).toBe(true)
    expect(p.gaucheOuvert.value).toBe(false)
    p.touche(touche(']'))
    expect(p.droiteOuvert.value).toBe(false)
    p.touche(touche('b', { ctrlKey: true }))
    expect(p.gaucheOuvert.value).toBe(true)
    p.touche(touche('b', { ctrlKey: true, altKey: true }))
    expect(p.droiteOuvert.value).toBe(true)
    p.touche(touche('B', { ctrlKey: true, shiftKey: true }))
    expect(p.focusDessin.value).toBe(true)
    // AZERTY : « [ » s'obtient avec AltGr = Ctrl+Alt
    p.touche(touche('[', { ctrlKey: true, altKey: true }))
    expect(p.gaucheOuvert.value).toBe(true)
    expect(p.touche(touche('x'))).toBe(false)
  })
  it('pas de raccourci pendant une saisie, sauf F11', () => {
    const p = usePanneauxEditeur({ stockage: stock })
    const champ = document.createElement('input')
    expect(p.touche(touche('[', {}, champ))).toBe(false)
    expect(p.touche(touche('b', { ctrlKey: true }, champ))).toBe(false)
    expect(p.touche(touche('f', {}, champ))).toBe(false)
    expect(p.gaucheOuvert.value).toBe(true)
    const f11 = touche('F11', {}, champ)
    expect(p.touche(f11)).toBe(true)
    expect(f11.defaultPrevented).toBe(true)
  })
  it('F et F11 demandent le plein écran sur la zone ; F11 est intercepté', async () => {
    const zone = document.createElement('div')
    const demande = vi.fn(async () => { Object.defineProperty(document, 'fullscreenElement', { value: zone, configurable: true }) })
    ;(zone as unknown as { requestFullscreen: () => Promise<void> }).requestFullscreen = demande
    const sortie = vi.fn(async () => { Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true }) })
    ;(document as unknown as { exitFullscreen: () => Promise<void> }).exitFullscreen = sortie
    const surChangement = vi.fn()
    const p = usePanneauxEditeur({ stockage: stock, zone: () => zone, surChangement })
    p.installer()
    const f11 = touche('F11')
    window.dispatchEvent(f11)
    expect(f11.defaultPrevented).toBe(true)
    await Promise.resolve(); await Promise.resolve()
    expect(demande).toHaveBeenCalledTimes(1)
    document.dispatchEvent(new Event('fullscreenchange'))
    expect(p.pleinEcran.value).toBe(true)
    window.dispatchEvent(touche('f'))
    await Promise.resolve(); await Promise.resolve()
    expect(sortie).toHaveBeenCalledTimes(1)
    document.dispatchEvent(new Event('fullscreenchange'))
    expect(p.pleinEcran.value).toBe(false)
    p.detruire()
    window.dispatchEvent(touche('f'))
    await Promise.resolve()
    expect(demande).toHaveBeenCalledTimes(1)
  })
  it('un plein écran refusé par le navigateur ne lève rien', async () => {
    const zone = document.createElement('div')
    ;(zone as unknown as { requestFullscreen: () => Promise<void> }).requestFullscreen = async () => { throw new Error('refusé') }
    Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true })
    const p = usePanneauxEditeur({ stockage: stock, zone: () => zone })
    await expect(p.basculerPleinEcran()).resolves.toBe(false)
  })
  it('chaque changement prévient l’éditeur (réajustement du canevas) une fois le DOM à jour', async () => {
    const surChangement = vi.fn()
    const p = usePanneauxEditeur({ stockage: stock, surChangement })
    p.basculerGauche()
    p.definirLargeur('droite', 400)
    await new Promise((r) => setTimeout(r, 60))
    expect(surChangement.mock.calls.length).toBe(2)
  })
})
