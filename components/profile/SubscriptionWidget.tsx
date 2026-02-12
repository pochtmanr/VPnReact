import React, { memo, useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
} from 'react-native';
import { Crown, Shield, ChevronRight } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, Easing } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/context/ThemeContext';
import { useTier } from '@/context/TierContext';
import { SkeletonSubscription } from '@/components/ui/Skeleton';

const AnimatedView = Animated.createAnimatedComponent(View);

interface SubscriptionWidgetProps {
  cardStyle: { backgroundColor: string; borderColor: string };
  animationDelay?: number;
}

export const SubscriptionWidget = memo(function SubscriptionWidget({
  cardStyle,
  animationDelay = 100,
}: SubscriptionWidgetProps) {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const { t } = useTranslation();

  // Use useTier() for the merged tier (RevenueCat + database fallback)
  // This ensures cross-platform subscription sync works correctly
  const { tier: currentTier } = useTier();

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 200);
    return () => clearTimeout(timer);
  }, []);

  const tierData = useMemo(() => {
    const tierInfo = {
      free: { nameKey: 'tier.free', color: colors.textMuted },
      pro: { nameKey: 'profile.subscription.plans.pro', color: colors.primary },
      premium: { nameKey: 'tier.premium', color: colors.info },
    };
    return tierInfo[currentTier];
  }, [currentTier, colors.textMuted, colors.primary, colors.info]);

  return (
    <AnimatedView
      entering={FadeInDown.delay(animationDelay).duration(300).easing(Easing.out(Easing.ease))}
      style={[styles.card, cardStyle]}
    >
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('profile.subscription.title')}</Text>

      {isLoading ? (
        <SkeletonSubscription />
      ) : (
        <Pressable
          onPress={() => router.push('/(tabs)/profile/subscription')}
          style={styles.subscriptionRow}
        >
          {({ pressed }) => (
          <View style={[styles.subscriptionRowInner, pressed && { opacity: 0.7 }]}>
          <View style={[styles.subscriptionIcon, {
            backgroundColor: currentTier === 'free'
              ? (isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)')
              : '#FFD70020'
          }]}>
            {currentTier === 'free' ? (
              <Shield size={22} color={colors.textMuted} />
            ) : (
              <Crown size={22} color="#FFD700" />
            )}
          </View>
          <View style={styles.subscriptionInfo}>
            <Text style={[styles.subscriptionPlan, { color: colors.text }]}>
              {t(tierData.nameKey)}
            </Text>
            <Text style={[styles.subscriptionStatus, { color: colors.textSecondary }]}>
              {currentTier === 'free'
                ? t('profile.subscription.statusText.upgradePrompt')
                : t('profile.subscription.statusText.activeSubscription')}
            </Text>
          </View>
          <ChevronRight size={20} color={colors.textMuted} />
          </View>
          )}
        </Pressable>
      )}
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  subscriptionRow: {
    paddingVertical: 12,
  },
  subscriptionRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  subscriptionIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subscriptionInfo: {
    flex: 1,
  },
  subscriptionPlan: {
    fontSize: 17,
    fontWeight: '600',
  },
  subscriptionStatus: {
    fontSize: 13,
    marginTop: 2,
  },
});
