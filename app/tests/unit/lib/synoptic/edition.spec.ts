// Opérations d'édition et historique annuler / rétablir, sur le vrai moteur monté dans jsdom (sans souris).
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import SynopticCanvas from '@/components/synoptic/SynopticCanvas.vue'
import { documentVide } from '@/lib/synoptic/documents'
import type { SynopticInstance } from '@/lib/synoptic/engine/types'

let w: VueWrapper | null = null
beforeAll(() => {
  // jsdom n'a pas ResizeObserver
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as never
  // jsdom ne calcule pas la géométrie SVG
  const svg = SVGElement.prototype as unknown as Record<string, unknown>
  svg.getScreenCTM ??= () => null
})
afterEach(() => {
  w?.unmount()
  w = null
  localStorage.clear()
})

function monter() {
  w = mount(SynopticCanvas, {
    props: { doc: documentVide('Test'), values: {}, editing: true },
    attachTo: document.body,
  })
  const inst = (w.vm as unknown as { instance: SynopticInstance }).instance
  return inst
}

describe('historique annuler / rétablir', () => {
  it('annuler puis rétablir une modification du document', () => {
    const inst = monter()
    const I = inst.interne
    expect(inst.estModifie()).toBe(false)
    I.M().meta.titre = 'Modifié'
    I.pousser()
    expect(inst.estModifie()).toBe(true)
    expect(I.annuler()).toBe(true)
    expect(I.M().meta.titre).toBe('Test')
    expect(I.retablir()).toBe(true)
    expect(I.M().meta.titre).toBe('Modifié')
  })
  it('rien à annuler au départ, rien à rétablir en fin de pile', () => {
    const I = monter().interne
    expect(I.annuler()).toBe(false)
    expect(I.retablir()).toBe(false)
  })
  it('une nouvelle modification après annulation efface la pile de rétablissement', () => {
    const I = monter().interne
    I.M().meta.titre = 'A'
    I.pousser()
    I.annuler()
    I.M().meta.titre = 'B'
    I.pousser()
    expect(I.retablir()).toBe(false)
    expect(I.M().meta.titre).toBe('B')
  })
  it('export JSON → réimport du même document', () => {
    const inst = monter()
    inst.interne.M().meta.titre = 'Export'
    inst.interne.pousser()
    const texte = JSON.stringify(inst.getDoc())
    expect(inst.importerTexte(texte)).toBe(true)
    expect(inst.getDoc().modele.meta?.titre).toBe('Export')
  })
})
