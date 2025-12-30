import React, { useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  CheckCircle,
  Crown,
  Shield,
  Globe,
  Smartphone,
  Zap,
  PartyPopper,
  ArrowRight,
} from 'lucide-react-native';
import Animated, {
  FadeInDown,
  FadeInUp,
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { useTheme } from '@/context/ThemeContext';
import { useTier, TIER_DISPLAY_NAMES } from '@/context/TierContext';

const AnimatedView = Animated.createAnimatedComponent(View);
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Features unlocked with Pro - labels will be resolved from translations
const PRO_FEATURES = [
  { icon: Globe, labelKey: 'profile.thankYou.features.premiumServers', color: '#3B82F6' },
  { icon: Shield, labelKey: 'profile.thankYou.features.adBlocking', color: '#22C55E' },
  { icon: Zap, labelKey: 'profile.thankYou.features.contentFilter', color: '#8B5CF6' },
  { icon: Smartphone, labelKey: 'profile.thankYou.features.devices', color: '#F59E0B' },
];

export default function ThankYouScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { tier, tierDisplayName } = useTier();
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ plan?: string }>();

  // Animation values
  const checkScale = useSharedValue(0);
  const confettiOpacity = useSharedValue(0);
  const buttonScale = useSharedValue(1);
  const containerOpacity = useSharedValue(0);

  // Trigger success haptic and animations on mount
  useEffect(() => {
    // Success haptic
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Container fade in
    containerOpacity.value = withDelay(
      100,
      withTiming(1, { duration: 400 })
    );

    // Check mark animation
    checkScale.value = withDelay(
      200,
      withSpring(1, { damping: 8, stiffness: 200 })
    );

    // Confetti/celebration animation
    confettiOpacity.value = withDelay(
      400,
      withSequence(
        withTiming(1, { duration: 400 }),
        withTiming(0.6, { duration: 1000 })
      )
    );
  }, []);

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
  }));

  const checkAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  const confettiAnimatedStyle = useAnimatedStyle(() => ({
    opacity: confettiOpacity.value,
  }));

  const handleContinue = useCallback(() => {
    buttonScale.value = withSequence(
      withSpring(0.95, { damping: 12 }),
      withSpring(1, { damping: 12 })
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Navigate to home tab
    router.replace('/(tabs)');
  }, [router, buttonScale]);

  const handleViewSubscription = useCallback(() => {
    router.push('/(tabs)/profile/subscription');
  }, [router]);

  const gradientColors = useMemo(() =>
    isDark
      ? ['#000000', '#0a0a0a', '#000000'] as const
      : ['#ffffff', '#fafafa', '#f5f5f5'] as const,
    [isDark]
  );

  const cardStyle = useMemo(() => ({
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.8)',
    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
  }), [isDark]);

  const purchasedPlan = params.plan || tierDisplayName;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <LinearGradient
        colors={gradientColors}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.content, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 40 }]}>
        {/* Success Icon with Animation */}
        <Animated.View
          style={[styles.successContainer, containerAnimatedStyle]}
        >
          {/* Celebration effect background */}
          <Animated.View style={[styles.celebrationBg, confettiAnimatedStyle]}>
            <LinearGradient
              colors={['rgba(255, 215, 0, 0.2)', 'transparent']}
              style={styles.celebrationGradient}
            />
          </Animated.View>

          {/* Crown icon */}
          <Animated.View style={[styles.crownContainer, checkAnimatedStyle]}>
            <LinearGradient
              colors={['#FFD700', '#FFA500']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.crownGradient}
            >
              <Crown size={48} color="#FFFFFF" />
            </LinearGradient>
          </Animated.View>

          {/* Check badge */}
          <Animated.View style={[styles.checkBadge, checkAnimatedStyle]}>
            <CheckCircle size={28} color="#22C55E" fill="#22C55E" />
          </Animated.View>
        </Animated.View>

        {/* Thank You Text */}
        <AnimatedView
          entering={FadeInDown.delay(300).duration(400).easing(Easing.out(Easing.ease))}
          style={styles.textContainer}
        >
          <Text style={[styles.title, { color: colors.text }]}>
            Thank You!
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Welcome to {purchasedPlan}
          </Text>
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            Your subscription is now active. Enjoy all the premium features!
          </Text>
        </AnimatedView>

        {/* Features Unlocked */}
        <AnimatedView
          entering={FadeInDown.delay(500).duration(400).easing(Easing.out(Easing.ease))}
          style={[styles.featuresCard, cardStyle]}
        >
          <View style={styles.featuresHeader}>
            <PartyPopper size={18} color="#FFD700" />
            <Text style={[styles.featuresTitle, { color: colors.text }]}>
              Features Unlocked
            </Text>
          </View>

          <View style={styles.featuresList}>
            {PRO_FEATURES.map((feature, index) => (
              <AnimatedView
                key={feature.labelKey}
                entering={FadeInDown.delay(600 + index * 100).duration(300)}
                style={styles.featureItem}
              >
                <View style={[styles.featureIcon, { backgroundColor: `${feature.color}20` }]}>
                  <feature.icon size={20} color={feature.color} />
                </View>
                <Text style={[styles.featureLabel, { color: colors.text }]}>
                  {t(feature.labelKey)}
                </Text>
                <CheckCircle size={18} color={colors.success} />
              </AnimatedView>
            ))}
          </View>
        </AnimatedView>

        {/* Action Buttons */}
        <AnimatedView
          entering={FadeInUp.delay(900).duration(400).easing(Easing.out(Easing.ease))}
          style={styles.actionsContainer}
        >
          <Pressable
            onPress={handleContinue}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
            ]}
          >
            <LinearGradient
              colors={['#3B82F6', '#2563EB']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.primaryButtonGradient}
            >
              <Text style={styles.primaryButtonText}>Start Exploring</Text>
              <ArrowRight size={20} color="#FFFFFF" />
            </LinearGradient>
          </Pressable>

          <Pressable
            onPress={handleViewSubscription}
            style={({ pressed }) => [
              styles.secondaryButton,
              { borderColor: colors.border },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.textSecondary }]}>
              View Subscription Details
            </Text>
          </Pressable>
        </AnimatedView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Success Icon
  successContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  celebrationBg: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
  },
  celebrationGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 100,
  },
  crownContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    overflow: 'hidden',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
  },
  crownGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  // Text
  textContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  description: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  // Features Card
  featuresCard: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    marginBottom: 32,
  },
  featuresHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  featuresTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  featuresList: {
    gap: 12,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  // Actions
  actionsContainer: {
    width: '100%',
    gap: 12,
  },
  primaryButton: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
  },
  primaryButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  secondaryButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '500',
  },
});
