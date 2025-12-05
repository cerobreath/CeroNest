// src/services/weatherApi.ts
import {WeatherDayData, WeatherLocation} from '../types';
import {hasInternet} from './network';
import {persistWeatherDay} from './nativeStats';

const APP_CONTACT =
  'https://github.com/cerobreath/CeroNest; contact: cerobreath@gmail.com';
const USER_AGENT = `CeroNest/0.1 (${APP_CONTACT})`;
const OSM_BASE = 'https://nominatim.openstreetmap.org';

export async function fetchCurrentWeather(
  location: WeatherLocation,
): Promise<WeatherDayData> {
  if (!(await hasInternet())) {
    throw new Error('Немає підключення до Інтернету');
  }

  const lat = location.lat.toFixed(4);
  const lon = location.lon.toFixed(4);

  const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `HTTP ${res.status}: ${res.statusText || 'Unknown error'}\n${text}`,
    );
  }

  const json = await res.json();
  const timeseries = json?.properties?.timeseries;
  if (!Array.isArray(timeseries) || timeseries.length === 0) {
    throw new Error(
      'Відповідь API не містить часових рядів (timeseries).',
    );
  }

  const first = timeseries[0];
  const details = first?.data?.instant?.details ?? {};
  const next1h = first?.data?.next_1_hours?.summary;
  const next6h = first?.data?.next_6_hours?.summary;

  const hourly = timeseries.map((entry: any) => {
    const d = entry?.data?.instant?.details ?? {};
    const n1h = entry?.data?.next_1_hours?.summary;
    const n6h = entry?.data?.next_6_hours?.summary;
    return {
      time: entry.time,
      temperature: d.air_temperature,
      humidity: d.relative_humidity,
      windSpeed: d.wind_speed,
      symbolCode: n1h?.symbol_code || n6h?.symbol_code,
    };
  });

  const result: WeatherDayData = {
    time: first.time,
    temperature: details.air_temperature,
    humidity: details.relative_humidity,
    windSpeed: details.wind_speed,
    symbolCode: next1h?.symbol_code || next6h?.symbol_code,
    hourly,
  };

  try {
    await persistWeatherDay(location.id, result);
  } catch (e) {
    console.warn('[weatherApi] failed to persist weather', e);
  }

  return result;
}

export async function searchWeatherLocations(
  query: string,
): Promise<WeatherLocation[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  if (!(await hasInternet())) {
    throw new Error('Немає підключення до Інтернету');
  }

  const url = `${OSM_BASE}/search?format=json&addressdetails=1&limit=10&q=${encodeURIComponent(
    trimmed,
  )}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': USER_AGENT,
      Referer: 'https://github.com/cerobreath/CeroNest',
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `OSM HTTP ${res.status}: ${res.statusText || 'Unknown error'}\n${text}`,
    );
  }

  const json = await res.json();
  if (!Array.isArray(json)) {
    return [];
  }

  return json.map((item: any) => {
    const address = item.address ?? {};
    const city =
      address.city ||
      address.town ||
      address.village ||
      address.hamlet ||
      address.municipality ||
      '';
    const country = address.country || '';
    const displayName: string = item.display_name ?? '';

    const name = city || displayName.split(',')[0] || 'Unknown';
    const lat = parseFloat(item.lat ?? '0');
    const lon = parseFloat(item.lon ?? '0');
    const id =
      item.place_id != null
        ? String(item.place_id)
        : `${name}-${lat}-${lon}`;

    return {
      id,
      name,
      country,
      lat: Number.isFinite(lat) ? lat : 0,
      lon: Number.isFinite(lon) ? lon : 0,
    };
  });
}