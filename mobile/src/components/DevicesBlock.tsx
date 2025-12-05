// src/components/DevicesBlock.tsx
import * as React from 'react';
import {StyleSheet, View} from 'react-native';
import {
  Card,
  Text,
  IconButton,
  Portal,
  Dialog,
  Button,
  TextInput,
  ActivityIndicator,
  Divider,
} from 'react-native-paper';
import {EspDevice} from '../types';
import {scanEspDevices} from '../services/espApi';
import {getSettings, setSettings} from '../services/storage';

interface Props {
  onRemoveBlock?: () => void;
}

function formatLightStatus(light?: number | boolean): string {
  if (light === undefined || light === null) return '—';
  if (typeof light === 'boolean') {
    return light ? 'УВІМК.' : 'ВИМК.';
  }
  return light ? 'УВІМК.' : 'ВИМК.';
}

function deviceKindIcon(kind: string): string {
  switch (kind) {
    case 'climate':
      return 'thermometer';
    case 'light':
      return 'lightbulb-on-outline';
    default:
      return 'chip';
  }
}

function deviceKindLabel(kind: string): string {
  switch (kind) {
    case 'climate':
      return 'Клімат';
    case 'light':
      return 'Освітлення';
    default:
      return 'Інше';
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

const DevicesBlock: React.FC<Props> = ({onRemoveBlock}) => {
  const [loading, setLoading] = React.useState(true);
  const [devices, setDevices] = React.useState<EspDevice[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const [dialogVisible, setDialogVisible] =
    React.useState(false);

  const [espIps, setEspIps] = React.useState<string[]>([]);
  const [ipInput, setIpInput] = React.useState('');
  const [savingConfig, setSavingConfig] = React.useState(false);
  const [formError, setFormError] =
    React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      try {
        const settings = await getSettings();
        const raw = settings.espDeviceIpList ?? '';
        const parsed = raw
          .split(/[,\n;\s]+/)
          .map(s => s.trim())
          .filter(Boolean);
        setEspIps(parsed);
      } catch (e) {
        console.warn('[DevicesBlock] failed to load settings', e);
      }
    })();
  }, []);

  const loadDevices = React.useCallback(
    async (opts?: {silent?: boolean}) => {
      const silent = opts?.silent === true;

      try {
        if (!silent) {
          setLoading(true);
          setError(null);
        }
        const list = await scanEspDevices();
        setDevices(list);
        if (!silent) {
          setError(null);
        }
      } catch (e: any) {
        console.warn('[DevicesBlock] scan warning', e);
        setDevices([]);
        if (!silent) {
          setError(
            e?.message ?? 'Помилка опитування ESP-пристроїв.',
          );
        }
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [],
  );

  React.useEffect(() => {
    void loadDevices();

    const intervalId = setInterval(() => {
      void loadDevices({silent: true});
    }, 1500);

    return () => clearInterval(intervalId);
  }, [loadDevices]);

  const offlineIps = React.useMemo(
    () =>
      espIps.filter(
        ip => !devices.some(device => device.ip === ip),
      ),
    [espIps, devices],
  );

  const openDialog = () => {
    setFormError(null);
    setDialogVisible(true);
  };
  const closeDialog = () => setDialogVisible(false);

  const handleAddIp = () => {
    const ip = ipInput.trim();
    if (!ip) {
      setFormError('Введіть IP-адресу ESP.');
      return;
    }
    if (!isValidIp(ip)) {
      setFormError('Некоректна IP-адреса. Приклад: 192.168.0.50');
      return;
    }
    if (espIps.includes(ip)) {
      setFormError('Ця IP-адреса вже додана.');
      return;
    }
    setEspIps(prev => [...prev, ip]);
    setIpInput('');
    setFormError(null);
  };

  const handleDeleteIp = (ip: string) => {
    setEspIps(prev => prev.filter(x => x !== ip));
  };

  const handleSaveConfig = async () => {
    if (espIps.length === 0) {
      setFormError('Додайте хоча б одну IP-адресу ESP.');
      return;
    }

    try {
      setSavingConfig(true);
      setFormError(null);
      const settings = await getSettings();
      await setSettings({
        ...settings,
        espDeviceIpList: espIps.join('\n'),
      });
      setDialogVisible(false);
      void loadDevices();
    } catch (e) {
      console.warn('[DevicesBlock] failed to save ESP config', e);
      setFormError(
        'Не вдалося зберегти налаштування. Спробуйте ще раз.',
      );
    } finally {
      setSavingConfig(false);
    }
  };

  const formatDeviceTime = (iso: string | undefined) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString('uk-UA', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return '';
    }
  };

  return (
    <>
      <Card style={styles.card} mode="elevated">
        <Card.Title
          title="Розумні пристрої"
          subtitle="Локальні ESP-модулі"
          titleVariant="titleMedium"
          right={props => (
            <View style={styles.titleRight}>
              <IconButton
                {...props}
                icon="tune-variant"
                onPress={openDialog}
              />
              <IconButton
                {...props}
                icon="refresh"
                onPress={() => loadDevices()}
                disabled={loading}
              />
              {onRemoveBlock && (
                <IconButton
                  {...props}
                  icon="trash-can-outline"
                  onPress={onRemoveBlock}
                />
              )}
            </View>
          )}
        />

        <Card.Content>
          {/* Підзаголовок + статус */}
          <View style={styles.headerRow}>
            <View style={styles.statusPill}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>
                {loading
                  ? 'Оновлення…'
                  : `Пристроїв: ${devices.length}`}
              </Text>
            </View>
          </View>

          <Divider style={styles.divider} />

          {/* Loading */}
          {loading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator />
              <Text style={styles.loadingText}>
                Запит даних з ESP…
              </Text>
            </View>
          )}

          {/* Error */}
          {!loading && error && (
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>Помилка</Text>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Попередження про IP, які не відповідають (якщо є хоч один онлайн) */}
          {!loading &&
            !error &&
            devices.length > 0 &&
            offlineIps.length > 0 && (
              <View style={styles.offlineWarning}>
                <Text style={styles.offlineTitle}>
                  Деякі ESP не відповідають
                </Text>
                <Text style={styles.offlineText}>
                  Немає даних з таких IP:{' '}
                  {offlineIps.join(', ')}
                </Text>
              </View>
            )}

          {/* No devices */}
          {!loading && !error && devices.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>
                Немає даних з ESP
              </Text>
              <Text style={styles.emptyText}>
                {espIps.length === 0
                  ? 'Переконайтесь, що ESP-пристрої увімкнені та доступні за вказаними IP-адресами у налаштуваннях блоку.'
                  : `Збережені IP: ${espIps.join(
                    ', ',
                  )}. Жоден пристрій зараз не відповідає на запит.`}
              </Text>
            </View>
          )}

          {/* Devices list */}
          {!loading &&
            !error &&
            devices.length > 0 && (
              <View style={styles.devicesList}>
                {devices.map(device => {
                  const {temperature, humidity, pressure, light} =
                    device.data;

                  const isClimate =
                    device.kind === 'climate' ||
                    temperature != null ||
                    humidity != null ||
                    pressure != null;
                  const isLight =
                    device.kind === 'light' || light != null;

                  const kindLabel = deviceKindLabel(device.kind);

                  return (
                    <View
                      key={device.id}
                      style={styles.deviceCard}>
                      {/* Header */}
                      <View style={styles.deviceHeaderRow}>
                        <View style={styles.deviceTitleRow}>
                          <IconButton
                            icon={deviceKindIcon(device.kind)}
                            size={26}
                            disabled
                          />
                          <View>
                            <Text style={styles.deviceName}>
                              {device.name}
                            </Text>
                            <Text style={styles.deviceMeta}>
                              {device.ip}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.deviceKindPill}>
                          <Text style={styles.deviceKindText}>
                            {kindLabel}
                          </Text>
                        </View>
                      </View>

                      {/* Climate metrics */}
                      {isClimate && (
                        <View style={styles.metricsRow}>
                          <View style={styles.metricBox}>
                            <Text style={styles.metricLabel}>
                              Температура
                            </Text>
                            <Text style={styles.metricValue}>
                              {temperature != null
                                ? `${temperature.toFixed(1)} °C`
                                : '—'}
                            </Text>
                          </View>
                          <View style={styles.metricBox}>
                            <Text style={styles.metricLabel}>
                              Вологість
                            </Text>
                            <Text style={styles.metricValue}>
                              {humidity != null
                                ? `${humidity.toFixed(0)} %`
                                : '—'}
                            </Text>
                          </View>
                          <View style={styles.metricBox}>
                            <Text style={styles.metricLabel}>
                              Тиск
                            </Text>
                            <Text style={styles.metricValue}>
                              {pressure != null
                                ? `${pressure.toFixed(0)} mmHg`
                                : '—'}
                            </Text>
                          </View>
                        </View>
                      )}

                      {/* Light metric */}
                      {isLight && (
                        <View style={styles.lightRow}>
                          <Text style={styles.metricLabel}>
                            Світло
                          </Text>
                          <View
                            style={[
                              styles.lightPill,
                              formatLightStatus(light) ===
                              'УВІМК.'
                                ? styles.lightOn
                                : styles.lightOff,
                            ]}>
                            <Text style={styles.lightPillText}>
                              {formatLightStatus(light)}
                            </Text>
                          </View>
                        </View>
                      )}

                      {/* Unknown type */}
                      {!isClimate && !isLight && (
                        <Text style={styles.deviceUnknown}>
                          Невідомий тип даних — перевірте
                          прошивку ESP.
                        </Text>
                      )}

                      {/* Footer */}
                      <View style={styles.deviceFooterRow}>
                        <Text style={styles.deviceFooterText}>
                          Останні дані:{' '}
                          {formatDeviceTime(device.lastSeen) ||
                            '—'}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
        </Card.Content>
      </Card>

      {/* Налаштування ESP */}
      <Portal>
        <Dialog visible={dialogVisible} onDismiss={closeDialog}>
          <Dialog.Title>Налаштування ESP</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.dialogLabel}>
              IP-адреси ESP-пристроїв
            </Text>
            <Text style={styles.dialogHint}>
              Додавайте IP по одному. Приклад:{' '}
              <Text style={{fontWeight: '600'}}>
                192.168.0.50
              </Text>
            </Text>

            <View style={styles.ipInputRow}>
              <TextInput
                mode="outlined"
                label="IP-адреса"
                value={ipInput}
                onChangeText={text => {
                  setIpInput(text);
                  setFormError(null);
                }}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.ipInput}
              />
              <IconButton
                icon="plus"
                size={24}
                onPress={handleAddIp}
              />
            </View>

            {espIps.length > 0 && (
              <View style={styles.ipList}>
                {espIps.map(ip => (
                  <View key={ip} style={styles.ipRow}>
                    <Text style={styles.ipText}>{ip}</Text>
                    <IconButton
                      icon="trash-can-outline"
                      size={18}
                      onPress={() => handleDeleteIp(ip)}
                    />
                  </View>
                ))}
              </View>
            )}

            {formError && (
              <Text style={styles.errorText}>{formError}</Text>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={closeDialog}>Скасувати</Button>
            <Button
              onPress={handleSaveConfig}
              loading={savingConfig}
              disabled={savingConfig}>
              Зберегти
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
};

export default DevicesBlock;

const styles = StyleSheet.create({
  card: {
    marginTop: 12,
    borderRadius: 18,
  },
  titleRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginBottom: 6,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4caf50',
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  divider: {
    marginTop: 4,
    marginBottom: 8,
  },

  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  loadingText: {
    marginLeft: 8,
    fontSize: 13,
  },

  errorCard: {
    marginTop: 4,
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(211,47,47,0.08)',
  },
  errorTitle: {
    fontWeight: '600',
    marginBottom: 2,
    color: '#d32f2f',
  },
  errorText: {
    color: '#d32f2f',
    marginTop: 4,
    fontSize: 12,
  },

  offlineWarning: {
    marginTop: 4,
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,193,7,0.10)',
  },
  offlineTitle: {
    fontWeight: '600',
    marginBottom: 2,
    color: '#f57c00',
  },
  offlineText: {
    fontSize: 12,
    color: '#8a6d00',
  },

  emptyState: {
    paddingVertical: 12,
  },
  emptyTitle: {
    fontWeight: '600',
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 13,
    color: '#666',
  },

  devicesList: {
    marginTop: 4,
  },
  deviceCard: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  deviceHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  deviceTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deviceName: {
    fontWeight: '600',
    fontSize: 14,
  },
  deviceMeta: {
    fontSize: 12,
    color: '#777',
  },
  deviceKindPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(33,150,243,0.08)',
  },
  deviceKindText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#1976d2',
  },

  metricsRow: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  metricBox: {
    flex: 1,
    paddingVertical: 6,
  },
  metricLabel: {
    fontSize: 11,
    color: '#777',
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 15,
    fontWeight: '600',
  },

  lightRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    columnGap: 8,
    marginLeft: 18,
  },
  lightPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  lightOn: {
    backgroundColor: 'rgba(76,175,80,0.15)',
  },
  lightOff: {
    backgroundColor: 'rgba(158,158,158,0.18)',
  },
  lightPillText: {
    fontSize: 12,
    fontWeight: '600',
  },

  deviceUnknown: {
    marginTop: 6,
    fontSize: 12,
    color: '#777',
  },

  deviceFooterRow: {
    marginTop: 6,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  deviceFooterText: {
    fontSize: 11,
    color: '#888',
  },

  dialogIntro: {
    fontSize: 13,
    marginBottom: 8,
  },
  dialogDivider: {
    marginVertical: 8,
  },
  dialogHint: {
    marginTop: 4,
    fontSize: 12,
    color: '#666',
  },
  dialogLabel: {
    marginTop: 4,
    fontWeight: '600',
  },

  ipInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  ipInput: {
    flex: 1,
  },
  ipList: {
    marginTop: 8,
  },
  ipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  ipText: {
    fontSize: 13,
  },
});