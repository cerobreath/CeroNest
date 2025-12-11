// src/services/storage.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AppSettings,
  BlocksConfig,
  WeatherLocation,
  BlockId,
  PowerAddressConfig,
} from '../types';

const BLOCKS_KEY = 'ceronest:blocksConfig';
const SETTINGS_KEY = 'ceronest:settings';
const WEATHER_LOCATION_KEY = 'ceronest:weatherLocation';
const POWER_ADDRESSES_KEY = 'ceronest:powerAddresses';

export const DEFAULT_SETTINGS: AppSettings = {
  themeMode: 'light',
  notificationsEnabled: true,
  vibrationEnabled: true,
  weatherNotificationTime: '08:00',
  powerScheduleNotificationsEnabled: true,
  espLightNotificationsEnabled: false,
  espLightCheckTime: '22:00-06:00',
  espDeviceIpList: '',
};

const DEFAULT_BLOCK_ORDER: BlockId[] = ['weather', 'power', 'devices'];
const DEFAULT_BLOCKS_CONFIG: BlocksConfig = {
  enabled: DEFAULT_BLOCK_ORDER,
};

export async function getSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return DEFAULT_SETTINGS;
    }
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function setSettings(
  settings: AppSettings,
): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export async function getBlocksConfig(): Promise<BlocksConfig> {
  try {
    const raw = await AsyncStorage.getItem(BLOCKS_KEY);
    if (!raw) {
      return DEFAULT_BLOCKS_CONFIG;
    }
    const parsed = JSON.parse(raw) as BlocksConfig;
    const enabled = Array.isArray(parsed.enabled)
      ? parsed.enabled.filter((id): id is BlockId =>
        ['weather', 'power', 'devices'].includes(id as BlockId),
      )
      : [];

    if (!enabled.length) {
      return DEFAULT_BLOCKS_CONFIG;
    }

    return {enabled};
  } catch {
    return DEFAULT_BLOCKS_CONFIG;
  }
}

export async function setBlocksConfig(
  config: BlocksConfig,
): Promise<void> {
  await AsyncStorage.setItem(BLOCKS_KEY, JSON.stringify(config));
}

export async function getWeatherLocation(): Promise<WeatherLocation> {
  try {
    const raw = await AsyncStorage.getItem(WEATHER_LOCATION_KEY);
    if (raw) {
      return JSON.parse(raw) as WeatherLocation;
    }
  } catch {
  }
  return {
    id: 'chernihiv',
    name: 'Чернігів',
    country: 'Ukraine',
    lat: 51.5054,
    lon: 31.2866,
  };
}

export async function getPowerAddresses(): Promise<PowerAddressConfig[]> {
  try {
    const raw = await AsyncStorage.getItem(POWER_ADDRESSES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as PowerAddressConfig[];
  } catch {
    return [];
  }
}

export async function setPowerAddresses(
  addresses: PowerAddressConfig[],
): Promise<void> {
  await AsyncStorage.setItem(
    POWER_ADDRESSES_KEY,
    JSON.stringify(addresses),
  );
}