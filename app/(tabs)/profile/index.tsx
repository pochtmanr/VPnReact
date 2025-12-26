import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  Check,
  ChevronRight,
  Copy,
  FileText,
  HelpCircle,
  Info,
  Key,
  LogOut,
  Palette,
  Shield,
  Smartphone,
  Star,
  Trash2,
} from 'lucide-react-native';
import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ScrollShadow } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useVPN } from '@/context/VPNContext';
import { useParentalControls } from '@/context/ParentalControlsContext';

const AnimatedView = Animated.createAnimatedComponent(View);

interface MenuItemProps {
  icon: React.ElementType;
  label: string;
  description?: string;
  onPress?: () => void;
  iconColor?: string;
  showChevron?: boolean;
  rightElement?: React.ReactNode;
}

function MenuItem({
  icon: Icon,
  label,
  description,
  onPress,
  iconColor,
  showChevron = true,
  rightElement,
}: MenuItemProps) {
  const { colors, isDark } = useTheme();
  const defaultIconColor = iconColor || colors.primary;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuItem,
        pressed && { opacity: 0.7 },
      ]}
    >
      <View
        style={[
          styles.menuIcon,
          { backgroundColor: isDark ? `${defaultIconColor}20` : `${defaultIconColor}15` },
        ]}
      >
        <Icon size={20} color={defaultIconColor} />
      </View>
      <View style={styles.menuContent}>
        <Text style={[styles.menuLabel, { color: colors.text }]}>{label}</Text>
        {description && (
          <Text style={[styles.menuDescription, { color: colors.textSecondary }]}>
            {description}
          </Text>
        )}
      </View>
      {rightElement || (showChevron && (
        <ChevronRight size={20} color={colors.textMuted} />
      ))}
    </Pressable>
  );
}

// Device Item Component
function DeviceItem({
  deviceName,
  deviceType,
  lastActive,
  isCurrentDevice,
  isVpnConnected,
  isParentalEnabled,
  onRemove,
}: {
  deviceName: string;
  deviceType: string;
  lastActive: string;
  isCurrentDevice: boolean;
  isVpnConnected?: boolean;
  isParentalEnabled?: boolean;
  onRemove?: () => void;
}) {
  const { colors, isDark } = useTheme();

  const getDeviceIcon = () => {
    switch (deviceType) {
      case 'ios':
      case 'android':
        return Smartphone;
      default:
        return Smartphone;
    }
  };

  const DeviceIcon = getDeviceIcon();
  const lastActiveDate = new Date(lastActive);
  const timeAgo = getTimeAgo(lastActiveDate);

  return (
    <View style={styles.deviceItem}>
      <View
        style={[
          styles.deviceIcon,
          { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)' },
        ]}
      >
        <DeviceIcon size={20} color={colors.textSecondary} />
      </View>
      <View style={styles.deviceInfo}>
        <View style={styles.deviceNameRow}>
          <Text style={[styles.deviceName, { color: colors.text }]}>{deviceName}</Text>
          {isCurrentDevice && (
            <View style={[styles.currentBadge, { backgroundColor: `${colors.success}20` }]}>
              <Text style={[styles.currentBadgeText, { color: colors.success }]}>This device</Text>
            </View>
          )}
        </View>
        <Text style={[styles.deviceMeta, { color: colors.textSecondary }]}>
          {deviceType.charAt(0).toUpperCase() + deviceType.slice(1)} • {timeAgo}
        </Text>
        {/* Status indicators for current device */}
        {isCurrentDevice && (
          <View style={styles.statusIndicators}>
            {isVpnConnected && (
              <View style={[styles.statusBadge, { backgroundColor: 'rgba(34, 197, 94, 0.15)' }]}>
                <Shield size={12} color="#22C55E" />
                <Text style={[styles.statusBadgeText, { color: '#22C55E' }]}>VPN Active</Text>
              </View>
            )}
            {isParentalEnabled && (
              <View style={[styles.statusBadge, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                <Shield size={12} color="#3B82F6" />
                <Text style={[styles.statusBadgeText, { color: '#3B82F6' }]}>Child Mode</Text>
              </View>
            )}
          </View>
        )}
      </View>
      {!isCurrentDevice && onRemove && (
        <Pressable onPress={onRemove} style={styles.removeButton}>
          <Trash2 size={18} color={colors.error} />
        </Pressable>
      )}
    </View>
  );
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

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark, themeMode } = useTheme();
  const {
    account,
    devices,
    deviceSession,
    deviceCount,
    maxDevices,
    logout,
    removeDevice,
    deleteAccount,
    isAuthenticated,
  } = useAuth();
  const { connectionStatus } = useVPN();
  const { isEnabled: isParentalEnabled } = useParentalControls();
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  const isVpnConnected = connectionStatus === 'connected';

  const getThemeLabel = () => {
    switch (themeMode) {
      case 'light': return 'Light mode';
      case 'dark': return 'Dark mode';
      case 'system': return 'System';
    }
  };

  const handleCopyAccountId = async () => {
    if (account?.account_id) {
      await Clipboard.setStringAsync(account.account_id);
      setCopied(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRemoveDevice = (deviceId: string, deviceName: string) => {
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
  };

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out? You will need your Account ID to sign back in.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/(auth)/account');
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This action is permanent and cannot be undone. All your data, devices, and settings will be deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            // Second confirmation for destructive action
            Alert.alert(
              'Are you absolutely sure?',
              'Type your account ID to confirm deletion.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete Forever',
                  style: 'destructive',
                  onPress: async () => {
                    const result = await deleteAccount();
                    if (result.success) {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      router.replace('/(auth)/account');
                    } else {
                      Alert.alert('Error', result.error || 'Failed to delete account');
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const tierInfo = {
    free: { name: 'Free', color: colors.textMuted },
    pro: { name: 'Pro', color: colors.primary },
    premium: { name: 'Premium', color: colors.info },
  };

  const currentTier = (account?.subscription_tier || 'free') as keyof typeof tierInfo;
  const tierData = tierInfo[currentTier];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <LinearGradient
        colors={isDark
          ? ['#000000', '#0a0a0a', '#000000']
          : ['#ffffff', '#fafafa', '#f5f5f5']
        }
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      <ScrollShadow size={60}>
        <Animated.ScrollView
          style={styles.scrollView}
          contentContainerStyle={{
            paddingTop: insets.top + 12,
            paddingBottom: insets.bottom + 100,
            paddingHorizontal: 20,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <AnimatedView
            entering={FadeInDown.delay(0).duration(300).easing(Easing.out(Easing.ease))}
            style={styles.header}
          >
            <Text style={[styles.headerTitle, { color: colors.text }]}>Profile</Text>
            <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
              Manage your account
            </Text>
          </AnimatedView>

          {/* Account ID Card */}
          <AnimatedView
            entering={FadeInDown.delay(50).duration(300).easing(Easing.out(Easing.ease))}
            style={[
              styles.accountCard,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.8)',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
              },
            ]}
          >
            <View style={styles.accountHeader}>
              <View style={[styles.accountIcon, { backgroundColor: `${colors.primary}20` }]}>
                <Key size={24} color={colors.primary} />
              </View>
              <View style={styles.accountInfo}>
                <Text style={[styles.accountLabel, { color: colors.textSecondary }]}>Account ID</Text>
                <Text style={[styles.accountId, { color: colors.text }]}>
                  {account?.account_id || 'Not logged in'}
                </Text>
              </View>
              <View
                style={[
                  styles.tierBadge,
                  { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)' },
                ]}
              >
                {currentTier === 'free' ? (
                  <Shield size={12} color={colors.textSecondary} />
                ) : (
                  <Star size={12} color={colors.primary} />
                )}
                <Text style={[styles.tierText, { color: tierData.color }]}>{tierData.name}</Text>
              </View>
            </View>

            {account && (
              <Pressable
                onPress={handleCopyAccountId}
                style={({ pressed }) => [
                  styles.copyButton,
                  {
                    backgroundColor: copied
                      ? `${colors.success}20`
                      : isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
                  },
                  pressed && { opacity: 0.7 },
                ]}
              >
                {copied ? (
                  <>
                    <Check size={16} color={colors.success} />
                    <Text style={[styles.copyButtonText, { color: colors.success }]}>Copied!</Text>
                  </>
                ) : (
                  <>
                    <Copy size={16} color={colors.primary} />
                    <Text style={[styles.copyButtonText, { color: colors.primary }]}>Copy ID</Text>
                  </>
                )}
              </Pressable>
            )}
          </AnimatedView>

          {/* Devices Section */}
          <AnimatedView
            entering={FadeInDown.delay(100).duration(300).easing(Easing.out(Easing.ease))}
            style={[
              styles.settingsCard,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.8)',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
              },
            ]}
          >
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Devices</Text>
              <Text style={[styles.deviceCount, { color: colors.textSecondary }]}>
                {deviceCount}/{maxDevices}
              </Text>
            </View>

            <View style={styles.devicesList}>
              {devices.length > 0 ? (
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

          {/* Settings Section */}
          <AnimatedView
            entering={FadeInDown.delay(150).duration(300).easing(Easing.out(Easing.ease))}
            style={[
              styles.settingsCard,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.8)',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
              },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Settings</Text>

            <View style={styles.menuList}>
              <MenuItem
                icon={Palette}
                label="Appearance"
                description={getThemeLabel()}
                iconColor={colors.info}
                onPress={() => router.push('/(tabs)/profile/appearance')}
              />
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <MenuItem
                icon={HelpCircle}
                label="Help & Support"
                description="FAQ and contact us"
                iconColor={colors.primary}
                onPress={() => router.push('/(tabs)/profile/contact-support')}
              />
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <MenuItem
                icon={FileText}
                label="Privacy Policy"
                iconColor={colors.textSecondary}
                onPress={() => Alert.alert('Privacy', 'View privacy policy')}
              />
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <MenuItem
                icon={Info}
                label="Terms of Service"
                iconColor={colors.textSecondary}
                onPress={() => Alert.alert('Terms', 'View terms of service')}
              />
            </View>
          </AnimatedView>

          {/* Account Actions */}
          {isAuthenticated && (
            <AnimatedView
              entering={FadeInDown.delay(200).duration(300).easing(Easing.out(Easing.ease))}
              style={styles.accountActionsContainer}
            >
              <Button
                title="Sign Out"
                variant="secondary"
                size="large"
                onPress={handleLogout}
                icon={<LogOut size={18} color="#fff" />}
              />

              <Button
                title="Delete Account"
                variant="danger"
                size="large"
                onPress={handleDeleteAccount}
                icon={<Trash2 size={18} color="#fff" />}
              />
            </AnimatedView>
          )}

          {/* Version */}
          <AnimatedView
            entering={FadeInDown.delay(250).duration(300).easing(Easing.out(Easing.ease))}
            style={styles.versionContainer}
          >
            <Text style={[styles.versionText, { color: colors.textMuted }]}>VPN Shield v1.0.0</Text>
          </AnimatedView>
        </Animated.ScrollView>
      </ScrollShadow>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 16,
    marginTop: 4,
  },
  // Account Card
  accountCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    marginBottom: 16,
  },
  accountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  accountIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountInfo: {
    flex: 1,
    marginLeft: 14,
  },
  accountLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 2,
  },
  accountId: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  tierText: {
    fontSize: 12,
    fontWeight: '600',
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  copyButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // Settings Card
  settingsCard: {
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
  // Devices List
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
    gap: 8,
  },
  deviceName: {
    fontSize: 15,
    fontWeight: '500',
  },
  currentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  currentBadgeText: {
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
  // Menu List
  menuList: {
    gap: 0,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuContent: {
    flex: 1,
  },
  menuLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  menuDescription: {
    fontSize: 13,
    marginTop: 2,
  },
  divider: {
    height: 1,
    marginLeft: 52,
  },
  // Account Actions
  accountActionsContainer: {
    gap: 12,
    marginVertical: 16,
  },
  // Version
  versionContainer: {
    alignItems: 'center',
    marginTop: 8,
  },
  versionText: {
    fontSize: 13,
  },
  // Status Indicators
  statusIndicators: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
