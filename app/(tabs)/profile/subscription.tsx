import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  ArrowLeft,
  Calendar,
  ChevronRight,
  Crown,
  ExternalLink,
  HelpCircle,
  RefreshCw,
  Shield,
  Sparkles,
} from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScrollShadow } from '@/components/ui';
import { useRevenueCat } from '@/context/RevenueCatContext';
import { useTheme } from '@/context/ThemeContext';
import { TIER_DISPLAY_NAMES, useTier } from '@/context/TierContext';

const AnimatedView = Animated.createAnimatedComponent(View);

export default function SubscriptionScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { tier, isPro } = useTier();
  const router = useRouter();
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);

  // Get RevenueCat subscription info and paywall control
  const { activeSubscription, restorePurchases, refreshCustomerInfo, isLoading: isRevenueCatLoading, showPaywall } = useRevenueCat();

  // Refresh subscription info when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      refreshCustomerInfo();
    }, [refreshCustomerInfo])
  );

  // Open system subscription management (Apple's recommended approach)
  const handleManageSubscription = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      // TODO: Uncomment when RevenueCat UI is installed
      // await RevenueCatUI.presentCustomerCenter();

      const url = Platform.select({
        ios: 'https://apps.apple.com/account/subscriptions',
        android: 'https://play.google.com/store/account/subscriptions',
        default: '',
      });

      if (url) {
        await Linking.openURL(url);
      }
    } catch (error) {
      console.error('Error opening subscription management:', error);
      Alert.alert(
        t('profile.subscription.unableToOpen'),
        t('profile.subscription.manageInSettings')
      );
    }
  }, [t]);

  // Restore purchases - required by Apple
  const handleRestorePurchases = useCallback(async () => {
    setIsLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const result = await restorePurchases();

      if (result.success) {
        if (result.restored) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.push({
            pathname: '/(auth)/subscription-success',
            params: { restored: 'true' },
          });
        } else {
          Alert.alert(t('common.status.error'), t('profile.subscription.noPurchasesFound'));
        }
      } else {
        Alert.alert(t('common.status.error'), result.error || t('profile.subscription.restoreError'));
      }
    } catch (error) {
      console.error('Error restoring purchases:', error);
      Alert.alert(t('common.status.error'), t('profile.subscription.restoreError'));
    } finally {
      setIsLoading(false);
    }
  }, [restorePurchases, router, t]);

  // Open upgrade paywall
  const handleUpgrade = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    showPaywall();
  }, [showPaywall]);

  const handleContactSupport = useCallback(() => {
    router.push('/(tabs)/profile/contact-support');
  }, [router]);

  const cardStyle = useMemo(() => ({
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.8)',
    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
  }), [isDark]);

  const gradientColors = useMemo(() =>
    isDark
      ? ['#000000', '#0a0a0a', '#000000'] as const
      : ['#ffffff', '#fafafa', '#f5f5f5'] as const,
    [isDark]
  );

  const contentContainerStyle = useMemo(() => ({
    paddingTop: insets.top + 12,
    paddingBottom: insets.bottom + 100,
    paddingHorizontal: 20,
  }), [insets.top, insets.bottom]);

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
        >
          {/* Header */}
          <View style={styles.header}>
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
            <Text style={[styles.headerTitle, { color: colors.text }]}>
              {t('profile.subscription.title')}
            </Text>
            <View style={{ width: 40 }} />
          </View>

          <AnimatedView
            entering={FadeInDown.delay(0).duration(300).easing(Easing.out(Easing.ease))}
          >
            <Text style={[styles.description, { color: colors.textSecondary }]}>
              {t('profile.subscription.managePlan')}
            </Text>
          </AnimatedView>

          {/* Current Plan Card - HeroUI style with borderCurve: continuous */}
          <AnimatedView
            entering={FadeInDown.delay(50).duration(300).easing(Easing.out(Easing.ease))}
            style={[styles.planCard, cardStyle]}
          >
            {/* Plan Icon */}
            <View style={[styles.planIconContainer, { backgroundColor: isPro ? '#FFD70015' : `${colors.textMuted}10` }]}>
              {isPro ? (
                <Crown size={32} color="#FFD700" />
              ) : (
                <Shield size={32} color={colors.textMuted} />
              )}
            </View>

            {/* Plan Info */}
            <View style={styles.planInfo}>
              <Text style={[styles.planLabel, { color: colors.textSecondary }]}>{t('profile.subscription.currentPlan')}</Text>
              <Text style={[styles.planName, { color: colors.text }]}>
                {TIER_DISPLAY_NAMES[tier]}
              </Text>
              {isPro && (
                <View style={[styles.activeBadge, { backgroundColor: `${colors.success}15` }]}>
                  {isRevenueCatLoading ? (
                    <ActivityIndicator size="small" color={colors.success} style={{ marginEnd: 4 }} />
                  ) : (
                    <View style={[styles.activeDot, { backgroundColor: colors.success }]} />
                  )}
                  <Text style={[styles.activeBadgeText, { color: colors.success }]}>
                    {isRevenueCatLoading ? t('profile.subscription.status.refreshing') : t('profile.subscription.status.active')}
                  </Text>
                </View>
              )}
            </View>

            {/* Active subscription info */}
            {isPro && activeSubscription && (
              <View style={styles.subscriptionDetails}>
                <View style={styles.detailRow}>
                  <Calendar size={16} color={colors.textSecondary} />
                  <Text style={[styles.detailText, { color: colors.textSecondary }]}>
                    {activeSubscription.expirationDate
                      ? t('profile.subscription.statusText.renewsOn', { date: activeSubscription.expirationDate.toLocaleDateString() })
                      : t('profile.subscription.statusText.lifetimeAccess')}
                  </Text>
                </View>
                {activeSubscription.isInTrial && (
                  <View style={[styles.trialBadge, { backgroundColor: `${colors.warning}15` }]}>
                    <Sparkles size={14} color={colors.warning} />
                    <Text style={[styles.trialText, { color: colors.warning }]}>{t('profile.subscription.freeTrial')}</Text>
                  </View>
                )}
              </View>
            )}

            {/* Upgrade CTA for free users */}
            {!isPro && (
              <View style={[styles.upgradeSection, { borderTopColor: colors.border }]}>
                <Text style={[styles.upgradeText, { color: colors.text }]}>
                  {t('profile.subscription.cta.upgradeToPro')}
                </Text>
                <Text style={[styles.upgradeSubtext, { color: colors.textSecondary }]}>
                  {t('profile.subscription.cta.unlockFeatures')}
                </Text>
                <Pressable
                  onPress={handleUpgrade}
                  style={({ pressed }) => [
                    styles.upgradeButton,
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <LinearGradient
                    colors={['#FFD700', '#FFA500']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.upgradeButtonGradient}
                  >
                    <Crown size={18} color="#FFFFFF" />
                    <Text style={styles.upgradeButtonText}>{t('profile.subscription.cta.upgradeNow')}</Text>
                  </LinearGradient>
                </Pressable>
              </View>
            )}
          </AnimatedView>

          {/* Management Card - Contains all actions */}
          <AnimatedView
            entering={FadeInDown.delay(100).duration(300).easing(Easing.out(Easing.ease))}
            style={[styles.managementCard, cardStyle]}
          >
            {/* Manage Subscription in App Store */}
            <Pressable
              onPress={handleManageSubscription}
              style={({ pressed }) => [
                styles.menuItem,
                pressed && { opacity: 0.7 },
              ]}
            >
              <View style={[styles.menuIcon, { backgroundColor: `${colors.primary}15` }]}>
                <ExternalLink size={20} color={colors.primary} />
              </View>
              <View style={styles.menuContent}>
                <Text style={[styles.menuLabel, { color: colors.text }]}>
                  {t('profile.subscription.management.manageInStore', { store: Platform.OS === 'ios' ? 'App Store' : 'Play Store' })}
                </Text>
                <Text style={[styles.menuDescription, { color: colors.textSecondary }]}>
                  {t('profile.subscription.management.changeOrCancel')}
                </Text>
              </View>
              <ChevronRight size={18} color={colors.textMuted} />
            </Pressable>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* Restore Purchases - Required by Apple */}
            <Pressable
              onPress={handleRestorePurchases}
              disabled={isLoading}
              style={({ pressed }) => [
                styles.menuItem,
                pressed && { opacity: 0.7 },
                isLoading && { opacity: 0.5 },
              ]}
            >
              <View style={[styles.menuIcon, { backgroundColor: `${colors.info}15` }]}>
                {isLoading ? (
                  <ActivityIndicator size="small" color={colors.info} />
                ) : (
                  <RefreshCw size={20} color={colors.info} />
                )}
              </View>
              <View style={styles.menuContent}>
                <Text style={[styles.menuLabel, { color: colors.text }]}>{t('profile.subscription.management.restorePurchases')}</Text>
                <Text style={[styles.menuDescription, { color: colors.textSecondary }]}>
                  {t('profile.subscription.management.restoreDescription')}
                </Text>
              </View>
              <ChevronRight size={18} color={colors.textMuted} />
            </Pressable>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* Help */}
            <Pressable
              onPress={handleContactSupport}
              style={({ pressed }) => [
                styles.menuItem,
                pressed && { opacity: 0.7 },
              ]}
            >
              <View style={[styles.menuIcon, { backgroundColor: `${colors.textSecondary}15` }]}>
                <HelpCircle size={20} color={colors.textSecondary} />
              </View>
              <View style={styles.menuContent}>
                <Text style={[styles.menuLabel, { color: colors.text }]}>{t('profile.subscription.management.subscriptionHelp')}</Text>
                <Text style={[styles.menuDescription, { color: colors.textSecondary }]}>
                  {t('profile.subscription.management.faqAndSupport')}
                </Text>
              </View>
              <ChevronRight size={18} color={colors.textMuted} />
            </Pressable>
          </AnimatedView>

          {/* Info Footer */}
          <AnimatedView
            entering={FadeInDown.delay(150).duration(300).easing(Easing.out(Easing.ease))}
            style={styles.infoFooter}
          >
            <Text style={[styles.infoText, { color: colors.textMuted }]}>
              {Platform.OS === 'ios'
                ? t('profile.subscription.infoFooter.ios')
                : t('profile.subscription.infoFooter.android')}
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
  // Plan Card - HeroUI inspired with continuous border curve
  planCard: {
    borderRadius: 24,
    borderCurve: 'continuous',
    borderWidth: 1,
    padding: 24,
    marginBottom: 16,
    alignItems: 'center',
  },
  planIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 20,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  planInfo: {
    alignItems: 'center',
  },
  planLabel: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 4,
  },
  planName: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 8,
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  activeBadgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  subscriptionDetails: {
    marginTop: 16,
    alignItems: 'center',
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailText: {
    fontSize: 14,
  },
  trialBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  trialText: {
    fontSize: 12,
    fontWeight: '600',
  },
  upgradeSection: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.05)',
    alignItems: 'center',
    width: '100%',
  },
  upgradeText: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  upgradeSubtext: {
    fontSize: 14,
  },
  upgradeButton: {
    marginTop: 16,
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
  },
  upgradeButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  upgradeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  // Management Card
  managementCard: {
    borderRadius: 20,
    borderCurve: 'continuous',
    borderWidth: 1,
    padding: 8,
    marginBottom: 24,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    gap: 12,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderCurve: 'continuous',
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
    marginStart: 64,
    marginEnd: 12,
  },
  // Info Footer
  infoFooter: {
    paddingHorizontal: 8,
  },
  infoText: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
});
