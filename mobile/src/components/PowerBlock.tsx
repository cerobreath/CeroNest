// src/components/PowerBlock.tsx
import * as React from 'react';
import {StyleSheet, View, ScrollView, Pressable} from 'react-native';
import {
  ActivityIndicator,
  Card,
  Text,
  IconButton,
  Portal,
  Dialog,
  Button,
  TextInput,
  Chip,
  Divider,
  Menu,
} from 'react-native-paper';
import {PowerScheduleItem, PowerAddressConfig} from '../types';
import {
  fetchPowerSchedule,
  fetchDepartments,
  fetchCities,
  fetchAddressOptions,
  DepartmentOption,
  SimpleOption,
  PowerConsumerKind,
  PowerScheduleQuery,
} from '../services/powerScheduleApi';
import {getPowerAddresses, setPowerAddresses} from '../services/storage';
import {
  persistPowerSchedule,
  loadPowerScheduleFromDb,
} from '../services/nativeStats';
import {scheduleNextPowerOutageNotification} from '../services/notifications';

interface Props {
  onConfigure?: () => void;
  selectedDate?: Date;
}

type AddressConfig = PowerAddressConfig;

type AddressEntry = {
  config: AddressConfig;
  items: PowerScheduleItem[];
  loading: boolean;
  error: string | null;
};

function extractTimeLabel(dateTime: string): string {
  const match = dateTime.match(/(\d{1,2}:\d{2})/);
  return match ? match[1] : dateTime;
}

function formatDuration(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  if (
    Number.isNaN(s.getTime()) ||
    Number.isNaN(e.getTime()) ||
    e.getTime() <= s.getTime()
  ) {
    return '';
  }

  const minutesTotal = Math.round((e.getTime() - s.getTime()) / 60000);
  const hours = Math.floor(minutesTotal / 60);
  const minutes = minutesTotal % 60;

  if (hours && minutes) {
    return `${hours} год ${minutes} хв`;
  }
  if (hours) {
    return `${hours} год`;
  }
  return `${minutes} хв`;
}

function isSameDayIso(iso: string, date: Date): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return d.toDateString() === date.toDateString();
}

function makeAddressTitle(config: AddressConfig): string {
  const housePart = config.house.trim() ? `, буд. ${config.house.trim()}` : '';
  const typeLabel =
    config.consumerKind === 'household' ? 'Побутові' : 'Юридичні';
  return `${config.cityName}, ${config.secondLevelName}${housePart} (${typeLabel})`;
}

function configToQuery(config: AddressConfig): PowerScheduleQuery {
  if (config.consumerKind === 'household') {
    return {
      consumerKind: config.consumerKind,
      cityId: config.cityId,
      streetId: config.secondLevelId,
      house: config.house,
    };
  }

  return {
    consumerKind: config.consumerKind,
    cityId: config.cityId,
    objectId: config.secondLevelId,
    house: config.house,
  };
}

const PowerBlock: React.FC<Props> = ({selectedDate}) => {
  const [addresses, setAddresses] = React.useState<AddressEntry[]>([]);

  const [editingAddressId, setEditingAddressId] =
    React.useState<string | null>(null);

  const [dialogVisible, setDialogVisible] = React.useState(false);

  const [consumerKind, setConsumerKind] =
    React.useState<PowerConsumerKind>('household');

  const [departments, setDepartments] =
    React.useState<DepartmentOption[]>([]);
  const [departLoading, setDepartLoading] = React.useState(false);
  const [departError, setDepartError] =
    React.useState<string | null>(null);
  const [selectedDepartment, setSelectedDepartment] =
    React.useState<DepartmentOption | null>(null);
  const [departMenuVisible, setDepartMenuVisible] =
    React.useState(false);

  const [cityQuery, setCityQuery] = React.useState('');
  const [cities, setCities] = React.useState<SimpleOption[]>([]);
  const [cityLoading, setCityLoading] = React.useState(false);
  const [selectedCity, setSelectedCity] =
    React.useState<SimpleOption | null>(null);

  const [streetQuery, setStreetQuery] = React.useState('');
  const [streets, setStreets] = React.useState<SimpleOption[]>([]);
  const [streetLoading, setStreetLoading] = React.useState(false);
  const [selectedStreet, setSelectedStreet] =
    React.useState<SimpleOption | null>(null);

  const [house, setHouse] = React.useState('');
  const [configError, setConfigError] =
    React.useState<string | null>(null);

  const ensureDepartmentsLoaded = React.useCallback(() => {
    if (departments.length) return;

    (async () => {
      try {
        setDepartLoading(true);
        setDepartError(null);
        const deps = await fetchDepartments();
        setDepartments(deps);
        setSelectedDepartment(prev => prev ?? deps[0] ?? null);
      } catch (e: any) {
        setDepartError(
          e?.message || 'Помилка завантаження підрозділів',
        );
      } finally {
        setDepartLoading(false);
      }
    })();
  }, [departments.length]);

  const resetForm = () => {
    setConsumerKind('household');
    setSelectedDepartment(null);
    setCityQuery('');
    setCities([]);
    setSelectedCity(null);
    setStreetQuery('');
    setStreets([]);
    setSelectedStreet(null);
    setHouse('');
    setConfigError(null);
  };

  const openNewAddressDialog = React.useCallback(() => {
    setEditingAddressId(null);
    resetForm();
    setDialogVisible(true);
    ensureDepartmentsLoaded();
  }, [ensureDepartmentsLoaded]);

  const openEditDialog = React.useCallback(
    (entry: AddressEntry) => {
      setEditingAddressId(entry.config.id);
      setConsumerKind(entry.config.consumerKind);

      if (
        entry.config.departmentId &&
        entry.config.departmentLabel
      ) {
        setSelectedDepartment({
          value: entry.config.departmentId,
          label: entry.config.departmentLabel,
        });
      } else {
        setSelectedDepartment(null);
      }

      setCityQuery(entry.config.cityName);
      setSelectedCity({
        id: entry.config.cityId,
        name: entry.config.cityName,
      });

      setStreetQuery(entry.config.secondLevelName);
      setSelectedStreet({
        id: entry.config.secondLevelId,
        name: entry.config.secondLevelName,
      });

      setHouse(entry.config.house);
      setConfigError(null);
      setDialogVisible(true);
      ensureDepartmentsLoaded();
    },
    [ensureDepartmentsLoaded],
  );

  const closeDialog = () => {
    setDialogVisible(false);
    setConfigError(null);
  };

  const loadScheduleForConfig = React.useCallback(
    async (config: AddressConfig) => {
      const query = configToQuery(config);

      const now = new Date();
      const from = new Date(now);
      from.setDate(from.getDate() - 3);
      const fromIso = from.toISOString();

      let networkData: PowerScheduleItem[] = [];

      try {
        networkData = await fetchPowerSchedule(query);

        const addressTitle = makeAddressTitle(config);

        try {
          await persistPowerSchedule(config.id, addressTitle, networkData);
        } catch (e) {
          console.warn('[PowerBlock] failed to persist schedule', e);
        }

        try {
          await scheduleNextPowerOutageNotification(
            config.id,
            addressTitle,
            networkData,
          );
        } catch (e) {
          console.warn(
            '[PowerBlock] failed to schedule power notifications',
            e,
          );
        }
      } catch (e: any) {
        console.warn(
          '[PowerBlock] fetchPowerSchedule error, using DB fallback',
          e,
        );
      }

      try {
        const dbItems = await loadPowerScheduleFromDb(
          config.id,
          fromIso,
        );

        const finalItems =
          dbItems.length > 0 ? dbItems : networkData;

        setAddresses(prev =>
          prev.map(a =>
            a.config.id === config.id
              ? {
                ...a,
                items: finalItems,
                loading: false,
                error: finalItems.length
                  ? null
                  : 'Немає записів для вказаної адреси.',
              }
              : a,
          ),
        );
      } catch (e: any) {
        console.warn(
          '[PowerBlock] failed to load schedule from DB',
          e,
        );

        setAddresses(prev =>
          prev.map(a =>
            a.config.id === config.id
              ? {
                ...a,
                items: networkData,
                loading: false,
                error:
                  networkData.length === 0
                    ? e?.message ??
                    'Помилка завантаження графіка'
                    : null,
              }
              : a,
          ),
        );
      }
    },
    [],
  );

  React.useEffect(() => {
    (async () => {
      try {
        const saved = await getPowerAddresses();
        if (!saved || !saved.length) {
          return;
        }

        setAddresses(
          saved.map(cfg => ({
            config: cfg,
            items: [],
            loading: true,
            error: null,
          })),
        );

        saved.forEach(cfg => {
          void loadScheduleForConfig(cfg);
        });
      } catch (e) {
        console.warn('[PowerBlock] failed to load saved addresses', e);
      }
    })();
  }, [loadScheduleForConfig]);

  React.useEffect(() => {
    void setPowerAddresses(addresses.map(a => a.config));
  }, [addresses]);

  const handleDeleteAddress = (id: string) => {
    setAddresses(prev => prev.filter(a => a.config.id !== id));
  };

  const handleCityInputChange = async (text: string) => {
    setCityQuery(text);
    setSelectedCity(null);
    setSelectedStreet(null);
    setStreets([]);
    setStreetQuery('');
    setCities([]);

    if (!selectedDepartment) {
      return;
    }
    const trimmed = text.trim();
    if (trimmed.length < 2) {
      return;
    }

    try {
      setCityLoading(true);
      setConfigError(null);
      const res = await fetchCities(
        selectedDepartment.value,
        trimmed,
      );
      setCities(res);
    } catch (e: any) {
      setConfigError(e?.message || 'Помилка пошуку міст');
    } finally {
      setCityLoading(false);
    }
  };

  const handleSelectCity = (opt: SimpleOption) => {
    setSelectedCity(opt);
    setCityQuery(opt.name);
    setCities([]);
    setSelectedStreet(null);
    setStreets([]);
    setStreetQuery('');
  };

  const handleStreetInputChange = async (text: string) => {
    setStreetQuery(text);
    setSelectedStreet(null);
    setStreets([]);

    if (!selectedCity) {
      return;
    }
    const trimmed = text.trim();
    if (trimmed.length < 2) {
      return;
    }

    try {
      setStreetLoading(true);
      setConfigError(null);
      const res = await fetchAddressOptions(
        consumerKind,
        selectedCity.id,
        trimmed,
      );
      setStreets(res);
    } catch (e: any) {
      setConfigError(
        e?.message ||
        (consumerKind === 'business'
          ? 'Помилка пошуку юридичних осіб'
          : 'Помилка пошуку вулиць'),
      );
    } finally {
      setStreetLoading(false);
    }
  };

  const handleSelectStreet = (opt: SimpleOption) => {
    setSelectedStreet(opt);
    setStreetQuery(opt.name);
    setStreets([]);
  };

  const handleApplyConfig = async () => {
    if (!selectedCity) {
      setConfigError('Оберіть населений пункт');
      return;
    }
    if (!selectedStreet) {
      setConfigError(
        consumerKind === 'business'
          ? 'Оберіть юридичну особу'
          : 'Оберіть вулицю',
      );
      return;
    }

    setConfigError(null);
    setDialogVisible(false);

    const normalizedHouse = house.trim();
    const id =
      editingAddressId ??
      `addr-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;

    const config: AddressConfig = {
      id,
      consumerKind,
      departmentId: selectedDepartment?.value,
      departmentLabel: selectedDepartment?.label,
      cityId: selectedCity.id,
      cityName: selectedCity.name,
      secondLevelId: selectedStreet.id,
      secondLevelName: selectedStreet.name,
      house: normalizedHouse,
    };

    setAddresses(prev => {
      const idx = prev.findIndex(a => a.config.id === id);
      if (idx === -1) {
        return [
          ...prev,
          {
            config,
            items: [],
            loading: true,
            error: null,
          },
        ];
      }
      const copy = [...prev];
      copy[idx] = {
        ...copy[idx],
        config,
        items: [],
        loading: true,
        error: null,
      };
      return copy;
    });

    await loadScheduleForConfig(config);
  };

  const handleSelectHousehold = () => {
    setConsumerKind('household');
    setSelectedStreet(null);
    setStreets([]);
    setStreetQuery('');
  };

  const handleSelectBusiness = () => {
    setConsumerKind('business');
    setSelectedStreet(null);
    setStreets([]);
    setStreetQuery('');
  };

  const secondLevelLabel =
    consumerKind === 'business'
      ? 'Почніть вводити назву юридичної особи'
      : 'Почніть вводити назву вулиці';

  return (
    <>
      <Card style={styles.card} mode="elevated">
        <Card.Title
          title="Графік відключення світла"
          subtitle="Персональні графіки для Чернігова"
          titleVariant="titleMedium"
          right={props => (
            <IconButton
              {...props}
              icon="plus"
              onPress={openNewAddressDialog}
            />
          )}
        />

        <Card.Content>

          <Divider style={styles.divider} />

          {/* Empty state */}
          {addresses.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>
                Немає жодної адреси
              </Text>
              <Text style={styles.emptyText}>
                Додайте одну або кілька адрес, щоб відображати персональний
                графік відключення світла.
              </Text>
            </View>
          )}

          {/* Address cards */}
          {addresses.length > 0 && (
            <View style={styles.addressList}>
              {addresses.map((addr, idx) => {
                const itemsForDay =
                  selectedDate
                    ? addr.items.filter(item =>
                      isSameDayIso(item.start, selectedDate) ||
                      isSameDayIso(item.end, selectedDate),
                    )
                    : addr.items;

                const hasAnyItems = addr.items.length > 0;

                return (
                  <View
                    key={addr.config.id}
                    style={styles.addressBlock}>

                    <View style={styles.addressHeaderRow}>
                      <View style={styles.addressTitleRow}>
                        <IconButton
                          icon={
                            addr.config.consumerKind === 'business'
                              ? 'office-building'
                              : 'home-city-outline'
                          }
                          size={26}
                          disabled
                        />
                        <View style={styles.addressTitleWrapper}>
                          <Text style={styles.addressTitle}>
                            {makeAddressTitle(addr.config)}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Дії над адресою */}
                    <View style={styles.addressActionsRow}>
                      <View style={styles.addressActions}>
                        <IconButton
                          icon="tune-variant"
                          size={20}
                          onPress={() => openEditDialog(addr)}
                        />
                        <IconButton
                          icon="refresh"
                          size={20}
                          onPress={() => loadScheduleForConfig(addr.config)}
                          disabled={addr.loading}
                        />
                        <IconButton
                          icon="trash-can-outline"
                          size={20}
                          onPress={() => handleDeleteAddress(addr.config.id)}
                        />
                      </View>
                    </View>

                    {/* Loading */}
                    {addr.loading && (
                      <View style={styles.loadingRow}>
                        <ActivityIndicator />
                        <Text style={styles.loadingText}>
                          Отримуємо інформацію про можливі відключення…
                        </Text>
                      </View>
                    )}

                    {/* Error */}
                    {!addr.loading && addr.error && (
                      <View style={styles.errorCard}>
                        <Text style={styles.errorTitle}>Помилка</Text>
                        <Text style={styles.errorText}>
                          {addr.error}
                        </Text>
                      </View>
                    )}

                    {/* Немає графіка взагалі */}
                    {!addr.loading &&
                      !addr.error &&
                      !hasAnyItems && (
                        <View style={styles.emptyState}>
                          <Text style={styles.emptyTitle}>
                            Немає запланованих обмежень
                          </Text>
                          <Text style={styles.emptyText}>
                            Наразі для цієї адреси не знайдено жодного
                            запланованого відключення.
                          </Text>
                        </View>
                      )}

                    {/* Немає на обрану дату */}
                    {!addr.loading &&
                      !addr.error &&
                      hasAnyItems &&
                      itemsForDay.length === 0 && (
                        <View style={styles.emptyState}>
                          <Text style={styles.emptyTitle}>
                            На цю дату немає відключень
                          </Text>
                          <Text style={styles.emptyText}>
                            На обрану дату не знайдено запланованих обмежень.
                          </Text>
                        </View>
                      )}

                    {/* Список відключень */}
                    {!addr.loading &&
                      !addr.error &&
                      itemsForDay.length > 0 && (
                        <View style={styles.scheduleContainer}>
                          {!selectedDate && (
                            <Text style={styles.sectionTitle}>
                              Найближчі відключення
                            </Text>
                          )}

                          <Divider style={styles.sectionDivider} />

                          {itemsForDay.map(item => {
                            const from = extractTimeLabel(item.start);
                            const to = extractTimeLabel(item.end);
                            const duration = formatDuration(
                              item.start,
                              item.end,
                            );

                            return (
                              <View
                                key={item.id}
                                style={styles.item}>
                                <View style={styles.itemRow}>
                                  <IconButton
                                    icon="power-plug-off-outline"
                                    size={22}
                                    disabled
                                  />
                                  <View style={styles.timeBlock}>
                                    <Text style={styles.itemTime}>
                                      {from} — {to}
                                    </Text>
                                    {!!duration && (
                                      <Text style={styles.itemDuration}>
                                        {duration}
                                      </Text>
                                    )}
                                  </View>
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      )}

                    {idx < addresses.length - 1 && (
                      <Divider style={styles.addressDivider} />
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </Card.Content>
      </Card>

      <Portal>
        <Dialog visible={dialogVisible} onDismiss={closeDialog}>
          <Dialog.Title>Налаштування адреси</Dialog.Title>
          <Dialog.ScrollArea style={styles.dialogScrollArea}>
            <ScrollView>
              <Text style={styles.sectionLabel}>Тип об&apos;єкта</Text>
              <View style={styles.chipsRow}>
                <Chip
                  selected={consumerKind === 'household'}
                  onPress={handleSelectHousehold}
                  icon={
                    consumerKind === 'household' ? 'home' : undefined
                  }>
                  Побутові
                </Chip>
                <Chip
                  selected={consumerKind === 'business'}
                  onPress={handleSelectBusiness}
                  icon={
                    consumerKind === 'business'
                      ? 'office-building'
                      : undefined
                  }>
                  Юридичні
                </Chip>
              </View>

              <Text style={styles.sectionLabel}>Підрозділ</Text>
              {departLoading ? (
                <ActivityIndicator />
              ) : departError ? (
                <Text style={styles.errorText}>{departError}</Text>
              ) : (
                <Menu
                  visible={departMenuVisible}
                  onDismiss={() => setDepartMenuVisible(false)}
                  anchor={
                    <Pressable
                      onPress={() => {
                        setDepartMenuVisible(true);
                        ensureDepartmentsLoaded();
                      }}>
                      <TextInput
                        mode="outlined"
                        label="Підрозділ"
                        value={selectedDepartment?.label ?? ''}
                        editable={false}
                        pointerEvents="none"
                        right={
                          <TextInput.Icon
                            icon={
                              departMenuVisible ? 'menu-up' : 'menu-down'
                            }
                          />
                        }
                      />
                    </Pressable>
                  }>
                  {departments.map(dep => (
                    <Menu.Item
                      key={dep.value}
                      onPress={() => {
                        setSelectedDepartment(dep);
                        setDepartMenuVisible(false);

                        setCityQuery('');
                        setCities([]);
                        setSelectedCity(null);
                        setStreetQuery('');
                        setStreets([]);
                        setSelectedStreet(null);
                      }}
                      title={dep.label}
                    />
                  ))}
                </Menu>
              )}

              <Text style={styles.sectionLabel}>Населений пункт</Text>
              <TextInput
                mode="outlined"
                label="Назва міста / села"
                value={cityQuery}
                onChangeText={handleCityInputChange}
                right={
                  cityLoading ? (
                    <TextInput.Icon
                      icon={() => <ActivityIndicator size="small" />}
                    />
                  ) : undefined
                }
              />
              {cities.length > 0 && (
                <View style={styles.listContainer}>
                  {cities.map(city => (
                    <Button
                      key={city.id}
                      mode={
                        selectedCity?.id === city.id
                          ? 'contained-tonal'
                          : 'text'
                      }
                      onPress={() => handleSelectCity(city)}
                      style={styles.listItemBtn}
                      contentStyle={styles.listItemBtnContent}>
                      {city.name}
                    </Button>
                  ))}
                </View>
              )}

              <Text style={styles.sectionLabel}>
                {consumerKind === 'business'
                  ? 'Юридична особа'
                  : 'Вулиця'}
              </Text>
              <TextInput
                mode="outlined"
                label={secondLevelLabel}
                value={streetQuery}
                onChangeText={handleStreetInputChange}
                right={
                  streetLoading ? (
                    <TextInput.Icon
                      icon={() => <ActivityIndicator size="small" />}
                    />
                  ) : undefined
                }
              />
              {streets.length > 0 && (
                <View style={styles.listContainer}>
                  {streets.map(street => (
                    <Button
                      key={street.id}
                      mode={
                        selectedStreet?.id === street.id
                          ? 'contained-tonal'
                          : 'text'
                      }
                      onPress={() => handleSelectStreet(street)}
                      style={styles.listItemBtn}
                      contentStyle={styles.listItemBtnContent}>
                      {street.name}
                    </Button>
                  ))}
                </View>
              )}

              <Text style={styles.sectionLabel}>
                Номер будинку (фільтр, необовʼязково)
              </Text>
              <TextInput
                mode="outlined"
                label="Наприклад: 12 або 10-16"
                value={house}
                onChangeText={setHouse}
              />

              {configError && (
                <Text style={styles.errorText}>{configError}</Text>
              )}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={closeDialog}>Скасувати</Button>
            <Button onPress={handleApplyConfig}>
              Зберегти і оновити
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
};

export default PowerBlock;

const styles = StyleSheet.create({
  card: {
    marginTop: 12,
    borderRadius: 18,
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
  emptyState: {
    paddingVertical: 8,
  },
  emptyTitle: {
    fontWeight: '600',
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 13,
    color: '#666',
  },
  addressList: {
    marginTop: 4,
  },
  addressBlock: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
    backgroundColor: 'rgba(0,0,0,0.02)',
  },

  addressHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  addressTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addressTitleWrapper: {
    flex: 1,
    paddingRight: 8,
  },
  addressTitle: {
    fontWeight: '600',
    fontSize: 14,
    flexShrink: 1,
  },
  addressKindPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(33,150,243,0.08)',
  },
  addressKindText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#1976d2',
  },

  addressActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 4,
  },
  addressActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  addressDivider: {
    marginTop: 8,
    opacity: 0.4,
  },

  scheduleContainer: {
    marginTop: 4,
  },
  sectionTitle: {
    fontWeight: '600',
    marginTop: 4,
    marginBottom: 2,
  },
  sectionDivider: {
    marginBottom: 4,
    opacity: 0.5,
  },
  item: {
    paddingVertical: 4,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeBlock: {
    flexDirection: 'column',
  },
  itemTime: {
    fontSize: 16,
    fontWeight: '600',
  },
  itemDuration: {
    fontSize: 12,
    opacity: 0.7,
    marginTop: 2,
  },

  dialogScrollArea: {
    maxHeight: 420,
  },
  sectionLabel: {
    marginTop: 8,
    marginBottom: 4,
    fontWeight: '600',
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  listContainer: {
    marginTop: 4,
    borderRadius: 8,
  },
  listItemBtn: {
    justifyContent: 'flex-start',
  },
  listItemBtnContent: {
    justifyContent: 'flex-start',
  },
});