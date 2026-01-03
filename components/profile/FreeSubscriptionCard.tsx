import React, { memo, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
} from 'react-native';
import Animated, { FadeInDown, Easing } from 'react-native-reanimated';
import { Shield, ChevronRight } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/context/ThemeContext';

const AnimatedView = Animated.createAnimatedComponent(View);

interface FreeSubscriptionCardProps {
  cardStyle: { backgroundColor: string; borderColor: string };
  animationDelay?: number;
}

/**
 * FreeSubscriptionCard - Simple card for free-tier users
 * Matches the styling of AccountCard and other menu cards
 */
export const FreeSubscriptionCard = memo(function FreeSubscriptionCard({
  cardStyle,
  animationDelay = 100,
}: FreeSubscriptionCardProps) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();

  const handlePress = useCallback(() => {
    router.push('/(tabs)/profile/subscription');
  }, [router]);

  return (
    <AnimatedView
      entering={FadeInDown.delay(animationDelay).duration(300).easing(Easing.out(Easing.ease))}
      style={[styles.card, cardStyle]}
    >
      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        {t('profile.subscription.title')}
      </Text>

      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          styles.row,
          pressed && { opacity: 0.7 },
        ]}
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel={t('profile.subscription.accessibility.viewSubscription')}
      >
        {/* Icon */}
        <View
          style={[
            styles.iconContainer,
            { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)' },
          ]}
        >
          <Shield size={22} color={colors.textMuted} />
        </View>

        {/* Info */}
        <View style={styles.infoContainer}>
          <Text style={[styles.planName, { color: colors.text }]}>
            {t('profile.subscription.plans.free')}
          </Text>
          <Text style={[styles.statusText, { color: colors.textSecondary }]}>
            {t('profile.subscription.statusText.upgradePrompt')}
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
  planName: {
    fontSize: 17,
    fontWeight: '600',
  },
  statusText: {
    fontSize: 13,
    marginTop: 2,
  },
});
