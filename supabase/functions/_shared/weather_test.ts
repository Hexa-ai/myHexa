import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { fromOpenMeteo, fromOwmCurrent, fromOwmForecast, owmCond, slot, toVars, wmoCond } from './weather.ts'

Deno.test('codes météo', () => {
  assertEquals([owmCond(211), owmCond(301), owmCond(500), owmCond(601), owmCond(741), owmCond(800), owmCond(802), owmCond(804)], ['storm', 'drizzle', 'rain', 'snow', 'fog', 'clear', 'partly', 'cloudy'])
  assertEquals([wmoCond(0), wmoCond(2), wmoCond(3), wmoCond(45), wmoCond(53), wmoCond(81), wmoCond(73), wmoCond(95), wmoCond(null)], ['clear', 'partly', 'cloudy', 'fog', 'drizzle', 'rain', 'snow', 'storm', null])
})

Deno.test('OpenWeatherMap : relevé, unités (m/s -> km/h), pluie + neige', () => {
  const c = fromOwmCurrent({ dt: 1000, sys: { sunrise: 500, sunset: 2000 }, main: { temp: 12.34, feels_like: 10.06, humidity: 81, pressure: 1015 }, wind: { speed: 5, deg: 230, gust: 10 }, clouds: { all: 75 }, rain: { '1h': 0.4 }, snow: { '1h': 0.1 }, weather: [{ id: 500 }] })
  assertEquals(c, { temp: 12.3, feels: 10.1, humidity: 81, pressure: 1015, wind: 18, wind_dir: 230, gust: 36, rain: 0.5, clouds: 75, cond: 'rain', is_day: true })
  const f = fromOwmForecast({ list: [{ dt: 10, main: { temp: 8 }, pop: 0.35, wind: { speed: 2 }, clouds: { all: 10 }, weather: [{ id: 800 }] }] })
  assertEquals(f, [{ t: 10000, temp: 8, rain: 0, pop: 35, wind: 7.2, clouds: 10, cond: 'clear' }])
})

Deno.test('Open-Meteo : relevé, pluie 15 min -> mm/h, prévisions horaires', () => {
  const r = fromOpenMeteo({
    current: { temperature_2m: 9.8, apparent_temperature: 7, relative_humidity_2m: 90, pressure_msl: 1012.3, wind_speed_10m: 14.2, wind_direction_10m: 200, wind_gusts_10m: 30, precipitation: 0.2, cloud_cover: 100, weather_code: 61, is_day: 0 },
    hourly: { time: [3600], temperature_2m: [9], precipitation: [0.6], precipitation_probability: [70], weather_code: [3], wind_speed_10m: [12], cloud_cover: [95] },
  })
  assertEquals(r.current.rain, 0.8)
  assertEquals(r.current.is_day, false)
  assertEquals(r.current.cond, 'rain')
  assertEquals(r.forecast, [{ t: 3600000, temp: 9, rain: 0.6, pop: 70, wind: 12, clouds: 95, cond: 'cloudy' }])
})

Deno.test('variables historiques : valeurs absentes ignorées, quart d’heure', () => {
  const v = toVars({ temp: 5, feels: null, humidity: 70, pressure: null, wind: 3, wind_dir: 0, gust: null, rain: 0, clouds: null, cond: null, is_day: null })
  assertEquals(v.map((x) => x.var), ['Meteo_Temperature', 'Meteo_Humidite', 'Meteo_Vent', 'Meteo_Pluie'])
  assertEquals(slot(Date.parse('2026-10-30T09:44:59Z')), '2026-10-30T09:30:00.000Z')
})
