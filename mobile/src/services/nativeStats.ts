// src/services/nativeStats.ts
import {NativeModules} from 'react-native';
import type {
  WeatherDayData,
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
  ): Promise<Array<NativePowerItem & {addressLabel?: string}>>;

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