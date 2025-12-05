import * as React from 'react';
import {useEffect, useState, useContext} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {ThemeContext} from '../services/themeContext';
import {
  ActivityIndicator,
  Divider,
  List,
  Switch,
  Text,
  TextInput,
  useTheme,
  Snackbar,
  IconButton,
  Card,
  Button,
} from 'react-native-paper';
import {AppSettings} from '../types';
import {
  getSettings as loadAppSettings,
  setSettings as saveAppSettings,
  DEFAULT_SETTINGS,
} from '../services/storage';
import {
  showInfoNotification,
  scheduleDailyWeatherReminder,
} from '../services/notifications';

const SettingsScreen: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const theme = useTheme();
  const {themeMode, setThemeMode} = useContext(ThemeContext);

  useEffect(() => {
    (async () => {
      try {
        const loaded = await loadAppSettings();
        setSettings(loaded);
      } catch (e) {
        console.warn('[Settings] failed to load', e);
        setSettings(DEFAULT_SETTINGS);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function persist(next: AppSettings) {
    try {
      setSaving(true);
      await saveAppSettings(next);
      setSnackbar('Налаштування збережено');
    } catch (e) {
      console.warn('[Settings] failed to save', e);
      setSnackbar('Помилка збереження налаштувань');
    } finally {
      setSaving(false);
    }
  }

  if (!settings || loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.loadingText}>
          Завантаження налаштувань…
        </Text>
      </View>
    );
  }

  const update = (patch: Partial<AppSettings>) => {
    if (!settings) return;

    const prevNotificationsEnabled = settings.notificationsEnabled;

    const next: AppSettings = {...settings, ...patch};
    setSettings(next);
    void persist(next);

    void scheduleDailyWeatherReminder(next);

    if (patch.themeMode && patch.themeMode !== themeMode) {
      setThemeMode(patch.themeMode);
    }

    if (
      patch.notificationsEnabled === true &&
      !prevNotificationsEnabled
    ) {
      void showInfoNotification(
        'Сповіщення увімкнено',
        'CeroNest тепер може надсилати вам повідомлення згідно з налаштуваннями.',
      );
    }
  };

  const handleReset = async () => {
    setSettings(DEFAULT_SETTINGS);
    try {
      await saveAppSettings(DEFAULT_SETTINGS);
      setThemeMode(DEFAULT_SETTINGS.themeMode);
      setSnackbar('Налаштування скинуто');
    } catch (e) {
      console.warn('[Settings] reset failed', e);
      setSnackbar('Помилка скидання налаштувань');
    }
  };

  const hasEspDevices = true;

  const isLight = settings.themeMode === 'light';
  const isDark = settings.themeMode === 'dark';

  return (
    <>
      <ScrollView
        style={{flex: 1, backgroundColor: theme.colors.background}}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled">
        {/* ТЕМА + БАЗОВІ СПОВІЩЕННЯ */}
        <Card style={styles.card} mode="elevated">
          <List.Item
            title="Тема"
            left={props => (
              <List.Icon {...props} icon="palette-outline" />
            )}
            right={() => (
              <View style={styles.themeButtonsRow}>
                <IconButton
                  icon="white-balance-sunny"
                  selected={isLight}
                  onPress={() => update({themeMode: 'light'})}
                  containerColor={
                    isLight
                      ? theme.colors.primaryContainer
                      : undefined
                  }
                />
                <IconButton
                  icon="weather-night"
                  selected={isDark}
                  onPress={() => update({themeMode: 'dark'})}
                  containerColor={
                    isDark
                      ? theme.colors.primaryContainer
                      : undefined
                  }
                />
              </View>
            )}
          />

          <Divider style={styles.innerDivider} />

          <List.Item
            title="Сповіщення"
            left={props => (
              <List.Icon {...props} icon="bell-outline" />
            )}
            right={() => (
              <Switch
                value={settings.notificationsEnabled}
                onValueChange={value =>
                  update({notificationsEnabled: value})
                }
              />
            )}
          />

          <List.Item
            title="Вібрація"
            left={props => <List.Icon {...props} icon="vibrate" />}
            right={() => (
              <Switch
                value={settings.vibrationEnabled}
                onValueChange={value =>
                  update({vibrationEnabled: value})
                }
                disabled={!settings.notificationsEnabled}
              />
            )}
          />
        </Card>

        {/* ПОГОДА + ВІДКЛЮЧЕННЯ СВІТЛА */}
        <Card style={styles.card} mode="elevated">
          <List.Item
            title="Погода — час сповіщення"
            left={props => (
              <List.Icon {...props} icon="weather-partly-cloudy" />
            )}
            right={() => (
              <TextInput
                mode="outlined"
                value={settings.weatherNotificationTime}
                onChangeText={text =>
                  update({weatherNotificationTime: text})
                }
                style={styles.timeInput}
                placeholder="08:00"
                disabled={!settings.notificationsEnabled}
              />
            )}
          />

          <Divider style={styles.innerDivider} />

          <List.Item
            title="Графік відключення світла"
            left={props => (
              <List.Icon {...props} icon="power-plug-outline" />
            )}
            right={() => (
              <Switch
                value={
                  settings.powerScheduleNotificationsEnabled
                }
                onValueChange={value =>
                  update({powerScheduleNotificationsEnabled: value})
                }
                disabled={!settings.notificationsEnabled}
              />
            )}
          />
        </Card>

        {/* ESP-БЛОК */}
        {hasEspDevices && (
          <Card style={styles.card} mode="elevated">
            <List.Item
              title="Світло у ванній"
              left={props => (
                <List.Icon
                  {...props}
                  icon="lightbulb-on-outline"
                />
              )}
              right={() => (
                <Switch
                  value={settings.espLightNotificationsEnabled}
                  onValueChange={value =>
                    update({espLightNotificationsEnabled: value})
                  }
                  disabled={!settings.notificationsEnabled}
                />
              )}
            />

            <List.Item
              title="Час перевірки"
              left={props => (
                <List.Icon {...props} icon="clock-outline" />
              )}
              right={() => (
                <TextInput
                  mode="outlined"
                  value={settings.espLightCheckTime}
                  onChangeText={text =>
                    update({espLightCheckTime: text})
                  }
                  style={styles.timeInput}
                  placeholder="22:00-06:00"
                  disabled={
                    !settings.notificationsEnabled ||
                    !settings.espLightNotificationsEnabled
                  }
                />
              )}
            />
          </Card>
        )}

        {/* СКИНУТИ */}
        <Card style={styles.card} mode="elevated">
          <Button
            mode="contained"
            icon="backup-restore"
            onPress={handleReset}
            disabled={saving}
            contentStyle={styles.resetButtonContent}
            style={styles.resetButton}
            buttonColor={theme.colors.errorContainer}
            textColor={theme.colors.onErrorContainer}>
            Скинути налаштування
          </Button>
        </Card>
      </ScrollView>

      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar(null)}
        duration={2000}>
        {snackbar}
      </Snackbar>
    </>
  );
};

export default SettingsScreen;

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 32,
    gap: 12,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 8,
  },
  card: {
    borderRadius: 16,
    marginTop: 12,
  },
  innerDivider: {
    marginHorizontal: 16,
    opacity: 0.3,
  },
  themeButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginRight: 4,
  },
  timeInput: {
    width: 110,
    marginRight: 8,
  },
  resetButton: {
    borderRadius: 12,
  },
  resetButtonContent: {
    height: 48,
    justifyContent: 'center',
  },
});