import * as Haptics from 'expo-haptics';
import { ChevronDown, Monitor, Smartphone, Tablet, X } from 'lucide-react-native';
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

import { SkeletonDeviceItem } from '@/components/ui/Skeleton';
import { useAuth } from '@/context/AuthContext';
import { useParentalControls } from '@/context/ParentalControlsContext';
import { useTheme } from '@/context/ThemeContext';
import { useVPN } from '@/context/VPNContext';
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

interface DeviceAccordionItemProps {
  device: DeviceSession;
  isCurrentDevice: boolean;
  isMainDevice: boolean;
  canRemove: boolean;
  isVpnConnected?: boolean;
  isParentalEnabled?: boolean;
  isAdBlockEnabled?: boolean;
  onRemove?: () => void;
  translations: {
    mainDevice: string;
    thisDevice: string;
    vpn: string;
    filter: string;
    adBlock: string;
  };
  isLast: boolean;
}

const DeviceAccordionItem = memo(function DeviceAccordionItem({
  device,
  isCurrentDevice,
  isMainDevice,
  canRemove,
  isVpnConnected,
  isParentalEnabled,
  isAdBlockEnabled,
  onRemove,
  translations,
  isLast,
}: DeviceAccordionItemProps) {
  const { colors, isDark } = useTheme();
  const [isExpanded, setIsExpanded] = useState(false);

  // Animated rotation for chevron
  const rotation = useSharedValue(0);

  const toggleExpanded = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded(prev => !prev);
    rotation.value = withTiming(isExpanded ? 0 : 180, { duration: 200 });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [isExpanded, rotation]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

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

  // Collect status dots for collapsed view (only for current device)
  const statusDots = useMemo(() => {
    if (!isCurrentDevice) return [];
    const dots: Array<{ color: string; key: string }> = [];
    if (isVpnConnected) dots.push({ color: '#22C55E', key: 'vpn' });
    if (isParentalEnabled) dots.push({ color: '#3B82F6', key: 'parental' });
    if (isAdBlockEnabled) dots.push({ color: '#EF4444', key: 'adblock' });
    return dots;
  }, [isCurrentDevice, isVpnConnected, isParentalEnabled, isAdBlockEnabled]);

  // Collect tags to display (only in expanded view)
  const tags = useMemo(() => {
    const result: Array<{ label: string; color: string; bgColor: string }> = [];

    if (isMainDevice) {
      // Main device badge (blue) - takes priority
      result.push({
        label: translations.mainDevice,
        color: colors.primary,
        bgColor: `${colors.primary}15`,
      });
    } else if (isCurrentDevice) {
      // Only show "This Device" badge if it's NOT the main device
      result.push({
        label: translations.thisDevice,
        color: colors.textSecondary,
        bgColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
      });
    }

    // Status badges only for current device
    if (isCurrentDevice) {
      if (isVpnConnected) {
        result.push({
          label: translations.vpn,
          color: '#22C55E',
          bgColor: 'rgba(34, 197, 94, 0.15)',
        });
      }
      if (isParentalEnabled) {
        result.push({
          label: translations.filter,
          color: '#3B82F6',
          bgColor: 'rgba(59, 130, 246, 0.15)',
        });
      }
      if (isAdBlockEnabled) {
        result.push({
          label: translations.adBlock,
          color: '#EF4444',
          bgColor: 'rgba(239, 68, 68, 0.15)',
        });
      }
    }

    return result;
  }, [isMainDevice, isCurrentDevice, isVpnConnected, isParentalEnabled, isAdBlockEnabled, colors, isDark, translations]);

  // Determine if remove button should be shown (only in expanded view)
  const showRemoveButton = isExpanded && !isMainDevice && canRemove;
  const showDisabledIndicator = isExpanded && isMainDevice && canRemove;

  return (
    <View>
      {/* Trigger/Header - Always visible */}
      <Pressable onPress={toggleExpanded} style={styles.accordionTrigger}>
        <View style={[styles.deviceIcon, { backgroundColor: deviceIconBg }]}>
          <DeviceIcon size={20} color={colors.textSecondary} />
        </View>

        <View style={styles.deviceInfo}>
          <View style={styles.deviceNameRow}>
            <Text style={[styles.deviceBrand, { color: colors.text }]} numberOfLines={1}>
              {deviceBrand}
            </Text>
            <Text style={[styles.deviceOsInline, { color: colors.textSecondary }]}>
              {' '}· {osName}
            </Text>

            {/* Status dots in collapsed view */}
            {!isExpanded && statusDots.length > 0 && (
              <View style={styles.statusDotsRow}>
                {statusDots.map((dot) => (
                  <View
                    key={dot.key}
                    style={[styles.statusDot, { backgroundColor: dot.color }]}
                  />
                ))}
              </View>
            )}
          </View>
        </View>

        {/* Chevron indicator */}
        <AnimatedView style={[styles.chevronContainer, chevronStyle]}>
          <ChevronDown size={18} color={colors.textSecondary} />
        </AnimatedView>
      </Pressable>

      {/* Expanded content */}
      {isExpanded && (
        <View style={styles.accordionContent}>
          {/* Tags */}
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

          {/* Actions row */}
          {(showRemoveButton || showDisabledIndicator) && (
            <View style={styles.actionsRow}>
              {showRemoveButton && onRemove && (
                <Pressable
                  onPress={onRemove}
                  style={({ pressed }) => [
                    styles.removeButton,
                    { backgroundColor: 'rgba(239, 68, 68, 0.1)' },
                    pressed && { opacity: 0.7 },
                  ]}
                  hitSlop={8}
                >
                  <X size={16} color={colors.error} />
                  <Text style={[styles.removeButtonText, { color: colors.error }]}>
                    Remove
                  </Text>
                </Pressable>
              )}

            </View>
          )}
        </View>
      )}

      {/* Divider - only if not last item */}
      {!isLast && (
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
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
  const { t } = useTranslation();
  const {
    devices,
    deviceSession,
    deviceCount,
    maxDevices,
    removeDevice,
    mainDevice,
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

  // Memoize translations for DeviceItem to avoid re-renders
  const deviceItemTranslations = useMemo(() => ({
    mainDevice: t('profile.devices.mainDevice'),
    thisDevice: t('profile.devices.thisDevice'),
    vpn: t('profile.devices.vpn'),
    filter: t('profile.devices.filter'),
    adBlock: t('profile.devices.adBlock'),
  }), [t]);

  const handleRemoveDevice = useCallback((deviceId: string, deviceName: string) => {
    Alert.alert(
      t('profile.devices.removeTitle'),
      t('profile.devices.removeMessage', { name: deviceName }),
      [
        { text: t('common.buttons.cancel'), style: 'cancel' },
        {
          text: t('common.buttons.confirm'),
          style: 'destructive',
          onPress: async () => {
            const result = await removeDevice(deviceId);
            if (!result.success) {
              Alert.alert(t('common.status.error'), result.error || t('profile.devices.removeError'));
            } else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
          },
        },
      ]
    );
  }, [removeDevice, t]);

  return (
    <AnimatedView
      entering={FadeInDown.delay(animationDelay).duration(300).easing(Easing.out(Easing.ease))}
      style={[styles.card, cardStyle]}
    >
      {/* Header */}
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('profile.devices.title')}</Text>
        <Text style={[styles.deviceCount, { color: colors.textSecondary }]}>
          {deviceCount} / {maxDevices}
        </Text>
      </View>

      {/* Non-main device info message */}
      {!canManageDevices && devices.length > 1 && (
        <View style={[styles.infoMessage, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)' }]}>
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            {t('profile.devices.manageFromMain')}
          </Text>
        </View>
      )}

      {/* Device limit warning */}
      {deviceCount >= maxDevices && (
        <View style={[styles.warningMessage, { backgroundColor: 'rgba(234, 179, 8, 0.1)' }]}>
          <Text style={[styles.warningText, { color: '#EAB308' }]}>
            {t('profile.devices.limitReached')}
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
              <DeviceAccordionItem
                key={device.id}
                device={device}
                isCurrentDevice={isCurrentDevice}
                isMainDevice={isMainDevice}
                canRemove={canManageDevices}
                isVpnConnected={isCurrentDevice ? isVpnConnected : false}
                isParentalEnabled={isCurrentDevice ? isParentalEnabled : false}
                isAdBlockEnabled={isCurrentDevice ? adBlockEnabled : false}
                translations={deviceItemTranslations}
                isLast={index === sortedDevices.length - 1}
                onRemove={
                  canManageDevices && !isMainDevice
                    ? () => handleRemoveDevice(device.device_id, device.device_name)
                    : undefined
                }
              />
            );
          })
        ) : (
          <Text style={[styles.noDevices, { color: colors.textSecondary }]}>
            {t('profile.devices.noDevices')}
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
  infoMessage: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  infoText: {
    fontSize: 13,
    textAlign: 'center',
  },
  warningMessage: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  warningText: {
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '500',
  },
  devicesList: {
    gap: 0,
  },
  // Accordion Item styles
  accordionTrigger: {
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
    flexWrap: 'nowrap',
  },
  deviceBrand: {
    fontSize: 15,
    fontWeight: '500',
    flexShrink: 1,
  },
  deviceOsInline: {
    fontSize: 14,
    flexShrink: 0,
  },
  statusDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginStart: 8,
    gap: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chevronContainer: {
    padding: 4,
  },
  // Accordion Content
  accordionContent: {
    paddingStart: 52, // Align with text (icon width 40 + gap 12)
    paddingBottom: 8,
    gap: 10,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '600',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  removeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  removeButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  disabledIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  disabledText: {
    fontSize: 13,
    fontWeight: '500',
  },
  noDevices: {
    textAlign: 'center',
    paddingVertical: 20,
    fontSize: 14,
  },
  divider: {
    height: 1,
    marginStart: 52,
  },
});
