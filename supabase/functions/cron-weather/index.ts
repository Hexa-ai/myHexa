// Edge Function: cron-weather (toutes les 15 min, pg_cron « weather »)
// Relève la météo de chaque site de box (coordonnées arrondies à ~1 km), la garde pour les tuiles
// (weather_sites) et la verse dans l'historique de chaque box du site (weather_ingest).
// Fournisseur : OpenWeatherMap si OPENWEATHER_API_KEY est défini, sinon Open-Meteo
// (offre gratuite = non commerciale : test seulement ; en prod OPEN_METEO_API_KEY ou OpenWeatherMap).
// Prévisions rafraîchies toutes les 3 h. Aucune clé n'est renvoyée ni journalisée.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { fromOpenMeteo, fromOwmCurrent, fromOwmForecast, slot, toVars, type Current, type ForecastPt } from '../_shared/weather.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? ''
const OWM_KEY = Deno.env.get('OPENWEATHER_API_KEY') ?? ''
const OM_KEY = Deno.env.get('OPEN_METEO_API_KEY') ?? ''
const PROVIDER = Deno.env.get('WEATHER_PROVIDER') ?? (OWM_KEY ? 'openweathermap' : 'open-meteo')
const FORECAST_EVERY_MS = 3 * 3600e3

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

async function getJson(url: string) {
  const r = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!r.ok) throw new Error(`HTTP ${r.status}`) // pas l'URL : elle peut porter la clé
  return await r.json()
}

async function fetchSite(lat: number, lon: number, withForecast: boolean): Promise<{ current: Current; forecast: ForecastPt[] | null }> {
  if (PROVIDER === 'openweathermap') {
    if (!OWM_KEY) throw new Error('OPENWEATHER_API_KEY manquante')
    const q = `lat=${lat}&lon=${lon}&units=metric&lang=fr&appid=${encodeURIComponent(OWM_KEY)}`
    const current = fromOwmCurrent(await getJson(`https://api.openweathermap.org/data/2.5/weather?${q}`))
    const forecast = withForecast ? fromOwmForecast(await getJson(`https://api.openweathermap.org/data/2.5/forecast?${q}`)) : null
    return { current, forecast }
  }
  const host = OM_KEY ? 'https://customer-api.open-meteo.com' : 'https://api.open-meteo.com'
  const q = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current:
      'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    wind_speed_unit: 'kmh',
    timeformat: 'unixtime',
    timezone: 'UTC',
  })
  if (withForecast) {
    q.set('hourly', 'temperature_2m,precipitation,precipitation_probability,weather_code,wind_speed_10m,cloud_cover')
    q.set('forecast_days', '5')
  }
  if (OM_KEY) q.set('apikey', OM_KEY)
  const r = fromOpenMeteo(await getJson(`${host}/v1/forecast?${q}`))
  // prévisions : uniquement à partir de maintenant
  const now = Date.now() - 3600e3
  return { current: r.current, forecast: withForecast ? r.forecast.filter((p) => p.t >= now) : null }
}

// reprise du passé récent (Open-Meteo seulement) : points horaires des N derniers jours
async function backfill(key: string, lat: number, lon: number, daysBack: number) {
  const host = OM_KEY ? 'https://customer-api.open-meteo.com' : 'https://api.open-meteo.com'
  const q = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: 'temperature_2m,apparent_temperature,relative_humidity_2m,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation,cloud_cover,weather_code',
    wind_speed_unit: 'kmh',
    timeformat: 'unixtime',
    timezone: 'UTC',
    past_days: String(daysBack),
    forecast_days: '1',
  })
  if (OM_KEY) q.set('apikey', OM_KEY)
  const h = (await getJson(`${host}/v1/forecast?${q}`)).hourly ?? {}
  const now = Date.now()
  const points = (h.time ?? [])
    .map((t: number, i: number) => ({ t: t * 1000, i }))
    .filter((x: { t: number }) => x.t < now)
    .map(({ t, i }: { t: number; i: number }) => ({
      ts: new Date(t).toISOString(),
      vals: toVars({
        temp: h.temperature_2m?.[i] ?? null,
        feels: h.apparent_temperature?.[i] ?? null,
        humidity: h.relative_humidity_2m?.[i] ?? null,
        pressure: h.pressure_msl?.[i] ?? null,
        wind: h.wind_speed_10m?.[i] ?? null,
        wind_dir: h.wind_direction_10m?.[i] ?? null,
        gust: h.wind_gusts_10m?.[i] ?? null,
        rain: h.precipitation?.[i] ?? null,
        clouds: h.cloud_cover?.[i] ?? null,
        cond: null,
        is_day: null,
      }),
    }))
  const { data, error } = await admin.rpc('weather_ingest_series', { p_site: key, p_points: points })
  if (error) throw new Error(error.message)
  return { points: points.length, boxes: data as number }
}

Deno.serve(async (req) => {
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) return new Response('forbidden', { status: 403 })
  const body = await req.json().catch(() => ({}))
  const { data: devs, error } = await admin.rpc('weather_device_sites')
  if (error) return Response.json({ error: error.message }, { status: 500 })
  const sites = new Map<string, { lat: number; lon: number; n: number }>()
  for (const d of devs ?? []) {
    const s = sites.get(d.site_key) ?? { lat: d.lat, lon: d.lon, n: 0 }
    s.n++
    sites.set(d.site_key, s)
  }
  const { data: known } = await admin.from('weather_sites').select('site_key, forecast_at')
  const fAt = new Map((known ?? []).map((k) => [k.site_key as string, k.forecast_at ? Date.parse(k.forecast_at as string) : 0]))
  if (body.backfill_days) {
    if (PROVIDER !== 'open-meteo') return Response.json({ error: 'reprise : Open-Meteo seulement' }, { status: 400 })
    const daysBack = Math.min(14, Math.max(1, Number(body.backfill_days) || 7))
    const res: Record<string, unknown> = {}
    for (const [key, s] of sites) {
      try {
        res[key] = await backfill(key, s.lat, s.lon, daysBack)
      } catch (e) {
        res[key] = { error: (e as Error).message }
      }
    }
    return Response.json({ backfill_days: daysBack, sites: res })
  }
  const ts = slot(Date.now())
  const out = { provider: PROVIDER, sites: sites.size, ok: 0, failed: 0, forecasts: 0, boxes: 0, errors: [] as string[] }
  for (const [key, s] of sites) {
    const withForecast = !!body.forecast || Date.now() - (fAt.get(key) ?? 0) > FORECAST_EVERY_MS - 60e3
    try {
      const { current, forecast } = await fetchSite(s.lat, s.lon, withForecast)
      const row: Record<string, unknown> = { site_key: key, lat: s.lat, lon: s.lon, provider: PROVIDER, current, current_at: new Date().toISOString(), error: null, updated_at: new Date().toISOString() }
      if (forecast) {
        row.forecast = forecast
        row.forecast_at = new Date().toISOString()
        out.forecasts++
      }
      const { error: e1 } = await admin.from('weather_sites').upsert(row)
      if (e1) throw new Error(e1.message)
      const { data: n, error: e2 } = await admin.rpc('weather_ingest', { p_site: key, p_ts: ts, p_vals: toVars(current) })
      if (e2) throw new Error(e2.message)
      out.boxes += (n as number) ?? 0
      out.ok++
    } catch (e) {
      out.failed++
      out.errors.push(`${key}: ${(e as Error).message}`)
      await admin.from('weather_sites').upsert({ site_key: key, lat: s.lat, lon: s.lon, provider: PROVIDER, error: (e as Error).message, updated_at: new Date().toISOString() })
    }
  }
  return Response.json(out)
})
