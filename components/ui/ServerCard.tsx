import React from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { VPNServer } from '@/types/database';

interface ServerCardProps {
  server: VPNServer;
  isSelected?: boolean;
  isConnected?: boolean;
  onPress: () => void;
  onFavorite?: () => void;
  isFavorite?: boolean;
}

const countryFlags: Record<string, string> = {
  US: '🇺🇸',
  UK: '🇬🇧',
  GB: '🇬🇧',
  DE: '🇩🇪',
  FR: '🇫🇷',
  JP: '🇯🇵',
  CA: '🇨🇦',
  AU: '🇦🇺',
  NL: '🇳🇱',
  SG: '🇸🇬',
  CH: '🇨🇭',
  SE: '🇸🇪',
};

export function ServerCard({
  server,
  isSelected,
  isConnected,
  onPress,
  onFavorite,
  isFavorite,
}: ServerCardProps) {
  const { colors } = useTheme();
  const flag = countryFlags[server.country_code] || '🌐';

  function getLatencyColor(latency: number | null): string {
    if (!latency) return colors.textMuted;
    if (latency < 50) return colors.success;
    if (latency < 100) return colors.success;
    if (latency < 200) return colors.warning;
    return colors.error;
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
        isSelected && {
          borderColor: colors.primary,
          backgroundColor: colors.surfaceLight,
        },
        isConnected && {
          borderColor: colors.success,
        },
        pressed && styles.pressed,
      ]}
    >
      <Text style={styles.flag}>{flag}</Text>

      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, { color: colors.text }]}>{server.city}</Text>
          {server.is_premium && (
            <View style={[styles.premiumBadge, { backgroundColor: colors.warning }]}>
              <Text style={styles.premiumText}>PRO</Text>
            </View>
          )}
        </View>
        <Text style={[styles.country, { color: colors.textSecondary }]}>{server.country}</Text>
      </View>

      <View style={styles.rightSection}>
        <Text style={[styles.latency, { color: getLatencyColor(server.latency_ms) }]}>
          {server.latency_ms ? `${server.latency_ms}ms` : '--'}
        </Text>

        {onFavorite && (
          <Pressable onPress={onFavorite} hitSlop={8} style={styles.favoriteButton}>
            <Ionicons
              name={isFavorite ? 'heart' : 'heart-outline'}
              size={20}
              color={isFavorite ? colors.error : colors.textMuted}
            />
          </Pressable>
        )}

        {isConnected && (
          <View style={[styles.connectedDot, { backgroundColor: colors.success }]} />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
  },
  pressed: {
    opacity: 0.7,
  },
  flag: {
    fontSize: 28,
    marginRight: spacing.md,
  },
  info: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  name: {
    ...typography.body,
    fontWeight: '500',
  },
  country: {
    ...typography.caption,
    marginTop: 2,
  },
  premiumBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  premiumText: {
    color: '#000',
    fontSize: 9,
    fontWeight: '700',
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  latency: {
    ...typography.caption,
    fontWeight: '500',
  },
  favoriteButton: {
    padding: spacing.xs,
  },
  connectedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
