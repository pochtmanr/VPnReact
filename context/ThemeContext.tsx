import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useColorScheme, Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeColors {
  primary: string;
  primaryLight: string;
  background: string;
  backgroundSecondary: string;
  backgroundTertiary: string;
  surface: string;
  surfaceLight: string;
  surfaceBorder: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  connected: string;
  connecting: string;
  disconnected: string;
  border: string;
  icon: string;
}

interface ThemeContextType {
  themeMode: ThemeMode;
  isDark: boolean;
  colors: ThemeColors;
  setThemeMode: (mode: ThemeMode) => void;
}

const darkColors: ThemeColors = {
  primary: '#3B82F6',
  primaryLight: '#60A5FA',
  background: '#151718',
  backgroundSecondary: '#1c1e1f',
  backgroundTertiary: '#242628',
  surface: '#1c1e1f',
  surfaceLight: '#242628',
  surfaceBorder: '#333',
  text: '#ECEDEE',
  textSecondary: '#9BA1A6',
  textMuted: '#687076',
  success: '#22C55E',
  warning: '#FF9500',
  error: '#EF4444',
  info: '#3B82F6',
  connected: '#22C55E',
  connecting: '#3B82F6',
  disconnected: '#687076',
  border: '#333',
  icon: '#9BA1A6',
};

const lightColors: ThemeColors = {
  primary: '#3B82F6',
  primaryLight: '#60A5FA',
  background: '#FFFFFF',
  backgroundSecondary: '#F2F2F7',
  backgroundTertiary: '#E5E5EA',
  surface: '#FFFFFF',
  surfaceLight: '#F2F2F7',
  surfaceBorder: '#C6C6C8',
  text: '#000000',
  textSecondary: '#3C3C43',
  textMuted: '#8E8E93',
  success: '#22C55E',
  warning: '#FF9500',
  error: '#EF4444',
  info: '#3B82F6',
  connected: '#22C55E',
  connecting: '#3B82F6',
  disconnected: '#8E8E93',
  border: '#C6C6C8',
  icon: '#8E8E93',
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'app_theme_mode';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [isLoading, setIsLoading] = useState(true);

  // Load saved theme preference
  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then((savedMode) => {
      if (savedMode && ['light', 'dark', 'system'].includes(savedMode)) {
        setThemeModeState(savedMode as ThemeMode);
      }
      setIsLoading(false);
    });
  }, []);

  // Determine if dark mode based on theme mode and system preference
  const isDark = themeMode === 'system'
    ? systemColorScheme === 'dark'
    : themeMode === 'dark';

  const colors = isDark ? darkColors : lightColors;

  const setThemeMode = async (mode: ThemeMode) => {
    setThemeModeState(mode);
    await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
  };

  if (isLoading) {
    return null;
  }

  return (
    <ThemeContext.Provider value={{ themeMode, isDark, colors, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

// Export color types for use elsewhere
export type { ThemeColors, ThemeMode };
