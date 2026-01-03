import { useFocusEffect } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  ArrowLeft,
  ChevronRight,
  HelpCircle,
  RefreshCw,
} from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Image,
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

// Format date as "Jan 15, 2026"
function formatDate(date: Date | null): string {
  if (!date) return '';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function SubscriptionScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { tier, isPro } = useTier();
  const router = useRouter();
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);

  // Get RevenueCat subscription info and paywall control
  const {
    activeSubscription,
    restorePurchases,
    refreshCustomerInfo,
    showPaywall,
  } = useRevenueCat();

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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    showPaywall();
  }, [showPaywall]);

  const handleContactSupport = useCallback(() => {
    router.push('/(tabs)/profile/contact-support');
  }, [router]);

  const handleGoBack = useCallback(() => {
    router.back();
  }, [router]);

  // Determine status info for paid users
  const statusInfo = useMemo(() => {
    if (!isPro) return null;

    const expirationDate = activeSubscription?.expirationDate;
    const willRenew = activeSubscription?.willRenew ?? true;

    if (expirationDate) {
      const formattedDate = formatDate(expirationDate);
      return {
        label: willRenew
          ? t('profile.subscription.renewsOn')
          : t('profile.subscription.expiresOn'),
        date: formattedDate,
      };
    }

    return {
      label: t('profile.subscription.statusText.activeSubscription'),
      date: null,
    };
  }, [isPro, activeSubscription, t]);

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

  const backButtonStyle = useMemo(() => ({
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
    borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
  }), [isDark]);

  const spacerStyle = useMemo(() => ({ width: 40 }), []);

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
              style={[styles.backButton, backButtonStyle]}
              onPress={handleGoBack}
              hitSlop={12}
            >
              <ArrowLeft size={20} color={colors.text} />
            </Pressable>
            <Text style={[styles.headerTitle, { color: colors.text }]}>
              {t('profile.subscription.title')}
            </Text>
            <View style={spacerStyle} />
          </View>

          <AnimatedView
            entering={FadeInDown.delay(0).duration(300).easing(Easing.out(Easing.ease))}
          >
            <Text style={[styles.description, { color: colors.textSecondary }]}>
              {t('profile.subscription.managePlan')}
            </Text>
          </AnimatedView>

          {/* Hero Card - NEO Style */}
          <AnimatedView
            entering={FadeInDown.delay(50).duration(300).easing(Easing.out(Easing.ease))}
            style={styles.neoCard}
          >
            {/* Background image */}
            <Image
              source={require('@/assets/images/subscriptions.png')}
              style={styles.neoBackgroundImage}
              resizeMode="cover"
            />

            {/* Top labels */}
            <View style={styles.neoTopLabels}>
              <Text style={styles.neoLabel}>DOPPLER</Text>
              <Text style={styles.neoTitle}>
                {isPro ? TIER_DISPLAY_NAMES[tier] : 'Premium'}
              </Text>
            </View>

            {/* Bottom section with blur */}
            <BlurView intensity={80} tint="dark" style={styles.neoBottomSection}>
              <View style={styles.neoBottomContent}>
                <View style={styles.neoBottomTextContainer}>
                  <Text style={styles.neoBottomTitle}>
                    {isPro
                      ? (statusInfo?.date ? `${statusInfo.label}` : t('profile.subscription.status.active'))
                      : t('profile.subscription.upgradeToPremium')}
                  </Text>
                  <Text style={styles.neoBottomSubtitle}>
                    {isPro
                      ? (statusInfo?.date || t('profile.subscription.statusText.activeSubscription'))
                      : t('profile.subscription.premiumFeatures')}
                  </Text>
                </View>

                <Pressable
                  onPress={isPro ? handleManageSubscription : handleUpgrade}
                  style={({ pressed }) => [
                    styles.neoButton,
                    pressed && styles.neoButtonPressed,
                  ]}
                >
                  <Text style={styles.neoButtonText}>
                    {isPro
                      ? t('profile.subscription.cta.manage')
                      : t('profile.subscription.cta.upgrade')}
                  </Text>
                </Pressable>
              </View>
            </BlurView>
          </AnimatedView>

          {/* Management Card - Contains all actions */}
          <AnimatedView
            entering={FadeInDown.delay(100).duration(300).easing(Easing.out(Easing.ease))}
            style={[styles.managementCard, cardStyle]}
          >
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

  // NEO Style Card - matches HeroUI background image card
  neoCard: {
    backgroundColor: '#F5F5F0',
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 16,
    height: 340,
  },
  neoBackgroundImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  neoTopLabels: {
    position: 'absolute',
    top: 20,
    left: 20,
    zIndex: 10,
  },
  neoLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(0, 0, 0, 0.5)',
    marginBottom: 2,
  },
  neoTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: 'rgba(0, 0, 0, 0.85)',
    letterSpacing: -0.3,
  },
  neoBottomSection: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  neoBottomContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  neoBottomTextContainer: {
    flex: 1,
  },
  neoBottomTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  neoBottomSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 2,
  },
  neoButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
  },
  neoButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  neoButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000000',
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
