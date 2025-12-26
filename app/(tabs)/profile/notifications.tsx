import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Switch,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  Bell,
  Shield,
  Globe,
  BarChart3,
  Gift,
  Check,
  Info,
} from 'lucide-react-native';
import Animated, {
  FadeInDown,
  Easing,
} from 'react-native-reanimated';

import { useTheme } from '@/context/ThemeContext';

const AnimatedView = Animated.createAnimatedComponent(View);
const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);

interface NotificationToggleProps {
  icon: React.ElementType;
  label: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  iconColor?: string;
  important?: boolean;
  disabled?: boolean;
}

function NotificationToggle({
  icon: Icon,
  label,
  description,
  value,
  onValueChange,
  iconColor,
  important = false,
  disabled = false,
}: NotificationToggleProps) {
  const { colors, isDark } = useTheme();
  const defaultIconColor = iconColor || colors.primary;

  return (
    <View
      style={[
        styles.toggleRow,
        {
          borderBottomColor: colors.border,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.toggleIcon,
          {
            backgroundColor: important
              ? (isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)')
              : (isDark ? `${defaultIconColor}20` : `${defaultIconColor}15`),
          },
        ]}
      >
        <Icon size={20} color={important ? '#10B981' : defaultIconColor} />
      </View>

      <View style={styles.toggleContent}>
        <View style={styles.toggleLabelRow}>
          <Text style={[styles.toggleLabel, { color: colors.text }]}>{label}</Text>
          {important && (
            <View style={[styles.recommendedBadge, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
              <Text style={styles.recommendedText}>Recommended</Text>
            </View>
          )}
        </View>
        <Text style={[styles.toggleDescription, { color: colors.textSecondary }]}>
          {description}
        </Text>
      </View>

      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{
          false: colors.border,
          true: important ? '#10B981' : colors.primary,
        }}
        thumbColor="#fff"
        ios_backgroundColor={colors.border}
      />
    </View>
  );
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const router = useRouter();

  // Notification states
  const [pushEnabled, setPushEnabled] = useState(true);
  const [connectionAlerts, setConnectionAlerts] = useState(true);
  const [securityAlerts, setSecurityAlerts] = useState(true);
  const [newServers, setNewServers] = useState(false);
  const [weeklyReport, setWeeklyReport] = useState(true);
  const [promotions, setPromotions] = useState(false);

  // Render back button
  const renderBackButton = () => (
    <Pressable
      style={[
        styles.backButton,
        {
          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
          borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
        },
      ]}
      onPress={() => router.back()}
      hitSlop={12}
    >
      <ArrowLeft size={20} color={colors.text} />
    </Pressable>
  );

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

      <AnimatedScrollView
        style={styles.scrollView}
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 100,
          paddingHorizontal: 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          {renderBackButton()}
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            Notifications
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <AnimatedView
          entering={FadeInDown.delay(50).duration(300).easing(Easing.out(Easing.ease))}
        >
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            Manage your notification preferences
          </Text>
        </AnimatedView>

        {/* Master Toggle Card */}
        <AnimatedView
          entering={FadeInDown.delay(75).duration(300).easing(Easing.out(Easing.ease))}
          style={[
            styles.masterCard,
            {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.8)',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
            },
          ]}
        >
          <View style={styles.masterToggle}>
            <View style={styles.masterContent}>
              <View
                style={[
                  styles.masterIcon,
                  { backgroundColor: isDark ? `${colors.primary}20` : `${colors.primary}15` },
                ]}
              >
                <Bell size={24} color={colors.primary} />
              </View>
              <View>
                <Text style={[styles.masterTitle, { color: colors.text }]}>Push Notifications</Text>
                <Text style={[styles.masterSubtitle, { color: colors.textSecondary }]}>
                  {pushEnabled ? 'Enabled' : 'Disabled'}
                </Text>
              </View>
            </View>
            <Switch
              value={pushEnabled}
              onValueChange={setPushEnabled}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#fff"
              ios_backgroundColor={colors.border}
            />
          </View>
        </AnimatedView>

        {/* Status Banner */}
        {pushEnabled && (
          <AnimatedView
            entering={FadeInDown.delay(100).duration(300).easing(Easing.out(Easing.ease))}
            style={[
              styles.statusBanner,
              {
                backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)',
                borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : 'rgba(16, 185, 129, 0.2)',
              },
            ]}
          >
            <Check size={20} color="#10B981" />
            <View style={styles.statusBannerText}>
              <Text style={[styles.statusTitle, { color: colors.text }]}>
                Notifications Enabled
              </Text>
              <Text style={[styles.statusDescription, { color: colors.textSecondary }]}>
                You'll receive important alerts and updates
              </Text>
            </View>
          </AnimatedView>
        )}

        {/* Connection Settings Card */}
        <AnimatedView
          entering={FadeInDown.delay(125).duration(300).easing(Easing.out(Easing.ease))}
          style={[
            styles.settingsCard,
            {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.8)',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
              opacity: pushEnabled ? 1 : 0.5,
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Connection</Text>

          <NotificationToggle
            icon={Shield}
            label="Connection Status"
            description="Get notified when VPN connects or disconnects"
            value={connectionAlerts && pushEnabled}
            onValueChange={setConnectionAlerts}
            iconColor={colors.success}
            important
            disabled={!pushEnabled}
          />

          <NotificationToggle
            icon={Shield}
            label="Security Alerts"
            description="Receive alerts about potential security threats"
            value={securityAlerts && pushEnabled}
            onValueChange={setSecurityAlerts}
            iconColor={colors.warning}
            important
            disabled={!pushEnabled}
          />
        </AnimatedView>

        {/* Updates & News Card */}
        <AnimatedView
          entering={FadeInDown.delay(150).duration(300).easing(Easing.out(Easing.ease))}
          style={[
            styles.settingsCard,
            {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.8)',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
              opacity: pushEnabled ? 1 : 0.5,
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Updates & News</Text>

          <NotificationToggle
            icon={Globe}
            label="New Servers"
            description="Be notified when new server locations are added"
            value={newServers && pushEnabled}
            onValueChange={setNewServers}
            iconColor={colors.info}
            disabled={!pushEnabled}
          />

          <NotificationToggle
            icon={BarChart3}
            label="Weekly Report"
            description="Receive a weekly summary of your VPN usage"
            value={weeklyReport && pushEnabled}
            onValueChange={setWeeklyReport}
            iconColor={colors.primary}
            disabled={!pushEnabled}
          />

          <NotificationToggle
            icon={Gift}
            label="Promotions & Offers"
            description="Get notified about special deals and discounts"
            value={promotions && pushEnabled}
            onValueChange={setPromotions}
            iconColor={colors.error}
            disabled={!pushEnabled}
          />
        </AnimatedView>

        {/* Info Card */}
        <AnimatedView
          entering={FadeInDown.delay(175).duration(300).easing(Easing.out(Easing.ease))}
          style={[
            styles.infoCard,
            {
              backgroundColor: isDark ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.08)',
              borderColor: isDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.15)',
            },
          ]}
        >
          <Info size={18} color="#3B82F6" />
          <Text style={[styles.infoText, { color: isDark ? '#93C5FD' : '#1D4ED8' }]}>
            You can also manage notification permissions in your device settings. Some notifications may require system-level permissions.
          </Text>
        </AnimatedView>
      </AnimatedScrollView>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 20,
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  description: {
    fontSize: 16,
    marginBottom: 20,
  },
  // Master Card
  masterCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  masterToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  masterContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  masterIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  masterTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  masterSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  // Status Banner
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
    gap: 12,
  },
  statusBannerText: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  statusDescription: {
    fontSize: 13,
  },
  // Settings Card
  settingsCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  // Toggle Row
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  toggleIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleContent: {
    flex: 1,
  },
  toggleLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  recommendedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  recommendedText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#10B981',
    textTransform: 'uppercase',
  },
  toggleDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  // Info Card
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
});
