import React from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { ConnectionStatus } from '@/types/database';

interface ConnectionToggleProps {
  status: ConnectionStatus;
  onPress: () => void;
  serverName?: string;
}

export function ConnectionToggle({ status, onPress, serverName }: ConnectionToggleProps) {
  const { colors } = useTheme();

  const statusConfig: Record<ConnectionStatus, { color: string; icon: keyof typeof Ionicons.glyphMap; text: string }> = {
    disconnected: { color: colors.textMuted, icon: 'shield-outline', text: 'Disconnected' },
    connecting: { color: colors.warning, icon: 'shield-outline', text: 'Connecting...' },
    connected: { color: colors.success, icon: 'shield-checkmark', text: 'Connected' },
    disconnecting: { color: colors.warning, icon: 'shield-outline', text: 'Disconnecting...' },
    error: { color: colors.error, icon: 'warning-outline', text: 'Connection Error' },
  };

  const config = statusConfig[status];
  const isActive = status === 'connecting' || status === 'disconnecting';
  const isConnected = status === 'connected';

  return (
    <View style={styles.container}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.iconContainer, { borderColor: config.color, backgroundColor: colors.surfaceLight }]}>
          <Ionicons name={config.icon} size={48} color={config.color} />
        </View>

        <Text style={[styles.statusText, { color: config.color }]}>
          {config.text}
        </Text>

        {serverName && (
          <View style={styles.serverInfo}>
            <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
            <Text style={[styles.serverName, { color: colors.textSecondary }]}>{serverName}</Text>
          </View>
        )}

        <Pressable
          onPress={onPress}
          disabled={isActive}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: isConnected ? colors.error : colors.primary },
            pressed && styles.buttonPressed,
            isActive && styles.buttonDisabled,
          ]}
        >
          <Text style={styles.buttonText}>
            {isActive ? (isConnected ? 'Disconnecting...' : 'Connecting...') :
             isConnected ? 'Disconnect' : 'Connect'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: '100%',
  },
  card: {
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    width: '100%',
    borderWidth: 1,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    borderWidth: 2,
  },
  statusText: {
    ...typography.h3,
    marginBottom: spacing.xs,
  },
  serverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    gap: 4,
  },
  serverName: {
    ...typography.bodySmall,
  },
  button: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    minWidth: 140,
    alignItems: 'center',
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    ...typography.button,
  },
});
