// src/services/themeContext.ts
import React from 'react';

export type ThemeMode = 'light' | 'dark';

export interface ThemeContextValue {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
}

export const ThemeContext = React.createContext<ThemeContextValue>({
  themeMode: 'light',
  setThemeMode: () => {},
});