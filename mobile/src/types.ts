export type ThemeMode = 'light' | 'dark';

export type BlockId = 'weather' | 'power' | 'devices';

export interface BlocksConfig {
  enabled: BlockId[];
}

export type WeatherLocation = {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
};

export interface WeatherHourData {
  time: string;
  temperature?: number;
  humidity?: number;
  windSpeed?: number;
  symbolCode?: string;
}

export interface WeatherDayData {
  time: string;
  temperature?: number;
  humidity?: number;
  windSpeed?: number;
  symbolCode?: string;
  hourly: WeatherHourData[];
}

export interface PowerScheduleItem {
  id: string;
  start: string;
  end: string;
  description?: string;
}

export interface PowerAddressConfig {
  id: string;
  consumerKind: 'household' | 'business';
  departmentId?: string;
  departmentLabel?: string;
  cityId: string;
  cityName: string;
  secondLevelId: string;
  secondLevelName: string;
  house: string;
}

export type EspDeviceKind = 'light' | 'climate' | 'unknown';

export interface EspDeviceData {
  temperature?: number;
  humidity?: number;
  pressure?: number;
  light?: number | boolean;
}

export interface EspDevice {
  id: string;
  name: string;
  ip: string;
  kind: EspDeviceKind;
  data: EspDeviceData;
  lastSeen: string;
}

export interface EspDeviceSummary {
  devicesCount: number;
}

export interface AppSettings {
  themeMode: ThemeMode;
  notificationsEnabled: boolean;
  vibrationEnabled: boolean;
  weatherNotificationTime: string;
  powerScheduleNotificationsEnabled: boolean;
  espLightNotificationsEnabled: boolean;
  espLightCheckTime: string;
  espDeviceIpList?: string;
}
