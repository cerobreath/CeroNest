// src/services/espApi.ts
import {
  EspDevice,
  EspDeviceData,
  EspDeviceKind,
} from '../types';
import {persistEspSample} from './nativeStats';
import {getSettings} from './storage';
import {showInfoNotification} from './notifications';
import {hasInternet} from './network';

function asNumber(value: unknown): number | undefined {
  if (value == null) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function detectKind(data: EspDeviceData): EspDeviceKind {
  if (data.light !== undefined) {
    return 'light';
  }
  if (
    data.temperature !== undefined ||
    data.humidity !== undefined ||
    data.pressure !== undefined
  ) {
    return 'climate';
  }
  return 'unknown';
}

function normalizeEspPayload(raw: any, ip: string): EspDevice {
  const nowIso = new Date().toISOString();

  const id = String(raw.id ?? raw.deviceId ?? ip);
  const name = String(raw.name ?? raw.title ?? 'ESP пристрій');

  const sensors = raw.sensors ?? raw.data ?? raw;

  const temperature = asNumber(
    sensors.temperature ?? sensors.temp ?? sensors.t,
  );
  const humidity = asNumber(
    sensors.humidity ??
    sensors.hum ??
    sensors.h ??
    sensors.rel_humidity,
  );
  const pressure = asNumber(
    sensors.pressure ?? sensors.p ?? sensors.press,
  );

  const lightRaw =
    sensors.light ??
    sensors.light_state ??
    sensors.relay ??
    sensors.state;

  let light: number | boolean | undefined;
  if (typeof lightRaw === 'boolean') {
    light = lightRaw;
  } else {
    const n = asNumber(lightRaw);
    if (n !== undefined) {
      light = n;
    }
  }

  const data: EspDeviceData = {
    temperature,
    humidity,
    pressure,
    light,
  };

  const kind = detectKind(data);

  return {
    id,
    name,
    ip,
    kind,
    data,
    lastSeen: nowIso,
  };
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('timeout')),
      ms,
    );
    promise
      .then(value => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(err => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

async function probeHost(ip: string): Promise<EspDevice | null> {
  try {
    const res = await withTimeout(
      fetch(`http://${ip}/ceronest/info`, {
        method: 'GET',
      }),
      1200,
    );

    if (!res.ok) {
      return null;
    }

    const json = await res.json();
    return normalizeEspPayload(json, ip);
  } catch {
    return null;
  }
}

function isValidIp(ip: string): boolean {
  const m = ip.match(/^(\d{1,3}\.){3}\d{1,3}$/);
  if (!m) return false;
  return ip.split('.').every(part => {
    const n = Number(part);
    return n >= 0 && n <= 255;
  });
}

export async function scanEspDevices(): Promise<EspDevice[]> {
  const online = await hasInternet();
  if (!online) {
    throw new Error('Немає підключення до мережі.');
  }

  const settings = await getSettings();
  const ipListRaw = settings.espDeviceIpList ?? '';

  const ips = ipListRaw
    .split(/[,\n;\s]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .filter(isValidIp);

  if (ips.length === 0) {
    throw new Error(
      'Не задано жодної коректної IP-адреси ESP. Додайте хоча б одну IP-адресу у налаштуваннях блоку.',
    );
  }

  const results = await Promise.allSettled(
    ips.map(ip => probeHost(ip)),
  );

  const devices: EspDevice[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      devices.push(r.value);
    }
  }

  await Promise.all(
    devices.map(device => saveCurrentEspSnapshotToDb(device)),
  );

  return devices;
}


const lastLightNotificationAt: Record<string, number> = {};

const LIGHT_REMINDER_INTERVAL_MS = 2 * 60 * 1000;

function parseTimeRangeMinutes(
  range: string | undefined,
): [number, number] | null {
  if (!range) return null;
  const [startRaw, endRaw] = range.split('-').map(s => s.trim());
  if (!startRaw || !endRaw) return null;

  const parsePart = (value: string): number | null => {
    const m = value.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    return h * 60 + min;
  };

  const start = parsePart(startRaw);
  const end = parsePart(endRaw);
  if (start == null || end == null) return null;
  return [start, end];
}

function isNowWithinRange(range: string | undefined): boolean {
  const parsed = parseTimeRangeMinutes(range);
  if (!parsed) return true;
  const [start, end] = parsed;

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  if (start === end) return true;

  if (start < end) {
    return nowMinutes >= start && nowMinutes < end;
  }

  // перетин через північ
  return nowMinutes >= start || nowMinutes < end;
}

async function maybeNotifyEspLight(device: EspDevice): Promise<void> {
  const settings = await getSettings();

  if (
    !settings.notificationsEnabled ||
    !settings.espLightNotificationsEnabled
  ) {
    return;
  }

  if (!isNowWithinRange(settings.espLightCheckTime)) {
    return;
  }

  const light = device.data?.light;
  let isOn = false;

  if (typeof light === 'boolean') {
    isOn = light;
  } else if (typeof light === 'number') {
    isOn = light > 0;
  }

  if (!isOn) {
    lastLightNotificationAt[device.id] = 0;
    return;
  }

  const nowMs = Date.now();
  const last = lastLightNotificationAt[device.id] ?? 0;

  if (nowMs - last < LIGHT_REMINDER_INTERVAL_MS) {
    return;
  }

  lastLightNotificationAt[device.id] = nowMs;

  await showInfoNotification(
    'Світло у ванній досі увімкнене',
    'Перевірте ванну та, за можливості, вимкніть світло.',
  );
}

export async function saveCurrentEspSnapshotToDb(
  device: EspDevice,
): Promise<void> {
  if (!device.data) return;

  const nowIso = new Date().toISOString();
  await persistEspSample(device.id, nowIso, device.data);

  await maybeNotifyEspLight(device);
}