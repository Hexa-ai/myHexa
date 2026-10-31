// Thème : CSS autonome (clair + sombre). Toutes les couleurs passent par des variables CSS.
// Les variables du portail (--background, --foreground, --muted-foreground, --border, --signal, --run, --offline,
// --warn, --fluid, --eau-chaude-aller, …) sont lues si elles existent ; sinon valeurs par défaut du thème.
// Thème clair = classe "light" sur <html> ou sur le conteneur (comme le portail), sinon sombre.

interface Fl { id: string; v: string; dark: string; light: string }
export const FLUIDES: Fl[] = [
  { id: 'eau', v: '--fluid', dark: '#5aa9d6', light: '#3b8fc0' },
  { id: 'eau_brute', v: '--eau-brute', dark: '#7f9eab', light: '#6b8b98' },
  { id: 'eau_decantee', v: '--eau-decantee', dark: '#72bddb', light: '#4aa3c9' },
  { id: 'eau_traitee', v: '--eau-traitee', dark: '#3cc6b2', light: '#1fa894' },
  { id: 'eau_chaude_aller', v: '--eau-chaude-aller', dark: '#ff8a5c', light: '#e0623a' },
  { id: 'eau_chaude_retour', v: '--eau-chaude-retour', dark: '#8f9bff', light: '#5a63c8' },
  { id: 'eau_glacee', v: '--eau-glacee', dark: '#57d0f5', light: '#22a8de' },
  { id: 'eau_glycolee', v: '--eau-glycolee', dark: '#a98ff0', light: '#7d62d6' },
  { id: 'air_neuf', v: '--air-neuf', dark: '#7fd28d', light: '#4aa764' },
  { id: 'air_souffle', v: '--air-souffle', dark: '#63c9dc', light: '#2fa6bd' },
  { id: 'air_repris', v: '--air-repris', dark: '#e9b758', light: '#c98f25' },
  { id: 'air_rejete', v: '--air-rejete', dark: '#a89d94', light: '#8d8279' },
  { id: 'gaz', v: '--gaz', dark: '#ffd24a', light: '#d9a800' },
  { id: 'vapeur', v: '--vapeur', dark: '#cdd6dd', light: '#a9b5be' },
  { id: 'boues', v: '--boues', dark: '#a08060', light: '#82643f' },
  { id: 'reactif', v: '--reactif', dark: '#c97ae8', light: '#a64fcf' },
  { id: 'polymere', v: '--polymere', dark: '#f07aa8', light: '#cc4a7f' },
  { id: 'condensat', v: '--condensat', dark: '#7cc4c4', light: '#4a9a9a' },
  { id: 'fumees', v: '--fumees', dark: '#808a91', light: '#656f76' },
  { id: 'air_comprime', v: '--air-comprime', dark: '#9db4f0', light: '#6f8ce0' },
  { id: 'ecs', v: '--ecs', dark: '#f27a7a', light: '#d94b4b' },
  { id: 'neutre', v: '--iso-neutre', dark: '#8795a1', light: '#7b8890' },
]

const vars = (t: 'dark' | 'light'): string => {
  const d = t === 'dark'
  const p = (name: string, dark: string, light: string) => `--i-${name}:var(--${name},${d ? dark : light});`
  return [
    p('background', '#0b0f13', '#f3f4f1').replace('--i-background', '--i-bg'),
    `--i-fg:var(--foreground,${d ? '#e6edf3' : '#15191d'});`,
    `--i-mut:var(--muted-foreground,${d ? '#8d9aa6' : '#6b7680'});`,
    `--i-bd:var(--border,${d ? '#2a3745' : '#c9d0d4'});`,
    p('signal', '#00d4aa', '#00a885'), p('run', '#46c46a', '#2f9e52'), p('offline', '#ff6b6b', '#e04848'), p('warn', '#ffb347', '#e08a00'),
    `--i-body:${d ? '#3a4854' : '#f7f7f4'};--i-metal:${d ? '#566571' : '#dde1e1'};--i-dark:${d ? '#232c34' : '#8b969d'};--i-conc:${d ? '#404b54' : '#e3e2db'};--i-ink:${d ? '#0d1217' : '#27323a'};--i-white:${d ? '#e9eff3' : '#ffffff'};`,
    `--i-edge:${d ? '#92a2af' : '#56636c'};--i-edge2:${d ? '#5b6a76' : '#9aa6ae'};--i-sw:1px;`,
    `--i-lift:#fff;--i-lp:${d ? '11%' : '55%'};--i-shade:${d ? '#000' : '#26343f'};--i-sp:${d ? '30%' : '17%'};`,
    `--i-glass:${d ? 'rgba(130,185,215,.16)' : 'rgba(80,150,190,.14)'};--i-dot:${d ? '#27333d' : '#cdd3d1'};--i-off:${d ? '#52606c' : '#adb7be'};--i-flow:#fff;`,
    ...FLUIDES.map((fl) => `--i-${fl.id}:var(${fl.v},${d ? fl.dark : fl.light});`),
  ].join('')
}

export function cssIso(): string {
  const fluides = FLUIDES.map((fl) => `.fl-${fl.id}{--cf:var(--i-${fl.id});--c:var(--cf)}.ga-${fl.id}{--cf:var(--i-${fl.id});--c:color-mix(in srgb,var(--i-body) 66%,var(--cf) 34%)}`).join('')
  return `
.iso-root{${vars('dark')}font-family:"JetBrains Mono",ui-monospace,Menlo,Consolas,monospace;color:var(--i-fg)}
.light .iso-root,.iso-root.light{${vars('light')}}
.iso-root .gl{opacity:.42}
.iso-root .mb{--c:var(--i-body)}.iso-root .mm{--c:var(--i-metal)}.iso-root .md{--c:var(--i-dark)}.iso-root .mc{--c:var(--i-conc)}.iso-root .mk{--c:var(--i-ink)}
.iso-root .ma{--c:var(--i-signal)}.iso-root .mr{--c:var(--i-offline)}.iso-root .mw{--c:var(--i-warn)}.iso-root .mg{--c:var(--i-run)}
${fluides.replace(/\.(fl|ga)-/g, '.iso-root .$1-')}
.iso-root path,.iso-root circle,.iso-root rect,.iso-root polygon,.iso-root line,.iso-root ellipse{vector-effect:non-scaling-stroke}
.iso-root .t{fill:color-mix(in srgb,var(--c),var(--i-lift) var(--i-lp))}
.iso-root .l,.iso-root .l0{fill:var(--c)}
.iso-root .r,.iso-root .r0{fill:color-mix(in srgb,var(--c),var(--i-shade) var(--i-sp))}
.iso-root .in{fill:color-mix(in srgb,var(--c),var(--i-shade) calc(var(--i-sp) * 1.7))}
.iso-root .t,.iso-root .l,.iso-root .r,.iso-root .in{stroke:var(--i-edge);stroke-width:var(--i-sw);stroke-linejoin:round}
.iso-root .l0,.iso-root .r0{stroke:none}
.iso-root .ed{fill:none;stroke:var(--i-edge);stroke-width:var(--i-sw);stroke-linejoin:round;stroke-linecap:round}
.iso-root .ed2{fill:none;stroke:var(--i-edge2);stroke-width:var(--i-sw);stroke-linejoin:round;stroke-linecap:round}
.iso-root .ed3{fill:none;stroke:var(--i-edge);stroke-width:calc(var(--i-sw) * 1.8);stroke-linecap:round;stroke-linejoin:round}
.iso-root .fm,.iso-root .fb,.iso-root .fd,.iso-root .fk,.iso-root .fw,.iso-root .fa,.iso-root .fg,.iso-root .fc,.iso-root .fl,.iso-root .fr,.iso-root .fo,.iso-root .fn,.iso-root .fy{stroke:var(--i-edge);stroke-width:var(--i-sw);stroke-linejoin:round}
.iso-root .fm{fill:var(--i-metal)}.iso-root .fb{fill:var(--i-body)}.iso-root .fd{fill:var(--i-dark)}.iso-root .fk{fill:var(--i-ink)}.iso-root .fw{fill:var(--i-white)}
.iso-root .fa{fill:var(--i-signal)}.iso-root .fg{fill:var(--i-glass)}.iso-root .fc{fill:var(--i-conc)}.iso-root .fl{fill:var(--c)}
.iso-root .fr{fill:var(--i-offline)}.iso-root .fo{fill:var(--i-warn)}.iso-root .fn{fill:var(--i-run)}.iso-root .fy{fill:none}
.iso-root .ns{stroke:none}
.iso-root .tkr{fill:none;stroke:var(--i-offline);stroke-width:calc(var(--i-sw) * 1.8);stroke-linecap:round}.iso-root .tkw{fill:none;stroke:var(--i-warn);stroke-width:calc(var(--i-sw) * 1.8);stroke-linecap:round}
.iso-root .stk{stroke:var(--i-st,var(--i-off));fill:none;stroke-width:calc(var(--i-sw) * 2.6);stroke-linecap:round}
.iso-root .bolt{fill:var(--i-edge);stroke:none}
.iso-root .sig{stroke:var(--i-signal);fill:none;stroke-width:calc(var(--i-sw) * 1.6);stroke-linecap:round}
.iso-root .led{fill:var(--i-st,var(--i-off));stroke:var(--i-edge);stroke-width:.6}
.iso-root .led.l-run{fill:var(--i-run)}.iso-root .led.l-sec{fill:var(--i-warn)}.iso-root .led.l-def{fill:var(--i-offline)}.iso-root .led.l-off{fill:var(--i-off)}
.iso-root .s-marche,.iso-root .s-modulant{--i-st:var(--i-run)}
.iso-root .s-defaut{--i-st:var(--i-offline)}.iso-root .s-alarme{--i-st:var(--i-warn)}
.iso-root .s-ouvert{--i-st:var(--i-run)}.iso-root .s-ferme{--i-st:var(--i-off)}
.iso-root .s-consigne,.iso-root .s-maintenance{--i-st:var(--i-signal)}
.iso-root .st{fill:var(--i-st,var(--i-off));stroke:none}
.iso-root .gm{fill:none;stroke:none}
.iso-root .s-marche .gm,.iso-root .s-modulant .gm{fill:color-mix(in srgb,var(--i-run) 13%,transparent);stroke:var(--i-run);stroke-opacity:.55;stroke-dasharray:2 3}
.iso-root .s-defaut .gm{fill:color-mix(in srgb,var(--i-offline) 16%,transparent);stroke:var(--i-offline);stroke-opacity:.8;stroke-dasharray:2 3}
.iso-root .s-alarme .gm{fill:color-mix(in srgb,var(--i-warn) 16%,transparent);stroke:var(--i-warn);stroke-opacity:.8;stroke-dasharray:2 3}
.iso-root .s-consigne .gm,.iso-root .s-maintenance .gm{fill:color-mix(in srgb,var(--i-signal) 10%,transparent);stroke:var(--i-signal);stroke-opacity:.6;stroke-dasharray:2 3}
.iso-root .s-inconnu{opacity:.5}
.iso-root .s-inconnu .t,.iso-root .s-inconnu .l,.iso-root .s-inconnu .r,.iso-root .s-inconnu .ed{stroke-dasharray:3 2.5}
.iso-root .s-inconnu .gm{fill:none;stroke:var(--i-mut);stroke-dasharray:2 3}
/* badges */
.iso-root .bdg-def circle{fill:var(--i-offline)}
.iso-root .bdg .ex{stroke:#fff;stroke-width:1.9;fill:none;stroke-linecap:round}
.iso-root .bdg-alm>path:not(.ex){fill:var(--i-warn);stroke:var(--i-bg);stroke-width:.8;stroke-linejoin:round}.iso-root .bdg-alm .ex{stroke:#2a1d00}
.iso-root .bdg-unk circle{fill:var(--i-bg);stroke:var(--i-mut);stroke-dasharray:2 2}.iso-root .bdg-unk .ex{stroke:var(--i-mut)}
.iso-root .bdg-lock rect{fill:var(--i-signal)}.iso-root .bdg-lock .sh{stroke:var(--i-signal);fill:none;stroke-width:1.7}
.iso-root .bdg-man rect{fill:var(--i-bg);stroke:var(--i-signal);stroke-width:1.2}
.iso-root .bdg-man text{font:700 9px "JetBrains Mono",ui-monospace,monospace;fill:var(--i-signal);text-anchor:middle}
.iso-root .bdg-def{animation:iso-pulse 1.6s ease-in-out infinite}
/* animations */
@keyframes iso-spin{to{transform:rotate(360deg)}}
@keyframes iso-flow{to{stroke-dashoffset:-14}}
@keyframes iso-pulse{50%{opacity:.55}}
@keyframes iso-flame{0%,100%{transform:scale(1,1)}50%{transform:scale(.88,1.12)}}
.iso-root .spin{transform-box:view-box;transform-origin:0 0}
.iso-root .s-marche .spin,.iso-root .s-modulant .spin{animation:iso-spin 1.2s linear infinite}
.iso-root .spin.slow{animation-duration:6s}
.iso-root .flame{display:none;transform-box:fill-box;transform-origin:50% 100%}
.iso-root .s-marche .flame,.iso-root .s-modulant .flame{display:block;animation:iso-flame .5s ease-in-out infinite}
.iso-root .flow{fill:none;stroke:var(--i-flow);stroke-opacity:.9;stroke-width:2;stroke-linecap:butt;stroke-dasharray:4 10;animation:iso-flow 1.1s linear infinite;pointer-events:none}
.iso-root .ptp{fill:var(--i-signal);stroke:var(--i-bg);stroke-width:1}.iso-root .ptl{fill:none;stroke:var(--i-signal);stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round}
.iso-root .ca{--c:color-mix(in srgb,var(--i-metal) 72%,var(--cf,#888) 28%)}
.iso-root .flow.air{stroke-dasharray:2 12;stroke-opacity:.7}
.iso-root .arr{fill:var(--i-flow);stroke:none;opacity:.95}
/* flux internes (CTA) : visibles seulement en marche */
.iso-root .cflow,.iso-root .heat{display:none}
.iso-root .inv .flow{animation-direction:reverse}
.iso-root .s-marche .cflow,.iso-root .s-modulant .cflow,.iso-root .s-marche .heat,.iso-root .s-modulant .heat{display:inline}
@media (prefers-reduced-motion:reduce){.iso-root .spin,.iso-root .flow,.iso-root .flame,.iso-root .bdg-def{animation:none!important}}
/* scène */
.iso-root .sol{stroke:var(--i-dot);stroke-width:2.6;stroke-linecap:round;fill:none}
.iso-root .lbl .box{fill:var(--i-bg);stroke:var(--i-bd);stroke-width:1}
.iso-root .lbl .n{fill:var(--i-mut);font-size:9.5px;letter-spacing:.09em;text-transform:uppercase}
.iso-root .lbl .v{fill:var(--i-fg);font-size:14px}
.iso-root .lbl .u{fill:var(--i-mut);font-size:10px}
.iso-root .lbl .lead{stroke:var(--i-mut);stroke-width:1;stroke-dasharray:2 3;fill:none}
.iso-root .ghost{fill:none;stroke:var(--i-fg);stroke-opacity:.55;stroke-dasharray:2.4 2.4;stroke-linecap:round}
.iso-root .lbl .dot{fill:var(--i-mut)}
.iso-root .lbl.chip .v{font-size:11px}.iso-root .lbl.chip .n{fill:var(--i-mut);font-size:9px;letter-spacing:.06em;text-transform:uppercase}.iso-root .lbl.chip .u{font-size:9px}
.iso-root .lbl.defaut .box{stroke:var(--i-offline)}.iso-root .lbl.defaut .v{fill:var(--i-offline)}
.iso-root .lbl.alarme .box{stroke:var(--i-warn)}.iso-root .lbl.alarme .v{fill:var(--i-warn)}
.iso-root .lbl.marche .box{stroke:var(--i-run)}
.iso-root .tag .box{fill:var(--i-fg);stroke:none}.iso-root .tag text{fill:var(--i-bg);font-size:9.5px;font-weight:700;text-anchor:middle}
.iso-root .ttl{fill:var(--i-fg);font-size:17px;letter-spacing:.02em}.iso-root .sub{fill:var(--i-mut);font-size:10px;letter-spacing:.2em;text-transform:uppercase}
.iso-root .bg{fill:var(--i-bg)}
.iso-root .cap{fill:var(--i-mut);font-size:10px;letter-spacing:.06em}
.iso-root .legend .k{fill:var(--i-fg);font-size:10px}
`
}
