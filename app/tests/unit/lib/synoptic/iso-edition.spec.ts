// Édition iso : préréglages, orientation (tilt), piquages libres, duplication / copier-coller.
import { describe, expect, it } from 'vitest'
import { catalogue, construire, rendu0 } from '@/lib/synoptic/iso/lib'
import { docLib, isoVide, normaliserIso, type IsoSection } from '@/lib/synoptic/iso/format'
import { ajouterPiquage, basculer, poserSymbole, relierPorts, retirerPiquage } from '@/lib/synoptic/iso/edition'
import { PRESETS, idPreset, resoudre } from '@/lib/synoptic/iso/presets'
import { coller, copier, dupliquer, incrementerRepere } from '@/lib/synoptic/iso/duplication'
import { chercher } from '@/lib/synoptic/recherche'
import { entreesPresets } from '@/lib/synoptic/iso/presets'

const ids = new Set(catalogue().map((d) => d.id))
const rendre = (iso: IsoSection) => construire(docLib(iso, {}, { editeur: true }))

describe('préréglages', () => {
  for (const p of PRESETS) {
    it(`preset ${p.id} : base connue, pose et dessin sans erreur, mots-clés FR | EN`, () => {
      expect(ids.has(p.base), `base ${p.base}`).toBe(true)
      expect(p.motsCles.split('|').length, 'FR | EN').toBe(2)
      const iso = isoVide()
      const id = poserSymbole(iso, idPreset(p), 200, 200, { aimant: 20 })
      const c = iso.composants.find((q) => q.id === id)!
      expect(c.type).toBe(p.base)
      expect(rendre(iso).scene.toSvg({ css: false, fond: false })).not.toMatch(/NaN/)
    })
  }
  it('ids uniques', () => expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length))
  it('un symbole ordinaire se résout en lui-même', () => expect(resoudre('pompe.circulateur').type).toBe('pompe.circulateur'))
  it('Ctrl+K retrouve « circulateur double », « jumelé » et « twin pump »', () => {
    for (const q of ['circulateur double', 'jumelé', 'twin pump']) {
      const r = chercher(entreesPresets(), q, { contexte: 'iso', portee: 'tout' })
      expect(JSON.stringify(r), q).toContain('circulateur_double')
    }
  })
})

describe('orientation', () => {
  it('basculer fait le cycle horizontal → vertical → vertical descendant → horizontal', () => {
    const c = { id: 'a', type: 'vanne.3voies', x: 0, y: 0, z: 0 } as IsoSection['composants'][0]
    basculer(c); expect(c.tilt).toBe('x')
    basculer(c); expect(c.tilt).toBe('xn')
    basculer(c); expect(c.tilt).toBeUndefined()
    basculer(c, 'y'); expect(c.tilt).toBe('y')
  })
  it('les ports d’un circulateur et d’une V3V basculés sont alignés à la verticale', () => {
    for (const type of ['pompe.circulateur', 'vanne.3voies']) {
      const h = rendu0(type, {}, 'arret', {}, 0)
      const v = rendu0(type, {}, 'arret', {}, 0, 'x')
      const ph = h.ports.map((p) => p.pos), pv = v.ports.map((p) => p.pos)
      expect(pv.length).toBe(ph.length)
      const dz = Math.max(...pv.map((p) => p[2])) - Math.min(...pv.map((p) => p[2]))
      expect(dz, `${type} s’étend en hauteur`).toBeGreaterThan(10)
    }
  })
  it('deux V3V verticales superposées se relient par un tuyau droit', () => {
    const iso = isoVide()
    const a = poserSymbole(iso, 'preset:v3v_verticale', 200, 200, { aimant: 20 })
    const b = poserSymbole(iso, 'preset:v3v_verticale', 200, 200, { aimant: 20 })
    iso.composants.find((c) => c.id === b)!.z = 200
    const ra = rendre(iso).rendus[a], rb = rendre(iso).rendus[b]
    const haut = ra.ports.reduce((m, p) => (p.pos[2] > m.pos[2] ? p : m))
    const bas = rb.ports.reduce((m, p) => (p.pos[2] < m.pos[2] ? p : m))
    relierPorts(iso, { c: a, port: haut.id }, { c: b, port: bas.id }, haut, bas)
    const r = rendre(iso)
    expect(r.scene.toSvg({ css: false, fond: false })).not.toMatch(/NaN/)
    expect(Object.values(r.liaisons)[0].ok).toBe(true)
  })
})

describe('piquages libres', () => {
  const conteneur = [...ids].find((i) => i.startsWith('conteneur.')) ?? 'pompe.centrifuge_h'
  it('ajoute un port reliable pq_<id> à une face, dessiné et routable', () => {
    const iso = isoVide()
    const cid = poserSymbole(iso, conteneur, 100, 100, { aimant: 20 })
    const pid = poserSymbole(iso, 'pompe.centrifuge_h', 400, 100, { aimant: 20 })
    const c = iso.composants.find((q) => q.id === cid)!
    const pq = ajouterPiquage(c, { face: 'droite', u: 0.5, v: 0.4, dn: 50, fluide: 'eau' })
    const avant = rendre(iso).rendus[cid].ports.length
    expect(rendre(iso).rendus[cid].port('pq_' + pq.id).dir).toEqual([1, 0, 0])
    const portPompe = rendre(iso).rendus[pid].ports[0]
    relierPorts(iso, { c: cid, port: 'pq_' + pq.id }, { c: pid, port: portPompe.id }, rendre(iso).rendus[cid].port('pq_' + pq.id), portPompe)
    const r = rendre(iso)
    expect(Object.values(r.liaisons).length).toBe(1)
    expect(r.rendus[cid].ports.length).toBe(avant)
    expect(r.scene.toSvg({ css: false, fond: false })).toContain('data-piq')
  })
  it('un piquage supprimé emporte ses tuyaux', () => {
    const iso = isoVide()
    const cid = poserSymbole(iso, conteneur, 100, 100, { aimant: 20 })
    const pid = poserSymbole(iso, 'pompe.centrifuge_h', 400, 100, { aimant: 20 })
    const pq = ajouterPiquage(iso.composants[0], { face: 'avant', u: 0.3, v: 0.5, dn: 40 })
    const r0 = rendre(iso)
    relierPorts(iso, { c: cid, port: 'pq_' + pq.id }, { c: pid, port: r0.rendus[pid].ports[0].id }, r0.rendus[cid].port('pq_' + pq.id), r0.rendus[pid].ports[0])
    retirerPiquage(iso, cid, pq.id)
    expect(iso.liaisons.length).toBe(0)
    expect(iso.composants[0].piquages).toBeUndefined()
  })
  it('rétrocompatible : un document sans piquages se rend à l’identique', () => {
    const iso = isoVide()
    poserSymbole(iso, conteneur, 100, 100, { aimant: 20 })
    const a = rendre(iso).scene.toSvg({ css: false, fond: false })
    const relu = normaliserIso(JSON.parse(JSON.stringify(iso)))
    expect(relu.composants[0].piquages).toBeUndefined()
    expect(rendre(relu).scene.toSvg({ css: false, fond: false })).toBe(a)
  })
  it('les piquages électrique et réseau donnent des ports de type elec / signal', () => {
    const iso = isoVide()
    const cid = poserSymbole(iso, conteneur, 100, 100, { aimant: 20 })
    const c = iso.composants[0]
    const e = ajouterPiquage(c, { face: 'gauche', u: 0.5, v: 0.5, genre: 'elec' })
    const n = ajouterPiquage(c, { face: 'avant', u: 0.8, v: 0.5, genre: 'reseau' })
    const r = rendre(iso).rendus[cid]
    expect(r.port('pq_' + e.id).type).toBe('elec')
    expect(r.port('pq_' + n.id).type).toBe('signal')
  })
})

describe('duplication', () => {
  it('incrémente les repères', () => {
    expect(incrementerRepere('Q1')).toBe('Q2')
    expect(incrementerRepere('KM1')).toBe('KM2')
    expect(incrementerRepere('P-101')).toBe('P-102')
    expect(incrementerRepere('Pompe')).toBe('Pompe')
  })
  it('copie params, rot, tilt, piquages, habillage ; pas les variables ; nouvel id', () => {
    const iso = isoVide()
    const a = poserSymbole(iso, 'preset:circulateur_double_vertical', 100, 100, { aimant: 20 })
    const c = iso.composants.find((q) => q.id === a)!
    c.tag = 'P-101'
    c.rot = 90
    c.slots = { marche: { variable: 'v.marche' } }
    c.habillage = { niveau: 'voyant', voyant: { defaut: { variable: 'v.def' } } }
    ajouterPiquage(c, { face: 'avant', u: 0.5, v: 0.5, dn: 25 })
    const [n] = dupliquer(iso, [a], 20)
    const d = iso.composants.find((q) => q.id === n)!
    expect(d.id).not.toBe(a)
    expect(d.params).toEqual(c.params)
    expect(d.tilt).toBe(c.tilt)
    expect(d.rot).toBe(90)
    expect(d.piquages).toEqual(c.piquages)
    expect(d.tag).toBe('P-102')
    expect([d.x, d.y]).toEqual([c.x + 20, c.y + 20])
    expect(d.slots).toBeUndefined()
    expect(d.habillage?.voyant).toBeUndefined()
    const [m] = coller(iso, copier(iso, [a], true), 40, 0)
    expect(iso.composants.find((q) => q.id === m)!.slots).toBeTruthy()
    expect(rendre(iso).scene.toSvg({ css: false, fond: false })).not.toMatch(/NaN/)
  })
  it('les tuyaux internes à la sélection sont dupliqués, pas les autres', () => {
    const iso = isoVide()
    const a = poserSymbole(iso, 'pompe.centrifuge_h', 100, 100, { aimant: 20 })
    const b = poserSymbole(iso, 'pompe.centrifuge_h', 400, 100, { aimant: 20 })
    const e = poserSymbole(iso, 'pompe.centrifuge_h', 400, 300, { aimant: 20 })
    const r = rendre(iso)
    const pa = r.rendus[a].ports[0], pb = r.rendus[b].ports[1], pe = r.rendus[e].ports[0]
    relierPorts(iso, { c: a, port: pa.id }, { c: b, port: pb.id }, pa, pb)
    relierPorts(iso, { c: b, port: r.rendus[b].ports[0].id }, { c: e, port: pe.id }, r.rendus[b].ports[0], pe)
    const nouveaux = dupliquer(iso, [a, b], 20)
    expect(nouveaux.length).toBe(2)
    expect(iso.liaisons.length).toBe(3)
    expect(rendre(iso).scene.toSvg({ css: false, fond: false })).not.toMatch(/NaN/)
  })
})
