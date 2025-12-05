// src/services/notifications.ts
import {Platform} from 'react-native';
import notifee, {
  AndroidImportance,
  TimestampTrigger,
  TriggerType,
  RepeatFrequency,
} from '@notifee/react-native';
import {getSettings} from './storage';
import type {AppSettings, PowerScheduleItem} from '../types';

let initialized = false;

async function ensureInitialized() {
  if (initialized) {
    return;
  }
  initialized = true;

  await notifee.requestPermission();

  if (Platform.OS === 'android') {
    // Канал з вібрацією
    await notifee.createChannel({
      id: 'ceronest-vibrate',
      name: 'CeroNest',
      importance: AndroidImportance.DEFAULT,
      vibration: true,
    });

    // Канал без вібрації
    await notifee.createChannel({
      id: 'ceronest-silent',
      name: 'CeroNest (без вібрації)',
      importance: AndroidImportance.DEFAULT,
      vibration: false,
    });
  }
}

function pickAndroidChannelId(settings: AppSettings): string | undefined {
  if (Platform.OS !== 'android') return undefined;
  return settings.vibrationEnabled ? 'ceronest-vibrate' : 'ceronest-silent';
}

export async function showInfoNotification(
  title: string,
  body: string,
) {
  await ensureInitialized();

  const settings = await getSettings();
  if (!settings.notificationsEnabled) {
    return;
  }

  const channelId = pickAndroidChannelId(settings);

  await notifee.displayNotification({
    title,
    body,
    android:
      Platform.OS === 'android'
        ? {
          channelId: channelId!,
        }
        : undefined,
  });
}

function parseTimeToMinutes(value: string | undefined): number | null {
  if (!value) return null;
  const m = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

export async function scheduleDailyWeatherReminder(
  explicitSettings?: AppSettings,
) {
  await ensureInitialized();

  const settings = explicitSettings ?? (await getSettings());

  if (!settings.notificationsEnabled) {
    await notifee.cancelNotification('weather-daily');
    return;
  }

  const minutes = parseTimeToMinutes(
    settings.weatherNotificationTime ?? '08:00',
  );
  if (minutes == null) {
    await notifee.cancelNotification('weather-daily');
    return;
  }

  const now = new Date();
  const triggerDate = new Date(now);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  triggerDate.setHours(hours, mins, 0, 0);

  if (triggerDate.getTime() <= now.getTime()) {
    triggerDate.setDate(triggerDate.getDate() + 1);
  }

  const channelId = pickAndroidChannelId(settings);

  const trigger: TimestampTrigger = {
    type: TriggerType.TIMESTAMP,
    timestamp: triggerDate.getTime(),
    repeatFrequency: RepeatFrequency.DAILY,
  };

  await notifee.cancelNotification('weather-daily');

  await notifee.createTriggerNotification(
    {
      id: 'weather-daily',
      title: 'Погода на сьогодні',
      body: 'Перевірте оновлений прогноз у CeroNest.',
      android:
        Platform.OS === 'android'
          ? {
            channelId: channelId!,
          }
          : undefined,
    },
    trigger,
  );
}

export async function scheduleNextPowerOutageNotification(
  addressId: string,
  addressLabel: string,
  items: PowerScheduleItem[],
) {
  await ensureInitialized();

  const settings = await getSettings();

  if (
    !settings.notificationsEnabled ||
    !settings.powerScheduleNotificationsEnabled
  ) {
    await notifee.cancelNotification(`power-${addressId}`);
    return;
  }

  const now = Date.now();

  const parsed = items
    .map(item => {
      const startMs = new Date(item.start).getTime();
      const endMs = new Date(item.end).getTime();
      return {item, startMs, endMs};
    })
    .filter(
      x =>
        Number.isFinite(x.startMs) &&
        Number.isFinite(x.endMs) &&
        x.endMs > now,
    )
    .sort((a, b) => a.startMs - b.startMs);

  if (!parsed.length) {
    await notifee.cancelNotification(`power-${addressId}`);
    return;
  }

  const next = parsed[0];

  const leadMs = 15 * 60 * 1000;
  let triggerTime = next.startMs - leadMs;
  if (triggerTime <= now) {
    triggerTime = next.startMs;
  }

  if (triggerTime <= now) {
    await notifee.cancelNotification(`power-${addressId}`);
    return;
  }

  const channelId = pickAndroidChannelId(settings);

  const startLocal = new Date(next.startMs).toLocaleTimeString(
    'uk-UA',
    {
      hour: '2-digit',
      minute: '2-digit',
    },
  );

  await notifee.cancelNotification(`power-${addressId}`);

  const trigger: TimestampTrigger = {
    type: TriggerType.TIMESTAMP,
    timestamp: triggerTime,
  };

  await notifee.createTriggerNotification(
    {
      id: `power-${addressId}`,
      title: 'Майбутнє відключення світла',
      body: `${addressLabel}\nОчікується відключення приблизно о ${startLocal}.`,
      android:
        Platform.OS === 'android'
          ? {
            channelId: channelId!,
          }
          : undefined,
    },
    trigger,
  );
}