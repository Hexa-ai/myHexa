// Premiers segments d'URL qui ne peuvent JAMAIS être un identifiant d'entreprise (/<slug> = page de connexion de l'entreprise).
// Même liste que la contrainte companies_slug_valid (migration 20261031150000_co_branding.sql).
export const RESERVED_SLUGS = new Set([
  'login', 'auth', 'intervention', 'interventions', 'admin', 'devices', 'dashboards', 'dashboard', 'map',
  'alarms', 'projects', 'recipients', 'notifications', 'updates', 'staff', 'alarm-recipients', 'assets',
  'api', 'ingress', 'provision', 'forgot-password', 'reset-password', 'magic-link', 'callback', 'accept',
  'home', 'index', 'sw', 'manifest', 'favicon', 'public', 'static', 'logout', 'signup', 'register', 'www',
  'my', 'app', 'hexa', 'hexa-ai', 'myhexa', 'partage', 'share', 'support', 'docs', 'status', 'null', 'undefined',
])
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/
export const isReservedSlug = (s: string) => RESERVED_SLUGS.has(s.toLowerCase())
export const isValidSlug = (s: string) => SLUG_RE.test(s) && !isReservedSlug(s)
