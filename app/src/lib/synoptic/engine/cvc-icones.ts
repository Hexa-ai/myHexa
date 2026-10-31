// Pictogrammes (24×24, trait seul) des modules CVC proposés par la palette 2D, du Spotlight et de l'explorateur.
// Même langage que les autres pictogrammes de la palette : un trait, aucune couleur (le thème s'en charge).
const LOUVRES = '<path d="M3 6v12M3 8l3-2M3 12l3-2M3 16l3-2"/>'
const LOUVRES_D = '<path d="M21 6v12M21 8l-3-2M21 12l-3-2M21 16l-3-2"/>'
const BATTERIE = '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M8.5 6.5l7 2.5-7 2.5 7 2.5-7 2.5"/>'

export const ICONES_MODULES: Record<string, string> = {
  // ── modules de CTA
  'cta:air_neuf': LOUVRES + '<path d="M9 12h12M17 8l4 4-4 4"/>',
  'cta:reprise': LOUVRES_D + '<path d="M3 12h12M7 8l-4 4 4 4"/>',
  'cta:soufflage': '<path d="M2 12h11M9 8l4 4-4 4"/><path d="M16 6l5 3M16 12h5M16 18l5-3"/>',
  'cta:rejet': LOUVRES_D + '<path d="M3 12h12M11 8l4 4-4 4"/>',
  'cta:registre': '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M7.5 7l9 2M7.5 12h9M7.5 17l9-2"/>',
  'cta:filtre_plan': '<rect x="9" y="3" width="6" height="18"/><path d="M9 8l6-3M9 13l6-3M9 18l6-3"/>',
  'cta:filtre_poches': '<path d="M3 3v18"/><path d="M3 4l16 4-16 4M3 12l16 4-16 4"/>',
  'cta:batterie_chaude': BATTERIE + '<path d="M20 8c1.5 1.5-1.5 2.5 0 4"/>',
  'cta:batterie_froide': BATTERIE + '<path d="M20.5 8v6M18 9.5l5 3M23 9.5l-5 3"/>',
  'cta:batterie_elec': '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M13 6l-4 6h6l-4 6"/>',
  'cta:humidificateur': '<path d="M8 3c-3 4-3 6 0 6s3-2 0-6zM16 9c-3 4-3 6 0 6s3-2 0-6zM8 15c-2.5 3-2.5 4.5 0 4.5s2.5-1.5 0-4.5z"/>',
  'cta:recup_plaques': '<path d="M12 2l10 10-10 10L2 12z"/><path d="M7 7l10 10M17 7L7 17"/>',
  'cta:recup_roue': '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/>',
  'cta:caisson_melange': '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18M6 8l6 4M18 16l-6-4"/>',
  'cta:ventilateur': '<circle cx="12" cy="12" r="8.5"/><path d="M12 4.5c3 0 3 5 0 7.5M19.5 12c0 3-5 3-7.5 0M12 19.5c-3 0-3-5 0-7.5M4.5 12c0-3 5-3 7.5 0"/>',
  'cta:plug_fan': '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 10c1-1 2-3 1.5-5M14 12c1.5 0 3.5 1 4.5 2.5M12 14c-1 1-1.5 3-.5 5M10 12c-1.5 0-3.5-1-4.5-2.5"/>',
  'cta:piege_son': '<rect x="3" y="4" width="4" height="16" rx="1"/><rect x="10" y="4" width="4" height="16" rx="1"/><rect x="17" y="4" width="4" height="16" rx="1"/>',
  'cta:sonde': '<path d="M12 3v10"/><circle cx="12" cy="16.5" r="3.5"/>',
  'cta:gaine': '<path d="M2 8h20M2 16h20"/>',
  // ── départs hydrauliques
  'hyd:rangee': '<path d="M3 7h12M3 17h12M15 7l6 5-6 5"/>',
  'hyd:vanne_3v': '<path d="M3 7l8 5-8 5zM21 7l-8 5 8 5z"/><path d="M12 12l-4 8h8z"/>',
  'hyd:vanne_2v': '<path d="M4 9l8 6-8 6zM20 9l-8 6 8 6z"/><path d="M12 15V6M8 6h8"/>',
  'hyd:pompe': '<circle cx="12" cy="12" r="8"/><path d="M10 8l6 4-6 4z"/>',
  'hyd:pompe_double': '<circle cx="7" cy="12" r="5"/><circle cx="17" cy="12" r="5"/><path d="M5.5 10l3 2-3 2zM15.5 10l3 2-3 2z"/>',
  'hyd:debitmetre': '<rect x="5" y="12" width="14" height="8" rx="1"/><path d="M3 16h2M19 16h2M12 12V9"/><rect x="8" y="3.5" width="8" height="5.5" rx="1.5"/>',
  'hyd:compteur': '<circle cx="12" cy="12" r="8"/><path d="M8 14h8M9 10h6"/>',
  'hyd:sonde_t_aller': '<path d="M5 3h14"/><path d="M12 20v-4"/><circle cx="12" cy="10" r="4.5"/><path d="M12 7.5v5"/>',
  'hyd:sonde_t_retour': '<path d="M5 21h14"/><path d="M12 4v4"/><circle cx="12" cy="14" r="4.5"/><path d="M12 11.5v5"/>',
  'hyd:isolement': '<path d="M4 3l6 4-6 4zM20 3l-6 4 6 4z"/><path d="M4 13l6 4-6 4zM20 13l-6 4 6 4z"/>',
  'hyd:clapet': '<circle cx="12" cy="12" r="8"/><path d="M9 8l6 4-6 4zM17 7v10"/>',
  'hyd:filtre': '<rect x="6" y="3" width="12" height="18" rx="3"/><path d="M6 17L18 7M6 12l8-6M10 21l8-6"/>',
  'hyd:purgeur': '<path d="M12 21v-6"/><rect x="8" y="5" width="8" height="10" rx="3"/><path d="M12 5V2M10 2h4"/>',
  'hyd:emetteur': '<rect x="4" y="7" width="16" height="10" rx="2"/><path d="M8 7v10M12 7v10M16 7v10M7 3v4M17 17v4"/>',
  'hyd:pot_boue': '<circle cx="12" cy="9" r="5"/><path d="M12 14v3M8 17h8l-1 4H9z"/>',
  'hyd:vase': '<circle cx="12" cy="11" r="7"/><path d="M12 18v4M5 11a7 7 0 0014 0"/>',
  'hyd:bouteille': '<rect x="8" y="3" width="8" height="18" rx="3"/><path d="M3 8h5M16 8h5M3 16h5M16 16h5"/>',
  'hyd:echangeur': '<rect x="2" y="6" width="20" height="12" rx="5"/><path d="M5 14l3-4 3 4 3-4 3 4"/>',
  'hyd:ballon_ecs': '<rect x="6" y="3" width="12" height="18" rx="4"/><path d="M6 9h8a3 3 0 010 6H6"/>',
  'hyd:chaudiere': '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M12 8c2 3 3 4 3 6a3 3 0 01-6 0c0-1 1-2 1.5-3"/>',
  'hyd:pac': '<rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="10" cy="12" r="4"/><path d="M16 8v8"/>',
  'hyd:depart': '<path d="M3 8h12M11 4l4 4-4 4"/><path d="M21 16H9M13 12l-4 4 4 4"/>',
  'hyd:arrivee': '<path d="M21 8H9M13 4L9 8l4 4"/><path d="M3 16h12M11 12l4 4-4 4"/>',
  'hyd:tuyau': '<path d="M2 9h20M2 15h20"/>',
}
