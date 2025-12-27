import React, { memo, useMemo, useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
} from 'react-native';
import { Smartphone, Trash2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, Easing } from 'react-native-reanimated';

import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useVPN } from '@/context/VPNContext';
import { useParentalControls } from '@/context/ParentalControlsContext';
import { SkeletonDeviceItem } from '@/components/ui/Skeleton';

const AnimatedView = Animated.createAnimatedComponent(View);

interface DeviceItemProps {
  deviceName: string;
  deviceType: string;
  lastActive: string;
  isCurrentDevice: boolean;
  isVpnConnected?: boolean;
  isParentalEnabled?: boolean;
  isAdBlockEnabled?: boolean;
  onRemove?: () => void;
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 5) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

const DeviceItem = memo(function DeviceItem({
  deviceName,
  deviceType,
  lastActive,
  isCurrentDevice,
  isVpnConnected,
  isParentalEnabled,
  isAdBlockEnabled,
  onRemove,
}: DeviceItemProps) {
  const { colors, isDark } = useTheme();

  const DeviceIcon = useMemo(() => {
    switch (deviceType) {
      case 'ios':
      case 'android':
        return Smartphone;
      default:
        return Smartphone;
    }
  }, [deviceType]);

  const timeAgo = useMemo(() => {
    const lastActiveDate = new Date(lastActive);
    return getTimeAgo(lastActiveDate);
  }, [lastActive]);

  const deviceIconBg = useMemo(
    () => isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
    [isDark]
  );

  const formattedDeviceType = useMemo(
    () => deviceType.charAt(0).toUpperCase() + deviceType.slice(1),
    [deviceType]
  );

  return (
    <View style={styles.deviceItem}>
      <View style={[styles.deviceIcon, { backgroundColor: deviceIconBg }]}>
        <DeviceIcon size={20} color={colors.textSecondary} />
      </View>
      <View style={styles.deviceInfo}>
        <View style={styles.deviceNameRow}>
          <Text style={[styles.deviceName, { color: colors.text }]}>{deviceName}</Text>
          {isCurrentDevice && (
            <View style={styles.badgesRow}>
              <View style={[styles.deviceBadge, { backgroundColor: `${colors.success}15` }]}>
                <Text style={[styles.deviceBadgeText, { color: colors.success }]}>This device</Text>
              </View>
              {isVpnConnected && (
                <View style={[styles.deviceBadge, { backgroundColor: 'rgba(34, 197, 94, 0.15)' }]}>
                  <Text style={[styles.deviceBadgeText, { color: '#22C55E' }]}>VPN</Text>
                </View>
              )}
              {isParentalEnabled && (
                <View style={[styles.deviceBadge, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                  <Text style={[styles.deviceBadgeText, { color: '#3B82F6' }]}>Control</Text>
                </View>
              )}
              {isAdBlockEnabled && (
                <View style={[styles.deviceBadge, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
                  <Text style={[styles.deviceBadgeText, { color: '#EF4444' }]}>Ad Block</Text>
                </View>
              )}
            </View>
          )}
        </View>
        <Text style={[styles.deviceMeta, { color: colors.textSecondary }]}>
          {formattedDeviceType} • {timeAgo}
        </Text>
      </View>
      {!isCurrentDevice && onRemove && (
        <Pressable onPress={onRemove} style={styles.removeButton}>
          <Trash2 size={18} color={colors.error} />
        </Pressable>
      )}
    </View>
  );
});

interface DevicesWidgetProps {
  cardStyle: { backgroundColor: string; borderColor: string };
  animationDelay?: number;
}

export const DevicesWidget = memo(function DevicesWidget({
  cardStyle,
  animationDelay = 150,
}: DevicesWidgetProps) {
  const { colors, isDark } = useTheme();
  const {
    devices,
    deviceSession,
    deviceCount,
    maxDevices,
    removeDevice,
  } = useAuth();
  const { connectionStatus, adBlockEnabled } = useVPN();
  const { isEnabled: isParentalEnabled } = useParentalControls();

  const [isLoading, setIsLoading] = useState(true);

  const isVpnConnected = connectionStatus === 'connected';

  // Simulate loading state (devices come from context, so just brief delay)
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 300);
    return () => clearTimeout(timer);
  }, []);

  const handleRemoveDevice = useCallback((deviceId: string, deviceName: string) => {
    Alert.alert(
      'Remove Device',
      `Are you sure you want to remove "${deviceName}" from your account?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const result = await removeDevice(deviceId);
            if (!result.success) {
              Alert.alert('Error', result.error || 'Failed to remove device');
            } else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
          },
        },
      ]
    );
  }, [removeDevice]);

  return (
    <AnimatedView
      entering={FadeInDown.delay(animationDelay).duration(300).easing(Easing.out(Easing.ease))}
      style={[styles.card, cardStyle]}
    >
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Devices</Text>
        <Text style={[styles.deviceCount, { color: colors.textSecondary }]}>
          {deviceCount}/{maxDevices}
        </Text>
      </View>

      <View style={styles.devicesList}>
        {isLoading ? (
          <>
            <SkeletonDeviceItem />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <SkeletonDeviceItem />
          </>
        ) : devices.length > 0 ? (
          devices.map((device, index) => (
            <View key={device.id}>
              {index > 0 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
              <DeviceItem
                deviceName={device.device_name}
                deviceType={device.device_type}
                lastActive={device.last_active_at}
                isCurrentDevice={deviceSession?.device_id === device.device_id}
                isVpnConnected={deviceSession?.device_id === device.device_id ? isVpnConnected : false}
                isParentalEnabled={deviceSession?.device_id === device.device_id ? isParentalEnabled : false}
                isAdBlockEnabled={deviceSession?.device_id === device.device_id ? adBlockEnabled : false}
                onRemove={() => handleRemoveDevice(device.device_id, device.device_name)}
              />
            </View>
          ))
        ) : (
          <Text style={[styles.noDevices, { color: colors.textSecondary }]}>
            No devices connected
          </Text>
        )}
      </View>
    </AnimatedView>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  deviceCount: {
    fontSize: 14,
    fontWeight: '500',
  },
  devicesList: {
    gap: 0,
  },
  deviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  deviceIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceInfo: {
    flex: 1,
  },
  deviceNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  deviceName: {
    fontSize: 15,
    fontWeight: '500',
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  deviceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  deviceBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  deviceMeta: {
    fontSize: 13,
    marginTop: 2,
  },
  removeButton: {
    padding: 8,
  },
  noDevices: {
    textAlign: 'center',
    paddingVertical: 20,
    fontSize: 14,
  },
  divider: {
    height: 1,
    marginLeft: 52,
  },
});
