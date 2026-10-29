// Bloc « Météo » : vues, contenus au choix et libellés (partagés entre le bloc et son éditeur).
export type WeatherView = 'now' | 'hours' | 'days'
export type WeatherIcons = 'animated' | 'static' | 'none'
export type WeatherField =
  | 'cond'
  | 'feels'
  | 'humidity'
  | 'wind'
  | 'gust'
  | 'rain'
  | 'pressure'
  | 'clouds'
  | 'temp'
  | 'pop'

/** contenus proposés pour chaque vue, dans l'ordre d'affichage */
export const WEATHER_FIELDS: Record<WeatherView, { k: WeatherField; l: string }[]> = {
  now: [
    { k: 'cond', l: 'Ciel' },
    { k: 'feels', l: 'Ressenti' },
    { k: 'humidity', l: 'Humidité' },
    { k: 'wind', l: 'Vent' },
    { k: 'gust', l: 'Rafales' },
    { k: 'rain', l: 'Pluie' },
    { k: 'pressure', l: 'Pression' },
    { k: 'clouds', l: 'Nuages' },
  ],
  hours: [
    { k: 'temp', l: 'Température' },
    { k: 'pop', l: 'Risque de pluie' },
    { k: 'rain', l: 'Pluie (mm)' },
    { k: 'wind', l: 'Vent' },
  ],
  days: [
    { k: 'temp', l: 'Min / max' },
    { k: 'pop', l: 'Risque de pluie' },
    { k: 'rain', l: 'Cumul de pluie' },
    { k: 'wind', l: 'Vent max' },
  ],
}
export const WEATHER_DEFAULT_FIELDS: Record<WeatherView, WeatherField[]> = {
  now: ['cond', 'feels', 'humidity', 'wind', 'rain', 'pressure'],
  hours: ['temp', 'pop'],
  days: ['temp', 'pop', 'rain'],
}
