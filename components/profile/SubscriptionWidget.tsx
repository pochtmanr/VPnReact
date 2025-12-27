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

import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
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
  const { account } = useAuth();
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 200);
    return () => clearTimeout(timer);
  }, []);

  const { currentTier, tierData } = useMemo(() => {
    const tierInfo = {
      free: { name: 'Free', color: colors.textMuted },
      pro: { name: 'Pro', color: colors.primary },
      premium: { name: 'Premium', color: colors.info },
    };
    const tier = (account?.subscription_tier || 'free') as keyof typeof tierInfo;
    return { currentTier: tier, tierData: tierInfo[tier] };
  }, [account?.subscription_tier, colors.textMuted, colors.primary, colors.info]);

  return (
    <AnimatedView
      entering={FadeInDown.delay(animationDelay).duration(300).easing(Easing.out(Easing.ease))}
      style={[styles.card, cardStyle]}
    >
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Subscription</Text>

      {isLoading ? (
        <SkeletonSubscription />
      ) : (
        <Pressable
          onPress={() => router.push('/(tabs)/profile/subscription')}
          style={({ pressed }) => [
            styles.subscriptionRow,
            pressed && { opacity: 0.7 },
          ]}
        >
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
              {tierData.name} Plan
            </Text>
            <Text style={[styles.subscriptionStatus, { color: colors.textSecondary }]}>
              {currentTier === 'free' ? 'Upgrade to unlock all features' : 'Active subscription'}
            </Text>
          </View>
          <ChevronRight size={20} color={colors.textMuted} />
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
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
