// src/services/powerScheduleApi.ts
import { PowerScheduleItem } from '../types';

const BASE_URL = 'https://chernihivoblenergo.com.ua';

export type DepartmentOption = {
  value: string;
  label: string;
};

export type SimpleOption = {
  id: string;
  name: string;
};

type RawOutage = {
  city: string;
  street: string;
  houses: string;
  start: string;
  end: string;
  createdAt: string;
};

export type PowerConsumerKind = 'household' | 'business';

export type PowerScheduleQuery = {
  consumerKind: PowerConsumerKind;
  cityId: string;
  streetId?: string;
  objectId?: string;
  house?: string;
};

/**
 * Підрозділи (райони / РЕМ)
 */
export async function fetchDepartments(): Promise<DepartmentOption[]> {
  const res = await fetch(`${BASE_URL}/getPower_outages`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} при завантаженні підрозділів`);
  }

  const data = await res.json();
  if (data.status === 'err' || !data.depart) {
    throw new Error('Не вдалося отримати список підрозділів');
  }

  const html: string = data.depart;
  const options: DepartmentOption[] = [];
  const regex = /<option\s+value="([^"]*)">(.*?)<\/option>/g;
  let m: RegExpExecArray | null;

  while ((m = regex.exec(html)) !== null) {
    const value = m[1];
    const label = m[2].trim();
    if (value !== 'null') {
      options.push({ value, label });
    }
  }

  if (options.length === 0) {
    throw new Error('Список підрозділів порожній');
  }

  return options;
}

/**
 * Пошук міст за підрозділом (city_rem)
 */
export async function fetchCities(
  departId: string,
  query: string,
): Promise<SimpleOption[]> {
  if (!departId || !query || query.length < 2) {
    return [];
  }

  const url = `${BASE_URL}/api/list_city_str/?nq=city_rem&q=${encodeURIComponent(
    query,
  )}&r=${encodeURIComponent(departId)}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} при пошуку міст`);
  }

  const data = await res.json();
  if (!data.list) return [];

  return (data.list as [string, string, string?][])
    .map(([id, name]) => ({ id, name }))
    .filter(o => o.id !== 'null');
}

/**
 * Пошук вулиць (street) — для побутових
 */
export async function fetchStreets(
  cityId: string,
  query: string,
): Promise<SimpleOption[]> {
  if (!cityId || !query || query.length < 2) return [];

  const url = `${BASE_URL}/api/list_city_str/?nq=street&q=${encodeURIComponent(
    query,
  )}&c=${encodeURIComponent(cityId)}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} при пошуку вулиць`);
  }

  const data = await res.json();
  if (!data.list) return [];

  return (data.list as [string, string][])
    .map(([id, name]) => ({ id, name }))
    .filter(o => o.id !== 'null');
}

/**
 * Пошук юридичних обʼєктів (obj) — для юридичних
 */
export async function fetchObjects(
  cityId: string,
  query: string,
): Promise<SimpleOption[]> {
  if (!cityId || !query || query.length < 2) return [];

  const url = `${BASE_URL}/api/list_city_str/?nq=obj&q=${encodeURIComponent(
    query,
  )}&c=${encodeURIComponent(cityId)}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} при пошуку юридичних осіб`);
  }

  const data = await res.json();
  if (!data.list) return [];

  return (data.list as [string, string][])
    .map(([id, name]) => ({ id, name }))
    .filter(o => o.id !== 'null');
}

/**
 *    якщо consumerKind = household → вулиці
 *    якщо consumerKind = business → юрособи
 */
export async function fetchAddressOptions(
  consumerKind: PowerConsumerKind,
  cityId: string,
  query: string,
): Promise<SimpleOption[]> {
  if (consumerKind === 'business') {
    return fetchObjects(cityId, query);
  }
  return fetchStreets(cityId, query);
}

/**
 *    Низькорівнева обгортка над /api/list_acc
 *    t = 6 — «графіки обмеження» (graphs / graphs-fiz / graphs-ur)
 *    query визначає, чи шукати за вулицею, юрособою або містом.
 */
async function fetchOutages(
  query: PowerScheduleQuery,
  mode: 1 | 2 | 6 = 6,
): Promise<RawOutage[]> {
  const t = mode;
  const { consumerKind, cityId, streetId, objectId } = query;

  const reqParams: Record<string, string | number> = { t };

  if (consumerKind === 'business' && objectId) {
    reqParams.id_ur = objectId;
  } else if (streetId) {
    reqParams.s = streetId;
  } else if (cityId) {
    reqParams.c = cityId;
  } else {
    return [];
  }

  const send_param = encodeURIComponent(JSON.stringify(reqParams));

  const res = await fetch(`${BASE_URL}/api/list_acc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ req_param: send_param }),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} при запиті графіка`);
  }

  const data = await res.json();

  if (data.status === 'error') {
    throw new Error(data.message || 'Помилка сервера при отриманні графіка');
  }

  const list: any[] = data.list || [];

  return list.map(el => ({
    city: String(el[0] ?? ''),
    street: String(el[1] ?? ''),
    houses: String(el[2] ?? ''),
    start: String(el[3] ?? ''),
    end: String(el[4] ?? ''),
    createdAt: String(el[5] ?? ''),
  })) as RawOutage[];
}

function filterByHouse(outages: RawOutage[], house: string | undefined): RawOutage[] {
  const trimmed = (house ?? '').trim();
  if (!trimmed) return outages;
  const needle = trimmed.toLowerCase();
  return outages.filter(o => o.houses.toLowerCase().includes(needle));
}

export async function fetchPowerSchedule(
  query: PowerScheduleQuery,
): Promise<PowerScheduleItem[]> {
  const raw = await fetchOutages(query, 6);
  const filtered = filterByHouse(raw, query.house);

  return filtered.map((o, idx) => ({
    id: `${query.consumerKind}-${query.cityId}-${idx}`,
    start: o.start,
    end: o.end,
    description: `${o.city}, ${o.street} (будинки: ${o.houses})`,
  }));
}