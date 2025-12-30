import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Calendar, CheckCircle, Crown, RefreshCw } from 'lucide-react-native';
import React, { useMemo } from 'react';
import {
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useRevenueCat } from '@/context/RevenueCatContext';

// Map product identifiers to translation keys
const PLAN_TRANSLATION_KEYS: Record<string, string> = {
  'vpn_premium_monthly': 'auth.subscriptionSuccess.plans.monthly',
  'vpn_premium_6m': 'auth.subscriptionSuccess.plans.sixMonths',
  'vpn_premium_yearly': 'auth.subscriptionSuccess.plans.yearly',
};

export default function SubscriptionSuccessScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ restored?: string }>();
  const { activeSubscription } = useRevenueCat();
  const { t, i18n } = useTranslation();

  const isRestored = params.restored === 'true';

  const planName = useMemo(() => {
    if (!activeSubscription?.productIdentifier) return t('tier.premium');
    const translationKey = PLAN_TRANSLATION_KEYS[activeSubscription.productIdentifier];
    return translationKey ? t(translationKey) : t('tier.premium');
  }, [activeSubscription?.productIdentifier, t]);

  const renewalDate = useMemo(() => {
    if (!activeSubscription?.expirationDate) return t('profile.subscription.statusText.lifetimeAccess');
    return activeSubscription.expirationDate.toLocaleDateString(i18n.language === 'ru' ? 'ru-RU' : 'en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }, [activeSubscription?.expirationDate, t, i18n.language]);

  const autoRenewStatus = activeSubscription?.willRenew
    ? t('common.status.enabled')
    : t('common.status.disabled');

  const handleContinue = () => {
    router.replace('/(tabs)');
  };

  const handleManageSubscription = async () => {
    const url = Platform.select({
      ios: 'https://apps.apple.com/account/subscriptions',
      android: 'https://play.google.com/store/account/subscriptions',
      default: '',
    });

    if (url) {
      await Linking.openURL(url);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Background Gradient - Matches welcome screen */}
      <LinearGradient
        colors={['#0a0a0a', '#000000', '#0a0a0a']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View
        style={[
          styles.content,
          {
            paddingTop: insets.top + 40,
            paddingBottom: insets.bottom + 20,
          },
        ]}
      >
        {/* Success Icon */}
        <View style={styles.iconContainer}>
          <View style={styles.iconBackground}>
            <CheckCircle size={64} color="#22C55E" strokeWidth={1.5} />
          </View>
        </View>

        {/* Title */}
        <Text style={styles.title}>
          {isRestored ? t('auth.subscriptionSuccess.welcomeBack') : t('auth.subscriptionSuccess.allSet')}
        </Text>

        {/* Subtitle */}
        <Text style={styles.subtitle}>
          {isRestored
            ? t('profile.subscription.statusText.activeSubscription')
            : t('profile.subscription.statusText.activeSubscription')}
        </Text>

        {/* Subscription Details Card */}
        <View style={styles.detailsCard}>
          {/* Plan */}
          <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
              <Crown size={18} color="#FFD700" />
            </View>
            <Text style={styles.detailLabel}>{t('profile.subscription.currentPlan')}</Text>
            <Text style={styles.detailValue}>{planName}</Text>
          </View>

          <View style={styles.divider} />

          {/* Renewal Date */}
          <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
              <Calendar size={18} color="rgba(255, 255, 255, 0.6)" />
            </View>
            <Text style={styles.detailLabel}>
              {activeSubscription?.willRenew
                ? t('profile.subscription.statusText.renewsOn', { date: '' }).replace('{{date}}', '').trim()
                : t('profile.subscription.statusText.accessUntil', { date: '' }).replace('{{date}}', '').trim()}
            </Text>
            <Text style={styles.detailValue}>{renewalDate}</Text>
          </View>

          <View style={styles.divider} />

          {/* Auto-renew */}
          <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
              <RefreshCw size={18} color="rgba(255, 255, 255, 0.6)" />
            </View>
            <Text style={styles.detailLabel}>{t('common.status.active')}</Text>
            <Text style={[
              styles.detailValue,
              { color: activeSubscription?.willRenew ? '#22C55E' : 'rgba(255, 255, 255, 0.6)' }
            ]}>
              {autoRenewStatus}
            </Text>
          </View>
        </View>

        {/* Spacer */}
        <View style={styles.spacer} />

        {/* Bottom Section */}
        <View style={styles.bottomSection}>
          {/* Primary CTA */}
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
            ]}
            onPress={handleContinue}
          >
            <LinearGradient
              colors={['#3B82F6', '#2563EB']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.buttonGradient}
            >
              <Text style={styles.primaryButtonText}>{t('common.buttons.continue')}</Text>
            </LinearGradient>
          </Pressable>

          {/* Secondary Link */}
          <Pressable
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && { opacity: 0.7 },
            ]}
            onPress={handleManageSubscription}
          >
            <Text style={styles.secondaryButtonText}>{t('profile.subscription.cta.manage')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  // Success Icon
  iconContainer: {
    marginBottom: 32,
  },
  iconBackground: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Title & Subtitle
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 17,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    marginBottom: 40,
  },
  // Details Card
  detailsCard: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 20,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  detailIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  detailLabel: {
    flex: 1,
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  detailValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginLeft: 44,
  },
  // Spacer
  spacer: {
    flex: 1,
  },
  // Bottom Section
  bottomSection: {
    width: '100%',
    gap: 16,
  },
  primaryButton: {
    borderRadius: 9999,
    overflow: 'hidden',
  },
  buttonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 9999,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  secondaryButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: '#3B82F6',
    fontSize: 15,
    fontWeight: '500',
  },
});
