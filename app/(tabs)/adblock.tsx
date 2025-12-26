import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  RefreshControl,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ShieldOff,
  Shield,
  ShieldCheck,
  Bug,
  Check,
  Globe,
  Smartphone,
  Wifi,
  Crown,
  Ban,
  Activity,
  Database,
} from 'lucide-react-native';
import {
  getAdBlockStats,
  setSafeBrowsingEnabled,
  setParentalEnabled,
  AdBlockStats,
} from '@/lib/adguard';
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
  disabled?: boolean;
}

function ProtectionToggle({
  icon: Icon,
  label,
  description,
  enabled,
  onToggle,
  iconColor,
  activeColor,
  disabled,
}: ProtectionToggleProps) {
  const { colors, isDark } = useTheme();
  const effectiveColor = enabled && activeColor ? activeColor : iconColor;

  return (
    <View style={[styles.toggleItem, disabled && { opacity: 0.5 }]}>
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
        disabled={disabled}
      />
    </View>
  );
}

interface StatCardProps {
  icon: React.ElementType;
  value: string;
  label: string;
  color: string;
}

function StatCard({ icon: Icon, value, label, color }: StatCardProps) {
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
    </View>
  );
}

export default function AdblockScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { adBlockEnabled, setAdBlockEnabled, connectionStatus } = useVPN();

  // Real stats from AdGuard Home API
  const [stats, setStats] = useState<AdBlockStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Protection states synced with AdGuard
  const [malwareBlockEnabled, setMalwareBlockEnabled] = useState(false);
  const [adultContentBlock, setAdultContentBlock] = useState(false);

  // Fetch stats from AdGuard Home
  const fetchStats = useCallback(async () => {
    try {
      const data = await getAdBlockStats();
      setStats(data);
      setMalwareBlockEnabled(data.safeBrowsingEnabled);
      setAdultContentBlock(data.parentalEnabled);
    } catch (error) {
      console.warn('Failed to fetch AdGuard stats:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    // Refresh stats every 30 seconds when connected
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchStats();
  }, [fetchStats]);

  // Toggle handlers that call AdGuard API
  const handleMalwareToggle = async () => {
    const newValue = !malwareBlockEnabled;
    setMalwareBlockEnabled(newValue);
    const success = await setSafeBrowsingEnabled(newValue);
    if (!success) {
      setMalwareBlockEnabled(!newValue); // Revert on failure
    }
  };

  const handleAdultContentToggle = async () => {
    const newValue = !adultContentBlock;
    setAdultContentBlock(newValue);
    const success = await setParentalEnabled(newValue);
    if (!success) {
      setAdultContentBlock(!newValue); // Revert on failure
    }
  };

  // Pulse animation for the shield when protection is active
  const pulseScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.5);

  const isProtectionActive = adBlockEnabled;

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
    malwareBlockEnabled,
    adultContentBlock,
  ].filter(Boolean).length;

  // Format numbers for display
  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
  };

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
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
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
                  DNS-level protection
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
                ? `${activeProtections} protection layer${activeProtections !== 1 ? 's' : ''} active`
                : 'Enable protection to block ads and trackers'
              }
            </Text>

            {/* Quick Stats Row - Real Data */}
            <View style={styles.quickStatsRow}>
              <View style={styles.quickStat}>
                <Ban size={16} color={colors.error} />
                <Text style={[styles.quickStatValue, { color: colors.text }]}>
                  {stats ? formatNumber(stats.totalBlocked) : '-'}
                </Text>
                <Text style={[styles.quickStatLabel, { color: colors.textMuted }]}>Blocked</Text>
              </View>
              <View style={[styles.quickStatDivider, { backgroundColor: colors.border }]} />
              <View style={styles.quickStat}>
                <Activity size={16} color={colors.primary} />
                <Text style={[styles.quickStatValue, { color: colors.text }]}>
                  {stats ? `${stats.blockRate}%` : '-'}
                </Text>
                <Text style={[styles.quickStatLabel, { color: colors.textMuted }]}>Block Rate</Text>
              </View>
              <View style={[styles.quickStatDivider, { backgroundColor: colors.border }]} />
              <View style={styles.quickStat}>
                <Database size={16} color={colors.success} />
                <Text style={[styles.quickStatValue, { color: colors.text }]}>
                  {stats ? formatNumber(stats.filterRulesCount) : '-'}
                </Text>
                <Text style={[styles.quickStatLabel, { color: colors.textMuted }]}>Rules</Text>
              </View>
            </View>
          </AnimatedView>

          {/* Stats Grid - Real Data Only */}
          <AnimatedView
            entering={FadeInDown.delay(75).duration(300).easing(Easing.out(Easing.ease))}
            style={styles.statsGrid}
          >
            <StatCard
              icon={Ban}
              value={stats ? formatNumber(stats.totalBlocked) : '-'}
              label="Ads Blocked"
              color={colors.error}
            />
            <StatCard
              icon={Activity}
              value={stats ? formatNumber(stats.totalQueries) : '-'}
              label="DNS Queries"
              color={colors.primary}
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
                    ? 'Using AdGuard DNS for blocking'
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

          {/* Protection Settings - Real Features Only */}
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
              Additional AdGuard Home features
            </Text>

            <View style={styles.togglesList}>
              <ProtectionToggle
                icon={Bug}
                label="Malware Protection"
                description="Block malicious websites & phishing"
                enabled={malwareBlockEnabled}
                onToggle={handleMalwareToggle}
                iconColor={colors.warning}
                activeColor={colors.success}
                disabled={connectionStatus !== 'connected'}
              />
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <ProtectionToggle
                icon={ShieldOff}
                label="Adult Content Filter"
                description="Block adult websites (Parental Control)"
                enabled={adultContentBlock}
                onToggle={handleAdultContentToggle}
                iconColor={colors.error}
                activeColor={colors.success}
                disabled={connectionStatus !== 'connected'}
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
                ? 'VPN connected - Ad blocking uses AdGuard Home DNS on your VPN server.'
                : 'Connect to VPN for DNS-level ad blocking. Stats require VPN connection.'
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
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
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
