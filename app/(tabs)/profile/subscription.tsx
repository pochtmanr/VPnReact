import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  ArrowLeft,
  ChevronRight,
  Crown,
  ExternalLink,
  HelpCircle,
  RefreshCw,
  Shield,
} from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
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
import { useTheme } from '@/context/ThemeContext';
import { TIER_DISPLAY_NAMES, useTier } from '@/context/TierContext';

// TODO: Uncomment when RevenueCat is installed
// import Purchases from 'react-native-purchases';
// import { RevenueCatUI } from 'react-native-purchases-ui';

const AnimatedView = Animated.createAnimatedComponent(View);

export default function SubscriptionScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { tier, isPro } = useTier();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

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
        'Unable to Open',
        'Please manage your subscription in Settings > Apple ID > Subscriptions'
      );
    }
  }, []);

  // Restore purchases - required by Apple
  const handleRestorePurchases = useCallback(async () => {
    setIsLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      // TODO: Uncomment when RevenueCat is installed
      // const customerInfo = await Purchases.restorePurchases();
      // if (customerInfo.activeSubscriptions.length > 0) {
      //   Alert.alert('Success', 'Your purchases have been restored!');
      // } else {
      //   Alert.alert('No Purchases Found', 'No previous purchases were found for this account.');
      // }

      await new Promise(resolve => setTimeout(resolve, 1500));
      Alert.alert('No Purchases Found', 'No previous purchases were found for this account.');
    } catch (error) {
      console.error('Error restoring purchases:', error);
      Alert.alert('Error', 'Failed to restore purchases. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

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
              Subscription
            </Text>
            <View style={{ width: 40 }} />
          </View>

          <AnimatedView
            entering={FadeInDown.delay(0).duration(300).easing(Easing.out(Easing.ease))}
          >
            <Text style={[styles.description, { color: colors.textSecondary }]}>
              Manage your plan
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
              <Text style={[styles.planLabel, { color: colors.textSecondary }]}>Current Plan</Text>
              <Text style={[styles.planName, { color: colors.text }]}>
                {TIER_DISPLAY_NAMES[tier]}
              </Text>
              {isPro && (
                <View style={[styles.activeBadge, { backgroundColor: `${colors.success}15` }]}>
                  <View style={[styles.activeDot, { backgroundColor: colors.success }]} />
                  <Text style={[styles.activeBadgeText, { color: colors.success }]}>Active</Text>
                </View>
              )}
            </View>

            {/* Upgrade CTA for free users */}
            {!isPro && (
              <View style={styles.upgradeSection}>
                <Text style={[styles.upgradeText, { color: colors.text }]}>
                  Upgrade to Pro
                </Text>
                <Text style={[styles.upgradeSubtext, { color: colors.textSecondary }]}>
                  Unlock all premium features
                </Text>
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
                  Manage in {Platform.OS === 'ios' ? 'App Store' : 'Play Store'}
                </Text>
                <Text style={[styles.menuDescription, { color: colors.textSecondary }]}>
                  Change or cancel subscription
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
                <Text style={[styles.menuLabel, { color: colors.text }]}>Restore Purchases</Text>
                <Text style={[styles.menuDescription, { color: colors.textSecondary }]}>
                  Restore previous subscriptions
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
                <Text style={[styles.menuLabel, { color: colors.text }]}>Subscription Help</Text>
                <Text style={[styles.menuDescription, { color: colors.textSecondary }]}>
                  FAQ and support
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
                ? 'Subscriptions are managed through the App Store. You can cancel anytime in your Apple ID settings.'
                : 'Subscriptions are managed through Google Play. You can cancel anytime in your Play Store settings.'}
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
    marginLeft: 64,
    marginRight: 12,
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
