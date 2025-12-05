import * as React from 'react';
import {useCallback, useEffect, useState} from 'react';
import {StyleSheet, View, ScrollView} from 'react-native';
import {
  ActivityIndicator,
  Button,
  Card,
  IconButton,
  Portal,
  Dialog,
  Text,
  TextInput,
  List,
  Chip,
} from 'react-native-paper';
import {WeatherLocation} from '../types';
import {
  fetchCurrentWeather,
  searchWeatherLocations,
} from '../services/weatherApi';

type SimpleWeather = {
  time: string;
  temperature?: number;
  humidity?: number;
  windSpeed?: number;
  symbolCode?: string;
};

type HourlyPoint = {
  time: string;
  temperature?: number;
  symbolCode?: string;
};

type WeatherBlockProps = {
  location: WeatherLocation | null;
  selectedDate?: Date;
  onLocationChange?: (loc: WeatherLocation) => void;
};

function mapSymbolToIcon(symbolCode?: string): string {
  const code = (symbolCode || '').toLowerCase();

  if (!code) return 'weather-partly-cloudy';

  if (code.includes('snow')) return 'weather-snowy';
  if (code.includes('rain') || code.includes('drizzle'))
    return 'weather-rainy';
  if (code.includes('sleet')) return 'weather-snowy-rainy';
  if (code.includes('thunder')) return 'weather-lightning';
  if (code.includes('fog') || code.includes('mist'))
    return 'weather-fog';
  if (code.includes('cloudy')) return 'weather-cloudy';
  if (code.includes('clearsky') || code.includes('fair'))
    return 'weather-sunny';

  return 'weather-partly-cloudy';
}

function formatLocalTime(utcIso: string | undefined): string {
  if (!utcIso) return '—';
  const d = new Date(utcIso);
  if (Number.isNaN(d.getTime())) return utcIso;
  return d.toLocaleTimeString('uk-UA', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

type HourlyWeatherItemProps = {
  point: HourlyPoint;
};

const HourlyWeatherItem: React.FC<HourlyWeatherItemProps> = ({point}) => {
  const iconName = mapSymbolToIcon(point.symbolCode);

  return (
    <View style={styles.hourItem}>
      <Text style={styles.hourItemTime}>
        {formatLocalTime(point.time)}
      </Text>
      <IconButton icon={iconName} size={22} disabled />
      <Text style={styles.hourItemTemp}>
        {point.temperature != null
          ? `${Math.round(point.temperature)}°`
          : '—'}
      </Text>
    </View>
  );
};

const WeatherBlock: React.FC<WeatherBlockProps> = ({
                                                     location,
                                                     selectedDate,
                                                     onLocationChange,
                                                   }) => {
  const [weather, setWeather] = useState<SimpleWeather | null>(null);
  const [hourly, setHourly] = useState<HourlyPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dialogVisible, setDialogVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<WeatherLocation[]>([]);

  const canConfigure = !!onLocationChange;

  const fetchWeather = useCallback(async () => {
    if (!location) {
      setWeather(null);
      setHourly([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setWeather(null);
      setHourly([]);

      const data = await fetchCurrentWeather(location);

      const simple: SimpleWeather = {
        time: data.time,
        temperature: data.temperature,
        humidity: data.humidity,
        windSpeed: data.windSpeed,
        symbolCode: data.symbolCode,
      };

      const mappedHourly: HourlyPoint[] =
        (data.hourly ?? []).map(h => ({
          time: h.time,
          temperature: h.temperature,
          symbolCode: h.symbolCode,
        }));

      setWeather(simple);
      setHourly(mappedHourly);
    } catch (e: any) {
      console.error('[WeatherBlock] fetch error', e);
      setError(e?.message ?? 'Помилка завантаження погоди');
    } finally {
      setLoading(false);
    }
  }, [location]);

  useEffect(() => {
    fetchWeather();
  }, [fetchWeather]);

  const openDialog = () => {
    setSearchQuery('');
    setSearchError(null);
    setResults([]);
    setDialogVisible(true);
  };

  const closeDialog = () => {
    setDialogVisible(false);
  };

  const handleSelectLocation = (loc: WeatherLocation) => {
    if (onLocationChange) {
      onLocationChange(loc);
    }
    setDialogVisible(false);
  };

  useEffect(() => {
    if (!dialogVisible) return;

    const query = searchQuery.trim();
    if (!query || query.length < 2) {
      setResults([]);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }

    let cancelled = false;

    const timeoutId = setTimeout(async () => {
      try {
        setSearchLoading(true);
        setSearchError(null);

        const mapped = await searchWeatherLocations(query);
        if (cancelled) return;

        setResults(mapped);
        if (!mapped.length) {
          setSearchError('Нічого не знайдено');
        }
      } catch (e: any) {
        console.error('[WeatherBlock] search error', e);
        if (!cancelled) {
          setSearchError(
            e?.message ??
            'Помилка пошуку міста через OpenStreetMap',
          );
        }
      } finally {
        if (!cancelled) {
          setSearchLoading(false);
        }
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [searchQuery, dialogVisible]);

  const visibleHourly = React.useMemo(() => {
    if (!selectedDate) {
      return hourly;
    }
    const target = selectedDate.toDateString();
    return hourly.filter(point => {
      const d = new Date(point.time);
      if (Number.isNaN(d.getTime())) {
        return false;
      }
      return d.toDateString() === target;
    });
  }, [hourly, selectedDate]);

  const headerWeather = React.useMemo<SimpleWeather | null>(() => {
    if (!weather) return null;
    if (!selectedDate) return weather;

    const today = new Date();

    if (selectedDate.toDateString() === today.toDateString()) {
      return weather;
    }

    if (visibleHourly.length === 0) {
      return weather;
    }

    const mid = visibleHourly[Math.floor(visibleHourly.length / 2)];

    return {
      time: mid.time,
      temperature: mid.temperature ?? weather.temperature,
      humidity: weather.humidity,
      windSpeed: weather.windSpeed,
      symbolCode: mid.symbolCode ?? weather.symbolCode,
    };
  }, [weather, selectedDate, visibleHourly]);

  const title =
    location?.name && location?.country
      ? `${location.name}, ${location.country}`
      : 'Місто не вибрано';

  const iconName = mapSymbolToIcon(headerWeather?.symbolCode);

  return (
    <>
      <Card style={styles.card} mode="elevated">
        <Card.Title
          title="Погода зараз"
          subtitle={title}
          titleVariant="titleMedium"
          right={props =>
            canConfigure ? (
              <View style={styles.titleRight}>
                <IconButton
                  {...props}
                  icon="tune-variant"
                  onPress={openDialog}
                />
                <IconButton
                  {...props}
                  icon="refresh"
                  onPress={fetchWeather}
                  disabled={loading || !location}
                />
              </View>
            ) : null
          }
        />
        <Card.Content>
          {!location && (
            <View>
              <Text style={styles.infoText}>
                Додайте місто, щоб бачити актуальну погоду.
              </Text>
              {canConfigure && (
                <Button
                  mode="contained-tonal"
                  onPress={openDialog}
                  style={styles.button}
                  icon="map-marker-plus-outline">
                  Обрати місто
                </Button>
              )}
            </View>
          )}

          {location && (
            <View>
              {loading && (
                <View style={styles.rowCenter}>
                  <ActivityIndicator />
                  <Text style={styles.infoText}>
                    Оновлення прогнозу…
                  </Text>
                </View>
              )}

              {error && !loading && (
                <Text style={styles.errorText}>{error}</Text>
              )}

              {headerWeather && !loading && !error && (
                <>
                  <View style={styles.mainRow}>
                    <View style={styles.mainTempBlock}>
                      <Text style={styles.mainTemp}>
                        {headerWeather.temperature != null
                          ? Math.round(headerWeather.temperature)
                          : '—'}
                        <Text style={styles.mainTempUnit}>°C</Text>
                      </Text>
                      <Text style={styles.mainDesc}>
                        Оновлено о {formatLocalTime(headerWeather.time)}
                      </Text>
                    </View>
                    <IconButton icon={iconName} size={40} disabled />
                  </View>

                  <View style={styles.chipsRow}>
                    <Chip
                      icon="water-percent"
                      style={styles.chip}
                      compact>
                      Вологість:{' '}
                      {headerWeather.humidity != null
                        ? `${headerWeather.humidity}%`
                        : '—'}
                    </Chip>
                    <Chip
                      icon="weather-windy"
                      style={styles.chip}
                      compact>
                      Вітер:{' '}
                      {headerWeather.windSpeed != null
                        ? `${headerWeather.windSpeed.toFixed(1)} м/с`
                        : '—'}
                    </Chip>
                  </View>

                  {visibleHourly.length > 0 && (
                    <View style={styles.hourlyContainer}>
                      <Text style={styles.hourlyTitle}>
                        Прогноз на добу
                      </Text>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={
                          styles.hourlyScrollContent
                        }>
                        {visibleHourly.map(point => (
                          <HourlyWeatherItem
                            key={point.time}
                            point={point}
                          />
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </>
              )}
            </View>
          )}
        </Card.Content>
      </Card>

      <Portal>
        <Dialog visible={dialogVisible} onDismiss={closeDialog}>
          <Dialog.Title>Налаштування місця</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.dialogHint}>
              Введіть назву міста українською або латиницею.
            </Text>
            <TextInput
              mode="outlined"
              label="Назва міста"
              value={searchQuery}
              onChangeText={text => setSearchQuery(text)}
              placeholder="Чернігів"
            />

            {searchLoading && (
              <View style={styles.searchLoadingRow}>
                <ActivityIndicator />
                <Text style={styles.infoText}>
                  Пошук міста…
                </Text>
              </View>
            )}

            {searchError && (
              <Text style={styles.errorText}>{searchError}</Text>
            )}

            {results.length > 0 && (
              <List.Section>
                {results.map(r => (
                  <List.Item
                    key={r.id}
                    title={`${r.name}, ${r.country}`}
                    description={`Координати: ${r.lat.toFixed(
                      2,
                    )}, ${r.lon.toFixed(2)}`}
                    onPress={() => handleSelectLocation(r)}
                    left={props => (
                      <List.Icon
                        {...props}
                        icon="map-marker-outline"
                      />
                    )}
                  />
                ))}
              </List.Section>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={closeDialog}>Скасувати</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
};

export default WeatherBlock;

const styles = StyleSheet.create({
  card: {
    marginTop: 12,
    borderRadius: 16,
  },
  titleRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoText: {
    marginTop: 4,
  },
  errorText: {
    marginTop: 4,
    color: '#d32f2f',
  },
  button: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  rowCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  mainTempBlock: {
    flexDirection: 'column',
  },
  mainTemp: {
    fontSize: 42,
    fontWeight: '700',
  },
  mainTempUnit: {
    fontSize: 24,
    fontWeight: '500',
  },
  mainDesc: {
    marginTop: 2,
    color: '#666',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    gap: 6,
  },
  chip: {
    borderRadius: 999,
  },
  hourlyContainer: {
    marginTop: 12,
  },
  hourlyTitle: {
    fontWeight: '600',
    marginBottom: 4,
  },
  hourlyScrollContent: {
    paddingVertical: 4,
  },
  hourItem: {
    width: 70,
    paddingVertical: 6,
    marginRight: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  hourItemTime: {
    fontSize: 12,
    marginBottom: 2,
  },
  hourItemTemp: {
    fontWeight: '600',
    marginTop: -4,
  },
  dialogHint: {
    marginBottom: 4,
    color: '#777',
  },
  searchLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
});