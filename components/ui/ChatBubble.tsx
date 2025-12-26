import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { ConnectionLog } from '@/types/database';

interface ChatBubbleProps {
  log: ConnectionLog;
  index: number;
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}h ${remainingMins}m`;
}

export function ChatBubble({ log }: ChatBubbleProps) {
  const { colors } = useTheme();

  const statusIcons: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
    connecting: { icon: 'sync-outline', color: colors.warning },
    connected: { icon: 'checkmark-circle', color: colors.success },
    disconnecting: { icon: 'sync-outline', color: colors.warning },
    disconnected: { icon: 'close-circle', color: colors.textMuted },
    error: { icon: 'alert-circle', color: colors.error },
  };

  const statusConfig = statusIcons[log.status] || statusIcons.disconnected;

  return (
    <View style={styles.wrapper}>
      <View style={styles.timeContainer}>
        <Text style={[styles.time, { color: colors.textMuted }]}>{formatTime(log.created_at)}</Text>
      </View>

      <View
        style={[
          styles.container,
          { backgroundColor: colors.surface, borderColor: colors.border },
          log.status === 'connected' && {
            backgroundColor: `${colors.success}10`,
            borderColor: `${colors.success}30`,
          },
          log.status === 'error' && {
            backgroundColor: `${colors.error}10`,
            borderColor: `${colors.error}30`,
          },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.statusContainer}>
            <Ionicons
              name={statusConfig.icon}
              size={16}
              color={statusConfig.color}
            />
            <Text style={[styles.status, { color: statusConfig.color }]}>
              {log.status.charAt(0).toUpperCase() + log.status.slice(1)}
            </Text>
          </View>
        </View>

        <Text style={[styles.message, { color: colors.text }]}>{log.message}</Text>

        {(log.bytes_sent > 0 || log.bytes_received > 0 || log.duration_seconds > 0) && (
          <View style={[styles.stats, { borderTopColor: colors.border }]}>
            {log.duration_seconds > 0 && (
              <View style={styles.stat}>
                <Ionicons name="time-outline" size={12} color={colors.textSecondary} />
                <Text style={[styles.statText, { color: colors.textSecondary }]}>{formatDuration(log.duration_seconds)}</Text>
              </View>
            )}
            {log.bytes_sent > 0 && (
              <View style={styles.stat}>
                <Ionicons name="arrow-up-outline" size={12} color={colors.success} />
                <Text style={[styles.statText, { color: colors.textSecondary }]}>{formatBytes(log.bytes_sent)}</Text>
              </View>
            )}
            {log.bytes_received > 0 && (
              <View style={styles.stat}>
                <Ionicons name="arrow-down-outline" size={12} color={colors.primary} />
                <Text style={[styles.statText, { color: colors.textSecondary }]}>{formatBytes(log.bytes_received)}</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.md,
  },
  timeContainer: {
    marginBottom: spacing.xs,
    paddingLeft: spacing.sm,
  },
  time: {
    ...typography.caption,
  },
  container: {
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  status: {
    ...typography.caption,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  message: {
    ...typography.bodySmall,
    lineHeight: 20,
  },
  stats: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    ...typography.caption,
  },
});
