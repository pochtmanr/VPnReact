import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';

import { useTheme } from '@/context/ThemeContext';

export function LoadingScreen() {
  const { colors, isDark } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={[styles.text, { color: colors.textMuted }]}>Loading...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    marginTop: 16,
    fontSize: 15,
    fontWeight: '500',
  },
});
