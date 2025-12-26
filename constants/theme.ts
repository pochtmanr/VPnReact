// Standard Expo-style colors (dark theme)
export const colors = {
  // Primary colors
  primary: '#4F9CD6',
  primaryLight: '#4F9CD6',

  // Background colors (dark theme)
  background: '#151718',
  backgroundSecondary: '#1c1e1f',
  backgroundTertiary: '#242628',

  // Surface colors (for cards)
  surface: '#1c1e1f',
  surfaceLight: '#242628',
  surfaceBorder: '#333',

  // Text colors
  text: '#ECEDEE',
  textSecondary: '#9BA1A6',
  textMuted: '#687076',

  // Status colors
  success: '#34C759',
  warning: '#FF9500',
  error: '#FF3B30',
  info: '#4F9CD6',

  // Connection status
  connected: '#34C759',
  connecting: '#FF9500',
  disconnected: '#687076',

  // Border
  border: '#333',

  // Icon color
  icon: '#9BA1A6',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const borderRadius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
};

export const typography = {
  h1: {
    fontSize: 28,
    fontWeight: '700' as const,
  },
  h2: {
    fontSize: 22,
    fontWeight: '600' as const,
  },
  h3: {
    fontSize: 18,
    fontWeight: '600' as const,
  },
  body: {
    fontSize: 16,
    fontWeight: '400' as const,
  },
  bodySmall: {
    fontSize: 14,
    fontWeight: '400' as const,
  },
  caption: {
    fontSize: 12,
    fontWeight: '400' as const,
  },
  button: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
};

export const shadows = {
  card: {},
  soft: {},
};
