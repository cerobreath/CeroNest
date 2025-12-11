// src/services/nativeStats.ts
import {NativeModules} from 'react-native';
import type {
  WeatherDayData,
  WeatherHourData,
  PowerScheduleItem,
  EspDeviceData,
} from '../types';

type NativeWeatherHour = {
  time: string;
  temperature?: number;
  humidity?: number;
  windSpeed?: number;
  symbolCode?: string;
};

type NativePowerItem = {
  start: string;
  end: string;
  description: string;
  addressLabel?: string;
};

type NativeEspSample = {
  time: string;
  temperature?: number;
  humidity?: number;
  pressure?: number;
  light?: number;
};

type NativeEspDaily = {
  date: string;
  temperature?: number;
  humidity?: number;
  pressure?: number;
  light?: number;
};

export type EspDailyStat = {
  date: string;          // YYYY-MM-DD
  temperature?: number;  // °C, середня
  humidity?: number;     // %, середня
  pressure?: number;     // mmHg, середня
  lightOnRatio?: number; // 0..1 — частка часу зі світлом
};

export async function getEspDailyStats(
  deviceId: string,
  days: number = 3,
): Promise<EspDailyStat[]> {
  const raw = await loadEspDailyFromDb(deviceId, days);
  if (!raw.length) return [];

  return raw
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(d => ({
      date: d.date,
      temperature: d.temperature,
      humidity: d.humidity,
      pressure: d.pressure,
      lightOnRatio:
        typeof d.light === 'number'
          ? d.light // середнє 0..1
          : undefined,
    }));
}

interface CeroNestStatsModuleType {
  saveWeatherHours(
    locationId: string,
    hours: NativeWeatherHour[],
  ): Promise<void>;

  getWeatherHours(
    locationId: string,
    fromIso: string,
    toIso: string,
  ): Promise<NativeWeatherHour[]>;

  savePowerSchedule(
    addressId: string,
    addressLabel: string,
    items: NativePowerItem[],
  ): Promise<void>;

  getPowerScheduleForAddress(
    addressId: string,
    fromIso: string,
  ): Promise<NativePowerItem[]>;

  saveEspSample(
    deviceId: string,
    sample: NativeEspSample,
  ): Promise<void>;

  getEspDaily(
    deviceId: string,
    days: number,
  ): Promise<NativeEspDaily[]>;
}

const nativeModule = NativeModules
  .CeroNestStatsModule as CeroNestStatsModuleType | undefined;

export async function persistWeatherDay(
  locationId: string,
  day: WeatherDayData,
): Promise<void> {
  if (!nativeModule?.saveWeatherHours) {
    return;
  }

  const hours: NativeWeatherHour[] = day.hourly.map(h => ({
    time: h.time,
    temperature: h.temperature,
    humidity: h.humidity,
    windSpeed: h.windSpeed,
    symbolCode: h.symbolCode,
  }));

  await nativeModule.saveWeatherHours(locationId, hours);
}

export async function persistPowerSchedule(
  addressId: string,
  addressLabel: string,
  items: PowerScheduleItem[],
): Promise<void> {
  if (!nativeModule?.savePowerSchedule) {
    return;
  }

  const payload: NativePowerItem[] = items.map(item => ({
    start: item.start,
    end: item.end,
    description: item.description ?? '',
  }));

  await nativeModule.savePowerSchedule(
    addressId,
    addressLabel,
    payload,
  );
}

export async function loadWeatherHoursForRange(
  locationId: string,
  fromIso: string,
  toIso: string,
): Promise<WeatherHourData[]> {
  if (!nativeModule?.getWeatherHours) {
    return [];
  }

  const raw = await nativeModule.getWeatherHours(
    locationId,
    fromIso,
    toIso,
  );

  const byTime = new Map<string, NativeWeatherHour>();
  for (const h of raw) {
    if (!h.time) continue;
    if (!byTime.has(h.time)) {
      byTime.set(h.time, h);
    }
  }

  return Array.from(byTime.values())
    .sort((a, b) => a.time.localeCompare(b.time))
    .map(h => ({
      time: h.time,
      temperature: h.temperature,
      humidity: h.humidity,
      windSpeed: h.windSpeed,
      symbolCode: h.symbolCode,
    }));
}

export async function loadPowerScheduleFromDb(
  addressId: string,
  fromIso: string,
): Promise<PowerScheduleItem[]> {
  if (!nativeModule?.getPowerScheduleForAddress) {
    return [];
  }

  const raw = await nativeModule.getPowerScheduleForAddress(
    addressId,
    fromIso,
  );

  const seen = new Set<string>();
  const result: PowerScheduleItem[] = [];

  raw.forEach((item, index) => {
    const key = `${item.start}|${item.end}|${item.description}`;
    if (seen.has(key)) return;
    seen.add(key);

    result.push({
      id: `${addressId}-${key}-${index}`,
      start: item.start,
      end: item.end,
      description: item.description,
    });
  });

  return result;
}

export async function loadEspDailyFromDb(
  deviceId: string,
  days: number,
): Promise<NativeEspDaily[]> {
  if (!nativeModule?.getEspDaily) return [];
  return nativeModule.getEspDaily(deviceId, days);
}

export async function persistEspSample(
  deviceId: string,
  timeIso: string,
  data: EspDeviceData,
): Promise<void> {
  if (!nativeModule?.saveEspSample) {
    return;
  }

  const numericLight =
    typeof data.light === 'boolean'
      ? data.light
        ? 1
        : 0
      : data.light ?? undefined;

  const sample: NativeEspSample = {
    time: timeIso,
    temperature: data.temperature,
    humidity: data.humidity,
    pressure: data.pressure,
    light: numericLight,
  };

  await nativeModule.saveEspSample(deviceId, sample);
}