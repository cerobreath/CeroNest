// src/services/theme.ts
import {MD3DarkTheme, MD3LightTheme} from 'react-native-paper';

export const lightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#4f9cff',
    secondary: '#03dac6',
    background: '#f5f5f5',
    surface: '#ffffff',
  },
};

export const darkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#4f9cff',
    secondary: '#03dac6',
  },
};