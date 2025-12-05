import * as React from 'react';
import {useEffect, useState} from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {Provider as PaperProvider} from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {RootNavigator} from './src/navigation/RootNavigator';
import {lightTheme, darkTheme} from './src/services/theme';
import {ThemeContext, ThemeMode} from './src/services/themeContext';

const SETTINGS_KEY = 'ceronest:settings';

interface StoredSettings {
  themeMode?: ThemeMode;
}

const App = () => {
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SETTINGS_KEY);
        if (!raw) {
          return;
        }
        const parsed: StoredSettings = JSON.parse(raw);
        if (parsed.themeMode === 'dark' || parsed.themeMode === 'light') {
          setThemeMode(parsed.themeMode);
        }
      } catch (e) {
        console.warn('[App] failed to load settings', e);
      }
    })();
  }, []);

  const paperTheme = themeMode === 'dark' ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider value={{themeMode, setThemeMode}}>
      <PaperProvider theme={paperTheme}>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </PaperProvider>
    </ThemeContext.Provider>
  );
};

export default App;