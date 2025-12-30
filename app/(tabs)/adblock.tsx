import {
  AdBlockStats,
  getAdBlockStats,
} from '@/lib/adguard';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import {
  Activity,
  Ban,
  Check,
  Database,
  Globe,
  ShieldCheck,
  Smartphone,
  Wifi
} from 'lucide-react-native';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  InteractionManager,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { ActivationButton, QuickStatsRow, ScrollShadow } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import { useVPN } from '@/context/VPNContext';
import { useFeatureGate } from '@/hooks/useFeatureGate';

const AnimatedView = Animated.createAnimatedComponent(View);

interface StatCardProps {
  icon: React.ElementType;
  value: string;
  label: string;
  color: string;
}

const StatCard = memo(function StatCard({ icon: Icon, value, label, color }: StatCardProps) {
  const { colors, isDark } = useTheme();

  const cardStyle = useMemo(() => ({
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.8)',
    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
  }), [isDark]);

  const iconBgColor = useMemo(
    () => isDark ? `${color}20` : `${color}15`,
    [isDark, color]
  );

  return (
    <View style={[styles.statCard, cardStyle]}>
      <View style={[styles.statIconContainer, { backgroundColor: iconBgColor }]}>
        <Icon size={20} color={color} />
      </View>
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
});

// Format numbers for display (moved outside component to avoid recreation)
const formatNumber = (num: number): string => {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString();
};

export default function AdblockScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { adBlockEnabled, setAdBlockEnabled, connectionStatus } = useVPN();
  const { t } = useTranslation();
  const isVPNConnected = connectionStatus === 'connected';

  // Feature gating with automatic paywall
  const {
    hasAccess: hasAdBlockAccess,
    requestAccess,
    isGating,
    getDisabledReason,
  } = useFeatureGate('ad_blocking', {
    requiresVPN: true,
    isVPNConnected,
  });

  // Real stats from AdGuard Home API
  const [stats, setStats] = useState<AdBlockStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Ref for tracking if component is mounted (prevents state updates after unmount)
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Fetch stats from AdGuard Home
  const fetchStats = useCallback(async () => {
    try {
      const data = await getAdBlockStats();
      if (isMountedRef.current) {
        setStats(data);
      }
    } catch (error) {
      console.warn('Failed to fetch AdGuard stats:', error);
    } finally {
      if (isMountedRef.current) {
        setRefreshing(false);
      }
    }
  }, []);

  // Defer initial stats fetch to after interactions
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      fetchStats();
    });

    // Refresh stats every 30 seconds when connected
    const interval = setInterval(fetchStats, 30000);

    return () => {
      task.cancel();
      clearInterval(interval);
    };
  }, [fetchStats]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchStats();
  }, [fetchStats]);

  // Toggle handler with paywall gating
  const handleToggle = useCallback(async () => {
    // If turning off, always allow
    if (adBlockEnabled) {
      setAdBlockEnabled(false);
      return;
    }

    // If turning on, check access (shows paywall if needed)
    const granted = await requestAccess();
    if (granted) {
      setAdBlockEnabled(true);
    }
  }, [adBlockEnabled, setAdBlockEnabled, requestAccess]);

  // Memoize gradient colors
  const gradientColors = useMemo(() =>
    isDark
      ? ['#000000', '#0a0a0a', '#000000'] as const
      : ['#ffffff', '#fafafa', '#f5f5f5'] as const,
    [isDark]
  );

  // Memoize content container style
  const contentContainerStyle = useMemo(() => ({
    paddingTop: insets.top + 12,
    paddingBottom: insets.bottom + 100,
    paddingHorizontal: 20,
  }), [insets.top, insets.bottom]);

  // Memoize card style
  const heroCardStyle = useMemo(() => ({
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.8)',
    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
  }), [isDark]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <LinearGradient
        colors={gradientColors}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      <ScrollShadow size={60}>
        <Animated.ScrollView
          style={styles.scrollView}
          contentContainerStyle={contentContainerStyle}
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
                <Text style={[styles.headerTitle, { color: colors.text }]}>{t('adblock.title')}</Text>
                <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
                  {t('adblock.description')}
                </Text>
              </View>

            </View>
          </AnimatedView>

          {/* Hero Card with Interactive Activation Button */}
          <AnimatedView
            entering={FadeInDown.delay(hasAdBlockAccess ? 50 : 75).duration(300).easing(Easing.out(Easing.ease))}
            style={[styles.heroCard, heroCardStyle, (!hasAdBlockAccess || !isVPNConnected) && styles.lockedSection]}
          >
            {/* Interactive Activation Button - tappable even when locked to show paywall */}
            <ActivationButton
              isEnabled={adBlockEnabled}
              onToggle={handleToggle}
              disabled={isGating} // Only disable during paywall presentation
              enabledLabel={t('common.status.protectionActive')}
              disabledLabel={t('common.status.protectionDisabled')}
              enabledSubtitle={t('adblock.activation.tapToDisable')}
              disabledSubtitle={getDisabledReason() || t('adblock.activation.tapToEnable')}
              accentColor="#EF4444"
            />

            {/* Quick Stats Row - only show when enabled AND VPN connected */}
            {hasAdBlockAccess && adBlockEnabled && isVPNConnected && (
              <QuickStatsRow
                stats={[
                  { icon: Ban, iconColor: colors.error, value: stats ? formatNumber(stats.totalBlocked) : '-', label: t('adblock.stats.blocked') },
                  { icon: Activity, iconColor: '#3B82F6', value: stats ? `${stats.blockRate}%` : '-', label: t('adblock.stats.blockRate') },
                  { icon: Database, iconColor: '#3B82F6', value: stats ? formatNumber(stats.filterRulesCount) : '-', label: t('adblock.stats.rules') },
                ]}
              />
            )}
          </AnimatedView>

          {/* Stats Grid */}
          <AnimatedView
            entering={FadeInDown.delay(75).duration(300).easing(Easing.out(Easing.ease))}
            style={[styles.statsGrid, !isVPNConnected && styles.disabledSection]}
          >
            <StatCard
              icon={Ban}
              value={stats ? formatNumber(stats.totalBlocked) : '-'}
              label={t('adblock.stats.adsBlocked')}
              color={isVPNConnected ? colors.error : colors.textMuted}
            />
            <StatCard
              icon={Activity}
              value={stats ? formatNumber(stats.totalQueries) : '-'}
              label={t('adblock.stats.requests')}
              color={isVPNConnected ? '#3B82F6' : colors.textMuted}
            />
          </AnimatedView>

          {/* Coverage Info */}
          <AnimatedView
            entering={FadeInDown.delay(100).duration(300).easing(Easing.out(Easing.ease))}
            style={[
              styles.coverageCard,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.8)',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
              },
              !isVPNConnected && styles.disabledSection,
            ]}
          >
            <Text style={[styles.sectionTitle, { color: isVPNConnected ? colors.text : colors.textMuted }]}>{t('adblock.coverage.title')}</Text>
            <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
              {isVPNConnected ? t('adblock.coverage.subtitle') : t('adblock.coverage.connectVPN')}
            </Text>

            <View style={styles.coverageList}>
              <View style={styles.coverageItem}>
                <View
                  style={[
                    styles.coverageIcon,
                    { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.15)' },
                  ]}
                >
                  <Globe size={20} color={isVPNConnected ? '#3B82F6' : colors.textMuted} />
                </View>
                <Text style={[styles.coverageLabel, { color: isVPNConnected ? colors.text : colors.textMuted }]}>{t('adblock.coverage.allBrowsers')}</Text>
                <Check size={18} color={isVPNConnected ? colors.success : colors.textMuted} />
              </View>
              <View style={[styles.coverageDivider, { backgroundColor: colors.border }]} />
              <View style={styles.coverageItem}>
                <View
                  style={[
                    styles.coverageIcon,
                    { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.15)' },
                  ]}
                >
                  <Smartphone size={20} color={isVPNConnected ? '#3B82F6' : colors.textMuted} />
                </View>
                <Text style={[styles.coverageLabel, { color: isVPNConnected ? colors.text : colors.textMuted }]}>{t('adblock.coverage.allApps')}</Text>
                <Check size={18} color={isVPNConnected ? colors.success : colors.textMuted} />
              </View>
              <View style={[styles.coverageDivider, { backgroundColor: colors.border }]} />
              <View style={styles.coverageItem}>
                <View
                  style={[
                    styles.coverageIcon,
                    { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.15)' },
                  ]}
                >
                  <Wifi size={20} color={isVPNConnected ? '#3B82F6' : colors.textMuted} />
                </View>
                <Text style={[styles.coverageLabel, { color: isVPNConnected ? colors.text : colors.textMuted }]}>{t('adblock.coverage.systemWide')}</Text>
                <Check size={18} color={isVPNConnected ? colors.success : colors.textMuted} />
              </View>
            </View>
          </AnimatedView>

          {/* Connection Status Info */}
          <AnimatedView
            entering={FadeInDown.delay(125).duration(300).easing(Easing.out(Easing.ease))}
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
              <ShieldCheck size={18} color="#3B82F6" />
            )}
            <Text style={[
              styles.infoText,
              { color: connectionStatus === 'connected'
                ? isDark ? '#86EFAC' : '#166534'
                : isDark ? '#93C5FD' : '#1D4ED8'
              }
            ]}>
              {connectionStatus === 'connected'
                ? t('adblock.connectionInfo.connected')
                : t('adblock.connectionInfo.disconnected')
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
    paddingVertical: 32,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginBottom: 16,
    overflow: 'hidden',
  },
  // Stats Grid
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
  // Section Titles
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  sectionSubtitle: {
    fontSize: 13,
    marginTop: 4,
    marginBottom: 16,
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
  disabledSection: {
    opacity: 0.7,
  },
  lockedSection: {
    opacity: 0.5,
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
