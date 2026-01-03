import React, { memo, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Crown, ChevronRight, AlertCircle, RefreshCw } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, Easing } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/context/ThemeContext';
import { useRevenueCat } from '@/context/RevenueCatContext';
import { SkeletonSubscription } from '@/components/ui/Skeleton';

const AnimatedView = Animated.createAnimatedComponent(View);

// Subscription status types
type SubscriptionStatus = 'free' | 'active' | 'canceled' | 'expired' | 'grace_period';

interface StatusConfig {
  label: string;
  color: string;
  backgroundColor: string;
}

interface SubscriptionCardProps {
  cardStyle: { backgroundColor: string; borderColor: string };
  animationDelay?: number;
}

// Format date as "Jan 15, 2026"
function formatDate(date: Date | null): string {
  if (!date) return '';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export const SubscriptionCard = memo(function SubscriptionCard({
  cardStyle,
  animationDelay = 100,
}: SubscriptionCardProps) {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const {
    currentTier,
    activeSubscription,
    isLoading: rcLoading,
    isInitialized,
    error: rcError,
    refreshCustomerInfo,
    isMockMode,
  } = useRevenueCat();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Show loading only when RevenueCat hasn't initialized yet
  const isLoading = rcLoading && !isInitialized;

  // Determine subscription status
  const subscriptionStatus = useMemo((): SubscriptionStatus => {
    if (currentTier === 'free') return 'free';

    if (!activeSubscription) return 'free';

    // Check for grace period (billing issue)
    if (activeSubscription.isInGracePeriod) return 'grace_period';

    // Check if expired
    if (activeSubscription.expirationDate) {
      const now = new Date();
      if (activeSubscription.expirationDate < now) return 'expired';
    }

    // Check if canceled (won't renew)
    if (!activeSubscription.willRenew) return 'canceled';

    return 'active';
  }, [currentTier, activeSubscription]);

  // Status badge configuration
  const statusConfig = useMemo((): StatusConfig | null => {
    switch (subscriptionStatus) {
      case 'active':
        return {
          label: t('profile.subscription.status.active'),
          color: '#22C55E',
          backgroundColor: 'rgba(34, 197, 94, 0.15)',
        };
      case 'canceled':
        return {
          label: t('profile.subscription.status.canceled'),
          color: '#EAB308',
          backgroundColor: 'rgba(234, 179, 8, 0.15)',
        };
      case 'expired':
        return {
          label: t('profile.subscription.status.expired'),
          color: colors.textMuted,
          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
        };
      case 'grace_period':
        return {
          label: t('profile.subscription.status.gracePeriod'),
          color: '#F97316',
          backgroundColor: 'rgba(249, 115, 22, 0.15)',
        };
      default:
        return null;
    }
  }, [subscriptionStatus, colors.textMuted, isDark, t]);

  // Plan display name
  const planName = useMemo(() => {
    switch (currentTier) {
      case 'premium':
        return t('profile.subscription.plans.premium');
      case 'pro':
        return t('profile.subscription.plans.pro');
      default:
        return t('profile.subscription.plans.free');
    }
  }, [currentTier, t]);

  // Status text (renewal/expiration info)
  const statusText = useMemo(() => {
    if (subscriptionStatus === 'free') {
      return t('profile.subscription.statusText.upgradePrompt');
    }

    if (subscriptionStatus === 'grace_period') {
      return t('profile.subscription.statusText.updatePayment');
    }

    const date = activeSubscription?.expirationDate;
    if (!date) return t('profile.subscription.statusText.activeSubscription');

    const formattedDate = formatDate(date);
    switch (subscriptionStatus) {
      case 'active':
        return t('profile.subscription.statusText.renewsOn', { date: formattedDate });
      case 'canceled':
        return t('profile.subscription.statusText.accessUntil', { date: formattedDate });
      case 'expired':
        return t('profile.subscription.statusText.expiredOn', { date: formattedDate });
      default:
        return t('profile.subscription.statusText.activeSubscription');
    }
  }, [subscriptionStatus, activeSubscription?.expirationDate, t]);

  // Handle card press - go to subscription details
  const handleCardPress = useCallback(() => {
    router.push('/(tabs)/profile/subscription');
  }, [router]);

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    if (isMockMode) return;
    setIsRefreshing(true);
    setError(null);
    try {
      await refreshCustomerInfo();
    } catch (e) {
      setError(t('profile.subscription.loadError'));
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshCustomerInfo, isMockMode, t]);

  // Show loading state
  if (isLoading) {
    return (
      <AnimatedView
        entering={FadeInDown.delay(animationDelay).duration(300).easing(Easing.out(Easing.ease))}
        style={[styles.card, cardStyle]}
      >
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('profile.subscription.title')}</Text>
        <SkeletonSubscription />
      </AnimatedView>
    );
  }

  // Show error state
  if (error || rcError) {
    return (
      <AnimatedView
        entering={FadeInDown.delay(animationDelay).duration(300).easing(Easing.out(Easing.ease))}
        style={[styles.card, cardStyle]}
      >
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('profile.subscription.title')}</Text>
        <Pressable onPress={handleRefresh} style={styles.errorContainer}>
          <AlertCircle size={20} color={colors.error} />
          <Text style={[styles.errorText, { color: colors.textSecondary }]}>
            {error || rcError || t('profile.subscription.loadError')}
          </Text>
          {isRefreshing ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <RefreshCw size={18} color={colors.primary} />
          )}
        </Pressable>
      </AnimatedView>
    );
  }

  return (
    <AnimatedView
      entering={FadeInDown.delay(animationDelay).duration(300).easing(Easing.out(Easing.ease))}
      style={[styles.card, cardStyle]}
    >
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('profile.subscription.title')}</Text>

      <Pressable
        onPress={handleCardPress}
        style={({ pressed }) => [
          styles.row,
          pressed && { opacity: 0.7 },
        ]}
      >
        {/* Icon */}
        <View style={[styles.iconContainer, { backgroundColor: '#FFD70020' }]}>
          <Crown size={22} color="#FFD700" />
        </View>

        {/* Info */}
        <View style={styles.infoContainer}>
          <View style={styles.planRow}>
            <Text style={[styles.planName, { color: colors.text }]}>
              {planName}
            </Text>
            {statusConfig && (
              <View style={[styles.statusBadge, { backgroundColor: statusConfig.backgroundColor }]}>
                <Text style={[styles.statusBadgeText, { color: statusConfig.color }]}>
                  {statusConfig.label}
                </Text>
              </View>
            )}
          </View>
          <Text style={[styles.statusText, { color: colors.textSecondary }]}>
            {statusText}
          </Text>
        </View>

        <ChevronRight size={20} color={colors.textMuted} />
      </Pressable>
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
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoContainer: {
    flex: 1,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  planName: {
    fontSize: 17,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  statusText: {
    fontSize: 13,
    marginTop: 2,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
  },
});
