// Génère des planches de symboles (SVG dans des pages HTML) pour contrôle visuel. Lancé à la main : EXPLO_PLANCHES=dossier pnpm exec vitest run tests/unit/tmp
import { describe, it } from 'vitest'
import fs from 'fs'
import { construire } from '@/lib/synoptic/iso/lib'
import { cssIso } from '@/lib/synoptic/iso/lib'

type C = [string, Record<string, unknown>?, string?]
const PL: Record<string, C[]> = {
  conteneurs: [['conteneur.c10'], ['conteneur.c20', { hc: true, logo: 'HEXA-AI', couleur: 'bleu' }], ['conteneur.c20', { porte: 'ouverte', couleur: 'rouge', logo: 'ACME' }], ['conteneur.c40', { hc: true, logo: 'LOGISTIQUE', couleur: 'vert' }], ['conteneur.c40', { porte: 'ouverte', couleur: 'gris' }], ['conteneur.skid'], ['conteneur.skid', {}, 'marche']],
  vehicules: [['vehicule.camion_conteneur', { logo: 'HEXA-AI' }], ['vehicule.camion_conteneur', { avec_conteneur: false }], ['vehicule.voiture'], ['vehicule.camionnette'], ['vehicule.benne_ordures'], ['vehicule.chariot_elevateur']],
  batiments: [['batiment.cabanon'], ['batiment.maison'], ['batiment.immeuble_ancien'], ['batiment.immeuble_recent'], ['batiment.bureaux'], ['batiment.site_industriel'], ['batiment.entrepot'], ['site.batiment'], ['site.chaufferie'], ['site.poste_transfo']],
  reseau: [['reseau.baie_serveurs'], ['reseau.baie_serveurs', { porte: 'ouverte' }], ['reseau.serveur_tour'], ['reseau.pc_bureau'], ['reseau.ecran'], ['reseau.tv_murale'], ['reseau.pc_portable'], ['reseau.smartphone'], ['reseau.tablette'], ['reseau.routeur'], ['reseau.switch'], ['reseau.ap_wifi'], ['reseau.pare_feu'], ['reseau.antenne_4g'], ['reseau.box_hai_p200', {}, 'marche']],
  armoires: [['armoire.a1p'], ['armoire.a2p', { porte: 'ouverte' }], ['armoire.a3p', {}, 'marche'], ['armoire.a3p', { porte: 'ouverte' }], ['armoire.tgbt'], ['armoire.tgbt', { porte: 'ouverte' }, 'defaut'], ['armoire.coffret_mural'], ['armoire.coffret_mural', { porte: 'ouverte' }]],
  energie: [['energie.pv_toit_maison'], ['energie.pv_toit_industriel'], ['energie.pv_ombriere'], ['energie.pv_sol'], ['energie.eolienne', {}, 'marche'], ['energie.centrale_nucleaire'], ['energie.groupe_electrogene', {}, 'marche'], ['energie.poste_transfo'], ['energie.poste_source'], ['energie.bess'], ['energie.borne_irve'], ['energie.compteur']],
  industrie_ext: [['exterieur.cuve_verticale'], ['exterieur.cuve_horizontale'], ['exterieur.silo'], ['exterieur.citerne'], ['exterieur.tour_refroidissement', {}, 'marche'], ['exterieur.cheminee'], ['exterieur.torchere', {}, 'marche'], ['exterieur.quai_chargement']],
  eau: [['eau.step_bassins'], ['eau.chateau_eau'], ['eau.poste_relevage'], ['site.station_pompage'], ['site.step'], ['site.chateau_eau']],
  site: [['site.batiment'], ['site.bureaux'], ['site.entrepot'], ['site.chaufferie'], ['site.sous_station'], ['site.salle_gtb'], ['site.poste_transfo'], ['site.transfo_exterieur'], ['site.groupe_container'], ['site.local_tgbt'], ['site.parking_irve'], ['site.toiture_pv'], ['site.station_pompage'], ['site.chateau_eau'], ['site.step'], ['site.parking'], ['site.arbres'], ['site.cloture'], ['site.voirie'], ['site.poste_gaz']],
}
describe('planches', () => {
  it('génère', () => {
    const dir = process.env.EXPLO_PLANCHES
    if (!dir) return
    fs.mkdirSync(dir, { recursive: true })
    for (const [nom, liste] of Object.entries(PL)) {
      const cols = nom === 'reseau' || nom === 'site' ? 5 : 4
      const G = nom === 'reseau' ? 70 : nom === 'eau' || nom === 'site' ? 200 : nom === 'energie' || nom === 'batiments' ? 170 : 150
      const composants = liste.map(([type, params, etat], i) => ({ id: 'c' + i, type, x: (i % cols) * G, y: Math.floor(i / cols) * G, z: 0, etat: etat ?? 'arret', params: params ?? {} }))
      const r = construire({ version: 1, composants, liaisons: [] } as never)
      const svg = r.scene.toSvg({ clair: true, css: false, fond: false, marge: 20 }).replace(/ width="[-\d.]+" height="[-\d.]+"/, ' width="1500"')
      fs.writeFileSync(`${dir}/planche_${nom}_light.html`, `<!doctype html><html class="light"><meta charset="utf-8"><style>${cssIso()} body{margin:0;background:#f4f5f7}</style><body><div class="iso-root light" style="width:1500px">${svg}</div></body></html>`)
      fs.writeFileSync(`${dir}/planche_${nom}_light.txt`, liste.map((l, i) => i + ' ' + l[0] + ' ' + JSON.stringify(l[1] ?? {})).join('\n'))
    }
  })
})
