import React, { memo, useMemo, useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
} from 'react-native';
import { Smartphone, Tablet, Monitor, X, Minus } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, Easing } from 'react-native-reanimated';

import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useVPN } from '@/context/VPNContext';
import { useParentalControls } from '@/context/ParentalControlsContext';
import { SkeletonDeviceItem } from '@/components/ui/Skeleton';
import { DeviceSession } from '@/types/database';

const AnimatedView = Animated.createAnimatedComponent(View);

// Get device brand from device name
function getDeviceBrand(deviceName: string, deviceType: string): string {
  const name = deviceName.toLowerCase();

  // iOS devices
  if (name.includes('iphone')) return 'iPhone';
  if (name.includes('ipad')) return 'iPad';
  if (name.includes('ipod')) return 'iPod';

  // Android brands
  if (name.includes('samsung')) return 'Samsung';
  if (name.includes('pixel') || name.includes('google')) return 'Google Pixel';
  if (name.includes('oneplus')) return 'OnePlus';
  if (name.includes('xiaomi') || name.includes('redmi') || name.includes('poco')) return 'Xiaomi';
  if (name.includes('huawei')) return 'Huawei';
  if (name.includes('oppo')) return 'OPPO';
  if (name.includes('vivo')) return 'Vivo';
  if (name.includes('realme')) return 'Realme';
  if (name.includes('motorola') || name.includes('moto')) return 'Motorola';
  if (name.includes('lg')) return 'LG';
  if (name.includes('sony')) return 'Sony';
  if (name.includes('nokia')) return 'Nokia';
  if (name.includes('asus')) return 'ASUS';

  // Fallback based on type
  if (deviceType === 'ios') return 'iPhone';
  if (deviceType === 'android') return 'Android';

  // Use the device name if short enough, otherwise generic
  if (deviceName.length <= 20) return deviceName;
  return 'Device';
}

// Get OS display name
function getOSName(deviceType: string): string {
  switch (deviceType) {
    case 'ios': return 'iOS';
    case 'android': return 'Android';
    case 'web': return 'Web';
    case 'chrome': return 'Chrome';
    case 'firefox': return 'Firefox';
    default: return deviceType;
  }
}

// Get appropriate device icon
function getDeviceIcon(deviceType: string, deviceName: string) {
  const name = deviceName.toLowerCase();
  if (name.includes('ipad') || name.includes('tablet')) return Tablet;
  if (deviceType === 'web' || deviceType === 'chrome' || deviceType === 'firefox') return Monitor;
  return Smartphone;
}

interface DeviceItemProps {
  device: DeviceSession;
  isCurrentDevice: boolean;
  isMainDevice: boolean;
  canRemove: boolean;
  isVpnConnected?: boolean;
  isParentalEnabled?: boolean;
  isAdBlockEnabled?: boolean;
  onRemove?: () => void;
}

const DeviceItem = memo(function DeviceItem({
  device,
  isCurrentDevice,
  isMainDevice,
  canRemove,
  isVpnConnected,
  isParentalEnabled,
  isAdBlockEnabled,
  onRemove,
}: DeviceItemProps) {
  const { colors, isDark } = useTheme();

  const DeviceIcon = useMemo(
    () => getDeviceIcon(device.device_type, device.device_name),
    [device.device_type, device.device_name]
  );

  const deviceBrand = useMemo(
    () => getDeviceBrand(device.device_name, device.device_type),
    [device.device_name, device.device_type]
  );

  const osName = useMemo(
    () => getOSName(device.device_type),
    [device.device_type]
  );

  const deviceIconBg = useMemo(
    () => isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
    [isDark]
  );

  // Collect tags to display
  const tags = useMemo(() => {
    const result: Array<{ label: string; color: string; bgColor: string }> = [];

    if (isMainDevice) {
      result.push({
        label: 'Main device',
        color: colors.primary,
        bgColor: `${colors.primary}15`,
      });
    }

    if (isCurrentDevice) {
      result.push({
        label: 'This device',
        color: colors.textSecondary,
        bgColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
      });

      // Status badges only for current device
      if (isVpnConnected) {
        result.push({
          label: 'VPN',
          color: '#22C55E',
          bgColor: 'rgba(34, 197, 94, 0.15)',
        });
      }
      if (isParentalEnabled) {
        result.push({
          label: 'Control',
          color: '#3B82F6',
          bgColor: 'rgba(59, 130, 246, 0.15)',
        });
      }
      if (isAdBlockEnabled) {
        result.push({
          label: 'Ad Block',
          color: '#EF4444',
          bgColor: 'rgba(239, 68, 68, 0.15)',
        });
      }
    }

    return result;
  }, [isMainDevice, isCurrentDevice, isVpnConnected, isParentalEnabled, isAdBlockEnabled, colors, isDark]);

  // Determine if remove button should be shown
  const showRemoveButton = !isMainDevice && canRemove;
  const showDisabledIndicator = isMainDevice && canRemove; // Show — for main device when user is on main device

  return (
    <View style={styles.deviceItem}>
      <View style={[styles.deviceIcon, { backgroundColor: deviceIconBg }]}>
        <DeviceIcon size={20} color={colors.textSecondary} />
      </View>

      <View style={styles.deviceInfo}>
        {/* Line 1: Brand · OS */}
        <Text style={[styles.deviceBrand, { color: colors.text }]}>
          {deviceBrand} · {osName}
        </Text>

        {/* Line 2: Tags */}
        {tags.length > 0 && (
          <View style={styles.tagsRow}>
            {tags.map((tag, index) => (
              <View
                key={`${tag.label}-${index}`}
                style={[styles.tagBadge, { backgroundColor: tag.bgColor }]}
              >
                <Text style={[styles.tagText, { color: tag.color }]}>
                  {tag.label}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Remove button or disabled indicator */}
      {showRemoveButton && onRemove && (
        <Pressable
          onPress={onRemove}
          style={({ pressed }) => [
            styles.removeButton,
            pressed && { opacity: 0.7 },
          ]}
          hitSlop={8}
        >
          <X size={18} color={colors.error} />
        </Pressable>
      )}

      {showDisabledIndicator && (
        <View style={styles.disabledIndicator}>
          <Minus size={18} color={colors.textMuted} />
        </View>
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
    mainDevice,
    isCurrentDeviceMain,
    canManageDevices,
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

  // Sort devices: main device first, then current device, then by created_at
  const sortedDevices = useMemo(() => {
    return [...devices].sort((a, b) => {
      const aIsMain = mainDevice?.device_id === a.device_id;
      const bIsMain = mainDevice?.device_id === b.device_id;
      const aIsCurrent = deviceSession?.device_id === a.device_id;
      const bIsCurrent = deviceSession?.device_id === b.device_id;

      if (aIsMain && !bIsMain) return -1;
      if (!aIsMain && bIsMain) return 1;
      if (aIsCurrent && !bIsCurrent) return -1;
      if (!aIsCurrent && bIsCurrent) return 1;

      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }, [devices, mainDevice, deviceSession]);

  const handleRemoveDevice = useCallback((deviceId: string, deviceName: string) => {
    Alert.alert(
      'Remove Device?',
      `"${deviceName}" will be signed out and removed from your account.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const result = await removeDevice(deviceId);
            if (!result.success) {
              Alert.alert('Error', result.error || 'Couldn\'t remove device. Check your connection.');
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
          {deviceCount} of {maxDevices}
        </Text>
      </View>

      {/* Non-main device info message */}
      {!canManageDevices && devices.length > 1 && (
        <View style={[styles.infoMessage, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)' }]}>
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            Sign in from your main device to manage devices
          </Text>
        </View>
      )}

      {/* Device limit warning */}
      {deviceCount >= maxDevices && (
        <View style={[styles.warningMessage, { backgroundColor: 'rgba(234, 179, 8, 0.1)' }]}>
          <Text style={[styles.warningText, { color: '#EAB308' }]}>
            Device limit reached. Remove a device to add a new one.
          </Text>
        </View>
      )}

      <View style={styles.devicesList}>
        {isLoading ? (
          <>
            <SkeletonDeviceItem />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <SkeletonDeviceItem />
          </>
        ) : sortedDevices.length > 0 ? (
          sortedDevices.map((device, index) => {
            const isCurrentDevice = deviceSession?.device_id === device.device_id;
            const isMainDevice = mainDevice?.device_id === device.device_id;

            return (
              <View key={device.id}>
                {index > 0 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                <DeviceItem
                  device={device}
                  isCurrentDevice={isCurrentDevice}
                  isMainDevice={isMainDevice}
                  canRemove={canManageDevices}
                  isVpnConnected={isCurrentDevice ? isVpnConnected : false}
                  isParentalEnabled={isCurrentDevice ? isParentalEnabled : false}
                  isAdBlockEnabled={isCurrentDevice ? adBlockEnabled : false}
                  onRemove={
                    canManageDevices && !isMainDevice
                      ? () => handleRemoveDevice(device.device_id, device.device_name)
                      : undefined
                  }
                />
              </View>
            );
          })
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
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  deviceCount: {
    fontSize: 14,
    fontWeight: '500',
  },
  infoMessage: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 13,
    textAlign: 'center',
  },
  warningMessage: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 8,
  },
  warningText: {
    fontSize: 13,
    textAlign: 'center',
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
    gap: 4,
  },
  deviceBrand: {
    fontSize: 15,
    fontWeight: '500',
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  tagBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '600',
  },
  removeButton: {
    padding: 8,
  },
  disabledIndicator: {
    padding: 8,
    opacity: 0.5,
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
