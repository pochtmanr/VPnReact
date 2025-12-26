import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ShieldOff,
  Shield,
  ShieldCheck,
  Eye,
  Bug,
  Zap,
  Check,
  Globe,
  Smartphone,
  Wifi,
  Crown,
  TrendingUp,
  Clock,
  Ban,
  Activity,
} from 'lucide-react-native';
import Animated, {
  FadeInDown,
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
} from 'react-native-reanimated';

import { useTheme } from '@/context/ThemeContext';
import { useVPN } from '@/context/VPNContext';
import { ScrollShadow } from '@/components/ui';

const AnimatedView = Animated.createAnimatedComponent(View);

interface ProtectionToggleProps {
  icon: React.ElementType;
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  iconColor: string;
  activeColor?: string;
}

function ProtectionToggle({
  icon: Icon,
  label,
  description,
  enabled,
  onToggle,
  iconColor,
  activeColor,
}: ProtectionToggleProps) {
  const { colors, isDark } = useTheme();
  const effectiveColor = enabled && activeColor ? activeColor : iconColor;

  return (
    <View style={styles.toggleItem}>
      <View
        style={[
          styles.toggleIcon,
          {
            backgroundColor: isDark
              ? `${effectiveColor}20`
              : `${effectiveColor}15`,
          },
        ]}
      >
        <Icon size={20} color={effectiveColor} />
      </View>
      <View style={styles.toggleContent}>
        <Text style={[styles.toggleLabel, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.toggleDescription, { color: colors.textSecondary }]}>
          {description}
        </Text>
      </View>
      <Switch
        value={enabled}
        onValueChange={onToggle}
        trackColor={{ false: colors.border, true: colors.success }}
        thumbColor={enabled ? '#fff' : isDark ? '#666' : '#f4f4f4'}
        ios_backgroundColor={colors.border}
      />
    </View>
  );
}

interface StatCardProps {
  icon: React.ElementType;
  value: string;
  label: string;
  trend?: string;
  color: string;
}

function StatCard({ icon: Icon, value, label, trend, color }: StatCardProps) {
  const { colors, isDark } = useTheme();

  return (
    <View
      style={[
        styles.statCard,
        {
          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.8)',
          borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
        },
      ]}
    >
      <View
        style={[
          styles.statIconContainer,
          { backgroundColor: isDark ? `${color}20` : `${color}15` },
        ]}
      >
        <Icon size={20} color={color} />
      </View>
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
      {trend && (
        <View style={styles.trendContainer}>
          <TrendingUp size={12} color={colors.success} />
          <Text style={[styles.trendText, { color: colors.success }]}>{trend}</Text>
        </View>
      )}
    </View>
  );
}

export default function AdblockScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { adBlockEnabled, setAdBlockEnabled, connectionStatus } = useVPN();

  // Local protection states (these would sync with VPN context in production)
  const [trackerBlockEnabled, setTrackerBlockEnabled] = useState(true);
  const [malwareBlockEnabled, setMalwareBlockEnabled] = useState(true);
  const [adultContentBlock, setAdultContentBlock] = useState(false);
  const [socialTrackingBlock, setSocialTrackingBlock] = useState(true);

  // Simulated stats (would come from backend in production)
  const [stats] = useState({
    adsBlocked: 12847,
    trackersBlocked: 3291,
    dataSaved: '847 MB',
    timeSaved: '2.4 hrs',
  });

  // Pulse animation for the shield when protection is active
  const pulseScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.5);

  const isProtectionActive = adBlockEnabled || trackerBlockEnabled || malwareBlockEnabled;

  useEffect(() => {
    if (isProtectionActive) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.03, { duration: 1500 }),
          withTiming(1, { duration: 1500 })
        ),
        -1,
        true
      );
      glowOpacity.value = withRepeat(
        withSequence(
          withTiming(0.8, { duration: 1500 }),
          withTiming(0.4, { duration: 1500 })
        ),
        -1,
        true
      );
    } else {
      pulseScale.value = withTiming(1, { duration: 300 });
      glowOpacity.value = withTiming(0, { duration: 300 });
    }
  }, [isProtectionActive]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const activeProtections = [
    adBlockEnabled,
    trackerBlockEnabled,
    malwareBlockEnabled,
    socialTrackingBlock,
  ].filter(Boolean).length;

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
          {/* Header with Pro Badge */}
          <AnimatedView
            entering={FadeInDown.delay(0).duration(300).easing(Easing.out(Easing.ease))}
            style={styles.header}
          >
            <View style={styles.headerRow}>
              <View>
                <Text style={[styles.headerTitle, { color: colors.text }]}>Ad Blocker</Text>
                <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
                  System-wide protection
                </Text>
              </View>
              <View style={[styles.proBadge, { backgroundColor: isDark ? '#FFD70020' : '#FFD70015' }]}>
                <Crown size={14} color="#FFD700" />
                <Text style={styles.proBadgeText}>PRO</Text>
              </View>
            </View>
          </AnimatedView>

          {/* Hero Status Card */}
          <AnimatedView
            entering={FadeInDown.delay(50).duration(300).easing(Easing.out(Easing.ease))}
            style={[
              styles.heroCard,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.9)',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
              },
            ]}
          >
            {/* Glow effect behind shield */}
            {isProtectionActive && (
              <Animated.View style={[styles.glowEffect, glowStyle]}>
                <LinearGradient
                  colors={['transparent', colors.success + '40', 'transparent']}
                  style={styles.glowGradient}
                />
              </Animated.View>
            )}

            <Animated.View style={[styles.heroIconContainer, pulseStyle]}>
              <LinearGradient
                colors={isProtectionActive
                  ? [colors.success, '#22C55E']
                  : [colors.textMuted, '#6B7280']
                }
                style={styles.heroIconGradient}
              >
                {isProtectionActive ? (
                  <ShieldCheck size={52} color="#fff" />
                ) : (
                  <ShieldOff size={52} color="#fff" />
                )}
              </LinearGradient>
            </Animated.View>

            <Text style={[styles.heroTitle, { color: colors.text }]}>
              {isProtectionActive ? 'Protection Active' : 'Protection Disabled'}
            </Text>
            <Text style={[styles.heroDescription, { color: colors.textSecondary }]}>
              {isProtectionActive
                ? `${activeProtections} protection layers active`
                : 'Enable protection to block ads and trackers'
              }
            </Text>

            {/* Quick Stats Row */}
            <View style={styles.quickStatsRow}>
              <View style={styles.quickStat}>
                <Ban size={16} color={colors.error} />
                <Text style={[styles.quickStatValue, { color: colors.text }]}>
                  {stats.adsBlocked.toLocaleString()}
                </Text>
                <Text style={[styles.quickStatLabel, { color: colors.textMuted }]}>Blocked</Text>
              </View>
              <View style={[styles.quickStatDivider, { backgroundColor: colors.border }]} />
              <View style={styles.quickStat}>
                <Activity size={16} color={colors.primary} />
                <Text style={[styles.quickStatValue, { color: colors.text }]}>99.9%</Text>
                <Text style={[styles.quickStatLabel, { color: colors.textMuted }]}>Block Rate</Text>
              </View>
              <View style={[styles.quickStatDivider, { backgroundColor: colors.border }]} />
              <View style={styles.quickStat}>
                <Clock size={16} color={colors.success} />
                <Text style={[styles.quickStatValue, { color: colors.text }]}>{stats.timeSaved}</Text>
                <Text style={[styles.quickStatLabel, { color: colors.textMuted }]}>Saved</Text>
              </View>
            </View>
          </AnimatedView>

          {/* Stats Grid */}
          <AnimatedView
            entering={FadeInDown.delay(75).duration(300).easing(Easing.out(Easing.ease))}
            style={styles.statsGrid}
          >
            <StatCard
              icon={Ban}
              value={stats.adsBlocked.toLocaleString()}
              label="Ads Blocked"
              trend="+847 today"
              color={colors.error}
            />
            <StatCard
              icon={Eye}
              value={stats.trackersBlocked.toLocaleString()}
              label="Trackers Stopped"
              trend="+124 today"
              color={colors.primary}
            />
            <StatCard
              icon={Zap}
              value={stats.dataSaved}
              label="Data Saved"
              color={colors.warning}
            />
            <StatCard
              icon={Clock}
              value={stats.timeSaved}
              label="Time Saved"
              color={colors.success}
            />
          </AnimatedView>

          {/* Main Protection Toggle */}
          <AnimatedView
            entering={FadeInDown.delay(100).duration(300).easing(Easing.out(Easing.ease))}
            style={[
              styles.mainToggleCard,
              {
                backgroundColor: isDark
                  ? adBlockEnabled ? 'rgba(34, 197, 94, 0.1)' : 'rgba(255, 255, 255, 0.05)'
                  : adBlockEnabled ? 'rgba(34, 197, 94, 0.08)' : 'rgba(255, 255, 255, 0.8)',
                borderColor: isDark
                  ? adBlockEnabled ? 'rgba(34, 197, 94, 0.3)' : 'rgba(255, 255, 255, 0.08)'
                  : adBlockEnabled ? 'rgba(34, 197, 94, 0.2)' : 'rgba(0, 0, 0, 0.05)',
              },
            ]}
          >
            <View style={styles.mainToggleContent}>
              <View
                style={[
                  styles.mainToggleIcon,
                  {
                    backgroundColor: isDark
                      ? `${adBlockEnabled ? colors.success : colors.error}20`
                      : `${adBlockEnabled ? colors.success : colors.error}15`,
                  },
                ]}
              >
                {adBlockEnabled ? (
                  <Shield size={28} color={colors.success} />
                ) : (
                  <ShieldOff size={28} color={colors.error} />
                )}
              </View>
              <View style={styles.mainToggleText}>
                <Text style={[styles.mainToggleLabel, { color: colors.text }]}>
                  Ad Blocking
                </Text>
                <Text style={[styles.mainToggleDescription, { color: colors.textSecondary }]}>
                  {adBlockEnabled
                    ? 'Blocking ads across all apps'
                    : 'Enable to block advertisements'
                  }
                </Text>
              </View>
            </View>
            <Switch
              value={adBlockEnabled}
              onValueChange={setAdBlockEnabled}
              trackColor={{ false: colors.border, true: colors.success }}
              thumbColor={adBlockEnabled ? '#fff' : isDark ? '#666' : '#f4f4f4'}
              ios_backgroundColor={colors.border}
              style={styles.mainToggleSwitch}
            />
          </AnimatedView>

          {/* Protection Settings */}
          <AnimatedView
            entering={FadeInDown.delay(125).duration(300).easing(Easing.out(Easing.ease))}
            style={[
              styles.settingsCard,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.8)',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
              },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Protection Settings</Text>
            <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
              Customize your protection preferences
            </Text>

            <View style={styles.togglesList}>
              <ProtectionToggle
                icon={Eye}
                label="Tracker Blocking"
                description="Prevent websites from tracking you"
                enabled={trackerBlockEnabled}
                onToggle={() => setTrackerBlockEnabled(!trackerBlockEnabled)}
                iconColor={colors.primary}
                activeColor={colors.success}
              />
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <ProtectionToggle
                icon={Bug}
                label="Malware Protection"
                description="Block malicious websites & downloads"
                enabled={malwareBlockEnabled}
                onToggle={() => setMalwareBlockEnabled(!malwareBlockEnabled)}
                iconColor={colors.warning}
                activeColor={colors.success}
              />
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <ProtectionToggle
                icon={Globe}
                label="Social Media Tracking"
                description="Block social media trackers"
                enabled={socialTrackingBlock}
                onToggle={() => setSocialTrackingBlock(!socialTrackingBlock)}
                iconColor={colors.info}
                activeColor={colors.success}
              />
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <ProtectionToggle
                icon={ShieldOff}
                label="Adult Content Filter"
                description="Block adult websites"
                enabled={adultContentBlock}
                onToggle={() => setAdultContentBlock(!adultContentBlock)}
                iconColor={colors.error}
                activeColor={colors.success}
              />
            </View>
          </AnimatedView>

          {/* Coverage Info */}
          <AnimatedView
            entering={FadeInDown.delay(150).duration(300).easing(Easing.out(Easing.ease))}
            style={[
              styles.coverageCard,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.8)',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
              },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Coverage</Text>
            <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
              Protection works across your entire device
            </Text>

            <View style={styles.coverageList}>
              <View style={styles.coverageItem}>
                <View
                  style={[
                    styles.coverageIcon,
                    { backgroundColor: isDark ? `${colors.primary}20` : `${colors.primary}15` },
                  ]}
                >
                  <Globe size={20} color={colors.primary} />
                </View>
                <Text style={[styles.coverageLabel, { color: colors.text }]}>All Browsers</Text>
                <Check size={18} color={colors.success} />
              </View>
              <View style={[styles.coverageDivider, { backgroundColor: colors.border }]} />
              <View style={styles.coverageItem}>
                <View
                  style={[
                    styles.coverageIcon,
                    { backgroundColor: isDark ? `${colors.success}20` : `${colors.success}15` },
                  ]}
                >
                  <Smartphone size={20} color={colors.success} />
                </View>
                <Text style={[styles.coverageLabel, { color: colors.text }]}>All Apps</Text>
                <Check size={18} color={colors.success} />
              </View>
              <View style={[styles.coverageDivider, { backgroundColor: colors.border }]} />
              <View style={styles.coverageItem}>
                <View
                  style={[
                    styles.coverageIcon,
                    { backgroundColor: isDark ? `${colors.info}20` : `${colors.info}15` },
                  ]}
                >
                  <Wifi size={20} color={colors.info} />
                </View>
                <Text style={[styles.coverageLabel, { color: colors.text }]}>System-Wide</Text>
                <Check size={18} color={colors.success} />
              </View>
            </View>
          </AnimatedView>

          {/* Connection Status Info */}
          <AnimatedView
            entering={FadeInDown.delay(175).duration(300).easing(Easing.out(Easing.ease))}
            style={[
              styles.infoCard,
              {
                backgroundColor: isDark
                  ? connectionStatus === 'connected' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(59, 130, 246, 0.1)'
                  : connectionStatus === 'connected' ? 'rgba(34, 197, 94, 0.08)' : 'rgba(59, 130, 246, 0.08)',
                borderColor: isDark
                  ? connectionStatus === 'connected' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(59, 130, 246, 0.2)'
                  : connectionStatus === 'connected' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(59, 130, 246, 0.15)',
              },
            ]}
          >
            {connectionStatus === 'connected' ? (
              <ShieldCheck size={18} color={colors.success} />
            ) : (
              <Shield size={18} color="#3B82F6" />
            )}
            <Text style={[
              styles.infoText,
              { color: connectionStatus === 'connected'
                ? isDark ? '#86EFAC' : '#166534'
                : isDark ? '#93C5FD' : '#1D4ED8'
              }
            ]}>
              {connectionStatus === 'connected'
                ? 'VPN connected - Ad blocking is using your VPN server\'s DNS for maximum protection.'
                : 'Connect to VPN for DNS-level ad blocking. Ad blocking works best when combined with VPN protection.'
              }
            </Text>
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
    marginBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 16,
    marginTop: 4,
  },
  proBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  proBadgeText: {
    color: '#FFD700',
    fontSize: 12,
    fontWeight: '700',
  },
  // Hero Card
  heroCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    overflow: 'hidden',
  },
  glowEffect: {
    position: 'absolute',
    top: -50,
    left: -50,
    right: -50,
    bottom: -50,
  },
  glowGradient: {
    flex: 1,
    borderRadius: 200,
  },
  heroIconContainer: {
    marginBottom: 16,
  },
  heroIconGradient: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  heroDescription: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 20,
  },
  quickStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  quickStat: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  quickStatValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  quickStatLabel: {
    fontSize: 11,
  },
  quickStatDivider: {
    width: 1,
    height: 40,
  },
  // Stats Grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    width: '47%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  statIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 13,
  },
  trendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  trendText: {
    fontSize: 12,
    fontWeight: '500',
  },
  // Main Toggle
  mainToggleCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  mainToggleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 14,
  },
  mainToggleIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainToggleText: {
    flex: 1,
  },
  mainToggleLabel: {
    fontSize: 18,
    fontWeight: '600',
  },
  mainToggleDescription: {
    fontSize: 14,
    marginTop: 2,
  },
  mainToggleSwitch: {
    transform: [{ scale: 1.1 }],
  },
  // Settings Card
  settingsCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  sectionSubtitle: {
    fontSize: 13,
    marginTop: 4,
    marginBottom: 16,
  },
  togglesList: {
    gap: 0,
  },
  toggleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  toggleIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleContent: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  toggleDescription: {
    fontSize: 13,
    marginTop: 2,
  },
  divider: {
    height: 1,
    marginLeft: 54,
  },
  // Coverage Card
  coverageCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  coverageList: {
    gap: 0,
  },
  coverageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  coverageIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverageLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  coverageDivider: {
    height: 1,
    marginLeft: 54,
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
    lineHeight: 19,
  },
});
