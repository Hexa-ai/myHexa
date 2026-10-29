// Normalisation des réponses météo (OpenWeatherMap, Open-Meteo) vers un format commun.
// Pur, sans accès réseau : testé dans weather_test.ts.

export type Cond = 'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm'
export interface Current {
  temp: number | null // °C
  feels: number | null // °C
  humidity: number | null // %
  pressure: number | null // hPa (niveau de la mer)
  wind: number | null // km/h
  wind_dir: number | null // °
  gust: number | null // km/h
  rain: number | null // mm/h (pluie + neige)
  clouds: number | null // %
  cond: Cond | null
  is_day: boolean | null
}
export interface ForecastPt {
  t: number // ms
  temp: number | null
  rain: number | null // mm sur le pas
  pop: number | null // probabilité de précipitation %
  wind: number | null // km/h
  clouds: number | null
  cond: Cond | null
}
type J = Record<string, any>
const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null)
const r1 = (x: number | null) => (x == null ? null : Math.round(x * 10) / 10)

/** codes météo OpenWeatherMap (2xx orage, 3xx bruine, 5xx pluie, 6xx neige, 7xx brouillard, 800 clair…) */
export function owmCond(id: unknown): Cond | null {
  const n = num(id)
  if (n == null) return null
  if (n < 300) return 'storm'
  if (n < 500) return 'drizzle'
  if (n < 600) return 'rain'
  if (n < 700) return 'snow'
  if (n < 800) return 'fog'
  if (n === 800) return 'clear'
  if (n <= 802) return 'partly'
  return 'cloudy'
}
/** codes WMO (Open-Meteo) */
export function wmoCond(code: unknown): Cond | null {
  const n = num(code)
  if (n == null) return null
  if (n === 0) return 'clear'
  if (n <= 2) return 'partly'
  if (n === 3) return 'cloudy'
  if (n === 45 || n === 48) return 'fog'
  if (n >= 51 && n <= 57) return 'drizzle'
  if ((n >= 61 && n <= 67) || (n >= 80 && n <= 82)) return 'rain'
  if ((n >= 71 && n <= 77) || n === 85 || n === 86) return 'snow'
  if (n >= 95) return 'storm'
  return null
}

export function fromOwmCurrent(j: J): Current {
  const ms = (x: unknown) => (num(x) == null ? null : r1((x as number) * 3.6))
  const rain = (num(j.rain?.['1h']) ?? 0) + (num(j.snow?.['1h']) ?? 0)
  const now = num(j.dt), sr = num(j.sys?.sunrise), ss = num(j.sys?.sunset)
  return {
    temp: r1(num(j.main?.temp)),
    feels: r1(num(j.main?.feels_like)),
    humidity: num(j.main?.humidity),
    pressure: num(j.main?.sea_level) ?? num(j.main?.pressure),
    wind: ms(j.wind?.speed),
    wind_dir: num(j.wind?.deg),
    gust: ms(j.wind?.gust),
    rain: r1(rain),
    clouds: num(j.clouds?.all),
    cond: owmCond(j.weather?.[0]?.id),
    is_day: now != null && sr != null && ss != null ? now >= sr && now < ss : null,
  }
}
export function fromOwmForecast(j: J): ForecastPt[] {
  return (Array.isArray(j.list) ? j.list : []).map((p: J) => ({
    t: (num(p.dt) ?? 0) * 1000,
    temp: r1(num(p.main?.temp)),
    rain: r1((num(p.rain?.['3h']) ?? 0) + (num(p.snow?.['3h']) ?? 0)),
    pop: num(p.pop) == null ? null : Math.round(p.pop * 100),
    wind: num(p.wind?.speed) == null ? null : r1(p.wind.speed * 3.6),
    clouds: num(p.clouds?.all),
    cond: owmCond(p.weather?.[0]?.id),
  }))
}
export function fromOpenMeteo(j: J): { current: Current; forecast: ForecastPt[] } {
  const c = j.current ?? {}
  const h = j.hourly ?? {}
  // précipitations du relevé courant : cumul des 15 dernières minutes -> mm/h
  const p15 = num(c.precipitation)
  const forecast: ForecastPt[] = (Array.isArray(h.time) ? h.time : []).map((t: number, i: number) => ({
    t: t * 1000,
    temp: r1(num(h.temperature_2m?.[i])),
    rain: r1(num(h.precipitation?.[i])),
    pop: num(h.precipitation_probability?.[i]),
    wind: r1(num(h.wind_speed_10m?.[i])),
    clouds: num(h.cloud_cover?.[i]),
    cond: wmoCond(h.weather_code?.[i]),
  }))
  return {
    current: {
      temp: r1(num(c.temperature_2m)),
      feels: r1(num(c.apparent_temperature)),
      humidity: num(c.relative_humidity_2m),
      pressure: r1(num(c.pressure_msl)),
      wind: r1(num(c.wind_speed_10m)),
      wind_dir: num(c.wind_direction_10m),
      gust: r1(num(c.wind_gusts_10m)),
      rain: p15 == null ? null : r1(p15 * 4),
      clouds: num(c.cloud_cover),
      cond: wmoCond(c.weather_code),
      is_day: num(c.is_day) == null ? null : c.is_day === 1,
    },
    forecast,
  }
}

/** variables versées dans l'historique de chaque box */
export const WEATHER_VARS: { var: string; key: keyof Current; unit: string; description: string }[] = [
  { var: 'Meteo_Temperature', key: 'temp', unit: '°C', description: 'Météo : température extérieure' },
  { var: 'Meteo_Ressenti', key: 'feels', unit: '°C', description: 'Météo : température ressentie' },
  { var: 'Meteo_Humidite', key: 'humidity', unit: '%', description: 'Météo : humidité relative' },
  { var: 'Meteo_Pression', key: 'pressure', unit: 'hPa', description: 'Météo : pression atmosphérique' },
  { var: 'Meteo_Vent', key: 'wind', unit: 'km/h', description: 'Météo : vitesse du vent' },
  { var: 'Meteo_Rafales', key: 'gust', unit: 'km/h', description: 'Météo : rafales' },
  { var: 'Meteo_Pluie', key: 'rain', unit: 'mm/h', description: 'Météo : précipitations' },
  { var: 'Meteo_Nebulosite', key: 'clouds', unit: '%', description: 'Météo : couverture nuageuse' },
]
export function toVars(c: Current) {
  return WEATHER_VARS.map((w) => ({ var: w.var, v: c[w.key] as number | null, unit: w.unit, description: w.description })).filter(
    (x) => typeof x.v === 'number',
  )
}
/** horodatage du relevé : arrondi au quart d'heure (un seul point par quart d'heure, même si relancé) */
export const slot = (ms: number) => new Date(Math.floor(ms / 900e3) * 900e3).toISOString()
