// src/screens/DashboardScreen.tsx
import * as React from 'react';
import {StyleSheet, ScrollView, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Snackbar, Divider, IconButton, useTheme} from 'react-native-paper';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/RootNavigator';
import AppHeader from '../components/AppHeader';
import DayStrip from '../components/DayStrip';
import WeatherBlock from '../components/WeatherBlock';
import PowerBlock from '../components/PowerBlock';
import DevicesBlock from '../components/DevicesBlock';
import {BlockId, BlocksConfig, WeatherLocation} from '../types';
import {
  getBlocksConfig,
  setBlocksConfig,
  getWeatherLocation,
} from '../services/storage';
import {hasInternet} from '../services/network';

type Props = NativeStackScreenProps<RootStackParamList, 'Dashboard'>;

const IsolatedWeatherBlock = React.memo<{
  location: WeatherLocation | null;
  selectedDate: Date;
  onLocationChange: (loc: WeatherLocation | null) => void;
}>(
  ({location, selectedDate, onLocationChange}) => {
    return (
      <WeatherBlock
        location={location}
        selectedDate={selectedDate}
        onLocationChange={onLocationChange}
      />
    );
  },
  (prev, next) => {
    return (
      prev.location === next.location &&
      prev.selectedDate.getTime() === next.selectedDate.getTime() &&
      prev.onLocationChange === next.onLocationChange
    );
  },
);

const IsolatedPowerBlock = React.memo<{selectedDate: Date}>(
  ({selectedDate}) => {
    return <PowerBlock selectedDate={selectedDate} />;
  },
  (prev, next) => {
    return prev.selectedDate.getTime() === next.selectedDate.getTime();
  },
);

const IsolatedDevicesBlock = React.memo(() => {
  return <DevicesBlock />;
});

const BlockWithReorder: React.FC<{
  children: React.ReactNode;
  showButtons: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}> = ({
        children,
        showButtons,
        canMoveUp,
        canMoveDown,
        onMoveUp,
        onMoveDown,
      }) => {
  if (!showButtons) {
    return <View style={styles.blockContainer}>{children}</View>;
  }

  return (
    <View style={styles.reorderWrapper}>
      <View style={styles.reorderButtons}>
        <IconButton
          icon="arrow-up"
          size={18}
          disabled={!canMoveUp}
          onPress={onMoveUp}
        />
        <IconButton
          icon="arrow-down"
          size={18}
          disabled={!canMoveDown}
          onPress={onMoveDown}
        />
      </View>
      <View style={styles.reorderBlock}>{children}</View>
    </View>
  );
};

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

const DEFAULT_BLOCK_ORDER: BlockId[] = ['weather', 'power', 'devices'];

const DashboardScreen: React.FC<Props> = ({navigation}) => {
  const theme = useTheme();

  const [date, setDate] = React.useState(new Date());
  const today = startOfDay(new Date());
  const isFutureSelected =
    startOfDay(date).getTime() > today.getTime();

  const [config, setConfig] = React.useState<BlocksConfig>({
    enabled: [],
  });
  const [weatherLocation, setWeatherLocation] =
    React.useState<WeatherLocation | null>(null);

  const [isEditMode, setIsEditMode] = React.useState(false);

  const [snackbar, setSnackbar] = React.useState<{
    visible: boolean;
    message: string;
  }>({visible: false, message: ''});

  const weatherBlockRef = React.useRef<React.ReactElement | null>(null);
  const powerBlockRef = React.useRef<React.ReactElement | null>(null);
  const devicesBlockRef = React.useRef<React.ReactElement | null>(null);

  React.useEffect(() => {
    (async () => {
      const [storedConfig, loc] = await Promise.all([
        getBlocksConfig(),
        getWeatherLocation(),
      ]);

      const enabled =
        storedConfig.enabled && storedConfig.enabled.length > 0
          ? storedConfig.enabled
          : DEFAULT_BLOCK_ORDER;

      const normalized: BlocksConfig = {enabled};
      setConfig(normalized);

      if (!storedConfig.enabled || storedConfig.enabled.length === 0) {
        void setBlocksConfig(normalized);
      }

      if (loc) {
        setWeatherLocation(loc);
      }
    })();
  }, []);

  const moveBlock = React.useCallback(
    (id: BlockId, direction: 'up' | 'down') => {
      setConfig(prev => {
        const enabled = [...prev.enabled];
        const index = enabled.indexOf(id);
        if (index === -1) {
          return prev;
        }

        const newIndex = direction === 'up' ? index - 1 : index + 1;

        if (newIndex < 0 || newIndex >= enabled.length) {
          return prev;
        }

        const updated = [...enabled];
        const [item] = updated.splice(index, 1);
        updated.splice(newIndex, 0, item);

        const next: BlocksConfig = {enabled: updated};
        void setBlocksConfig(next);
        return next;
      });
    },
    [],
  );

  const handlePressSettings = React.useCallback(() => {
    navigation.navigate('Settings');
  }, [navigation]);

  const handlePressEdit = React.useCallback(() => {
    setIsEditMode(prev => {
      const next = !prev;
      setSnackbar({
        visible: true,
        message: next
          ? 'Режим редагування: використовуйте стрілки, щоб змінити порядок блоків.'
          : 'Редагування порядку блоків завершено.',
      });
      return next;
    });
  }, []);

  const checkOfflineToast = React.useCallback(async () => {
    const online = await hasInternet();
    if (!online) {
      setSnackbar({
        visible: true,
        message:
          'Немає Інтернету — використовуються лише локальні дані (де доступно).',
      });
    }
  }, []);

  React.useEffect(() => {
    checkOfflineToast();
  }, [checkOfflineToast]);

  const handleLocationChange = React.useCallback(
    (loc: WeatherLocation | null) => {
      setWeatherLocation(loc);
    },
    [],
  );

  if (!weatherBlockRef.current) {
    weatherBlockRef.current = (
      <IsolatedWeatherBlock
        location={weatherLocation}
        selectedDate={date}
        onLocationChange={handleLocationChange}
      />
    );
  }

  if (!powerBlockRef.current) {
    powerBlockRef.current = <IsolatedPowerBlock selectedDate={date} />;
  }

  if (!devicesBlockRef.current) {
    devicesBlockRef.current = <IsolatedDevicesBlock />;
  }

  const currentWeatherBlock = React.useMemo(
    () => (
      <IsolatedWeatherBlock
        location={weatherLocation}
        selectedDate={date}
        onLocationChange={handleLocationChange}
      />
    ),
    [weatherLocation, date, handleLocationChange],
  );

  const currentPowerBlock = React.useMemo(
    () => <IsolatedPowerBlock selectedDate={date} />,
    [date],
  );

  const currentDevicesBlock = React.useMemo(
    () => <IsolatedDevicesBlock />,
    [],
  );

  const enabledIds =
    config.enabled && config.enabled.length > 0
      ? config.enabled
      : DEFAULT_BLOCK_ORDER;

  const visibleIds = isFutureSelected
    ? enabledIds.filter(id => id !== 'devices')
    : enabledIds;

  const getBlockContent = React.useCallback(
    (id: BlockId) => {
      switch (id) {
        case 'weather':
          return currentWeatherBlock;
        case 'power':
          return currentPowerBlock;
        case 'devices':
          return currentDevicesBlock;
        default:
          return null;
      }
    },
    [currentWeatherBlock, currentPowerBlock, currentDevicesBlock],
  );

  return (
    <SafeAreaView
      style={[styles.safe, {backgroundColor: theme.colors.background}]}>
      <AppHeader
        onPressSettings={handlePressSettings}
        onPressEdit={handlePressEdit}
        isEditing={isEditMode}
        selectedDate={date}
      />

      <DayStrip selectedDate={date} onChangeSelectedDate={setDate} />

      <Divider style={styles.divider} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}>
        {visibleIds.map((id, index) => (
          <BlockWithReorder
            key={id}
            showButtons={isEditMode}
            canMoveUp={index > 0}
            canMoveDown={index < visibleIds.length - 1}
            onMoveUp={() => moveBlock(id, 'up')}
            onMoveDown={() => moveBlock(id, 'down')}>
            {getBlockContent(id)}
          </BlockWithReorder>
        ))}
      </ScrollView>

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() =>
          setSnackbar(prev => ({...prev, visible: false}))
        }
        duration={3500}>
        {snackbar.message}
      </Snackbar>
    </SafeAreaView>
  );
};

export default DashboardScreen;

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  divider: {
    marginHorizontal: 16,
    marginBottom: 4,
    opacity: 0.4,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  blockContainer: {
    marginBottom: 0,
  },
  reorderWrapper: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  reorderButtons: {
    justifyContent: 'center',
  },
  reorderBlock: {
    flex: 1,
  },
});
