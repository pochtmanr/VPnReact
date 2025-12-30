import { SubscriptionPackage, usePaywall } from '@/context/RevenueCatContext';
import { useTheme } from '@/context/ThemeContext';
import {
    Feature,
    FEATURE_INFO,
    TIER_DISPLAY_NAMES,
    useTier,
} from '@/context/TierContext';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import {
    Check,
    Crown,
    Globe,
    Shield,
    Smartphone,
    X,
    Zap,
} from 'lucide-react-native';
import React, { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ActivityIndicator,
    Alert,
    Modal,
    StyleSheet,
    Text,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from 'react-native';

interface UpgradePromptProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Callback when modal is closed */
  onClose: () => void;
  /** Specific feature that triggered the prompt (for contextual messaging) */
  feature?: Feature;
  /** Custom title override */
  title?: string;
  /** Custom subtitle override */
  subtitle?: string;
}

// Pro tier features to display in the modal - using translation keys
const PRO_FEATURES = [
  { icon: Globe, labelKey: 'tier.features.premiumServers.title', descKey: 'tier.features.premiumServers.description' },
  { icon: Shield, labelKey: 'tier.features.adBlocking.title', descKey: 'tier.features.adBlocking.description' },
  { icon: Smartphone, labelKey: 'tier.features.devices.title', descKey: 'tier.features.devices.description' },
  { icon: Zap, labelKey: 'tier.features.parentalControls.title', descKey: 'tier.features.parentalControls.description' },
];

/**
 * Modal component that prompts users to upgrade to Pro.
 * Shows feature benefits and package selection for subscription purchase.
 * Uses RevenueCat core SDK (not RevenueCatUI which is incompatible with New Architecture).
 */
export const UpgradePrompt = memo(function UpgradePrompt({
  visible,
  onClose,
  feature,
  title,
  subtitle,
}: UpgradePromptProps) {
  const { colors, isDark } = useTheme();
  const { tier, getUpgradePath, getRequiredTierForFeature } = useTier();
  const { t } = useTranslation();
  const {
    packages,
    monthlyPackage,
    yearlyPackage,
    purchasePackage,
    restorePurchases,
    isLoading,
    savingsPercentage,
    isMockMode,
  } = usePaywall();

  const [selectedPackage, setSelectedPackage] = useState<SubscriptionPackage | null>(null);
  const [isPurchasing, setIsPurchasing] = useState(false);

  // Determine what tier is needed
  const requiredTier = feature
    ? getRequiredTierForFeature(feature)
    : getUpgradePath();

  const upgradeTierName = requiredTier ? TIER_DISPLAY_NAMES[requiredTier] : 'Pro';

  // Get feature-specific messaging
  const featureInfo = feature ? FEATURE_INFO[feature] : null;

  const displayTitle = title || (featureInfo
    ? `Unlock ${featureInfo.name}`
    : t('tier.paywall.title'));

  const displaySubtitle = subtitle || (featureInfo
    ? featureInfo.description
    : t('tier.paywall.subtitle'));

  // Handle package purchase
  const handlePurchase = useCallback(async (pkg: SubscriptionPackage) => {
    if (isMockMode) {
      Alert.alert(t('common.status.error'), t('tier.devMode'));
      return;
    }

    setIsPurchasing(true);
    try {
      const result = await purchasePackage(pkg);
      if (result.success) {
        Alert.alert(t('common.status.success'), t('tier.purchaseSuccess'), [
          { text: 'OK', onPress: onClose }
        ]);
      } else if (result.error && result.error !== 'Purchase cancelled') {
        Alert.alert(t('common.status.error'), result.error);
      }
    } catch (err) {
      Alert.alert(t('common.status.error'), t('tier.purchaseError'));
    } finally {
      setIsPurchasing(false);
    }
  }, [purchasePackage, onClose, isMockMode, t]);

  // Handle restore purchases
  const handleRestore = useCallback(async () => {
    setIsPurchasing(true);
    try {
      const result = await restorePurchases();
      if (result.success) {
        if (result.restored) {
          Alert.alert(t('common.status.success'), t('tier.purchaseSuccess'), [
            { text: 'OK', onPress: onClose }
          ]);
        } else {
          Alert.alert(t('common.status.error'), t('tier.noPurchases'));
        }
      } else if (result.error) {
        Alert.alert(t('common.status.error'), result.error);
      }
    } finally {
      setIsPurchasing(false);
    }
  }, [restorePurchases, onClose, t]);

  // Memoize styles
  const containerStyle = useMemo(() => ({
    backgroundColor: isDark ? 'rgba(20, 20, 20, 0.98)' : 'rgba(255, 255, 255, 0.98)',
  }), [isDark]);

  const featureItemBg = useMemo(() =>
    isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
    [isDark]
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <BlurView intensity={20} style={StyleSheet.absoluteFill} />
          <TouchableWithoutFeedback>
            <View style={[styles.container, containerStyle]}>
              {/* Close button */}
              <TouchableOpacity
                style={styles.closeButton}
                onPress={onClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={24} color={colors.textSecondary} />
              </TouchableOpacity>

              {/* Crown icon with gradient background */}
              <LinearGradient
                colors={['#FFD700', '#FFA500']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.crownContainer}
              >
                <Crown size={32} color="#FFFFFF" />
              </LinearGradient>

              {/* Title and subtitle */}
              <Text style={[styles.title, { color: colors.text }]}>
                {displayTitle}
              </Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                {displaySubtitle}
              </Text>

              {/* Current tier badge */}
              <View style={[styles.currentTierBadge, { backgroundColor: featureItemBg }]}>
                <Text style={[styles.currentTierText, { color: colors.textSecondary }]}>
                  {t('profile.subscription.currentPlan')}: <Text style={{ color: colors.text, fontWeight: '600' }}>
                    {TIER_DISPLAY_NAMES[tier]}
                  </Text>
                </Text>
              </View>

              {/* Feature list */}
              <View style={styles.featureList}>
                {PRO_FEATURES.map((item, index) => (
                  <View
                    key={index}
                    style={[styles.featureItem, { backgroundColor: featureItemBg }]}
                  >
                    <View style={styles.featureIcon}>
                      <item.icon size={20} color="#FFD700" />
                    </View>
                    <View style={styles.featureText}>
                      <Text style={[styles.featureLabel, { color: colors.text }]}>
                        {t(item.labelKey)}
                      </Text>
                      <Text style={[styles.featureDescription, { color: colors.textSecondary }]}>
                        {t(item.descKey)}
                      </Text>
                    </View>
                    <Check size={18} color={colors.success} />
                  </View>
                ))}
              </View>

              {/* Package selection */}
              <View style={styles.packageList}>
                {yearlyPackage && (
                  <TouchableOpacity
                    style={[
                      styles.packageOption,
                      {
                        backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)',
                        borderColor: '#3B82F6',
                        borderWidth: 2,
                      },
                    ]}
                    onPress={() => handlePurchase(yearlyPackage)}
                    disabled={isPurchasing || isLoading}
                    activeOpacity={0.8}
                  >
                    {savingsPercentage && (
                      <View style={styles.savingsBadge}>
                        <Text style={styles.savingsText}>{t('tier.paywall.save', { percent: savingsPercentage })}</Text>
                      </View>
                    )}
                    <Text style={[styles.packageName, { color: colors.text }]}>
                      {t('tier.paywall.yearly')}
                    </Text>
                    <Text style={[styles.packagePrice, { color: colors.text }]}>
                      {yearlyPackage.product.priceString}
                    </Text>
                    <Text style={[styles.packagePeriod, { color: colors.textSecondary }]}>
                      {t('tier.paywall.perYear')}
                    </Text>
                  </TouchableOpacity>
                )}

                {monthlyPackage && (
                  <TouchableOpacity
                    style={[
                      styles.packageOption,
                      {
                        backgroundColor: featureItemBg,
                        borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
                        borderWidth: 1,
                      },
                    ]}
                    onPress={() => handlePurchase(monthlyPackage)}
                    disabled={isPurchasing || isLoading}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.packageName, { color: colors.text }]}>
                      {t('tier.paywall.monthly')}
                    </Text>
                    <Text style={[styles.packagePrice, { color: colors.text }]}>
                      {monthlyPackage.product.priceString}
                    </Text>
                    <Text style={[styles.packagePeriod, { color: colors.textSecondary }]}>
                      {t('tier.paywall.perMonth')}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Loading indicator */}
              {(isPurchasing || isLoading) && (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
                    {t('tier.paywall.processing')}
                  </Text>
                </View>
              )}

              {/* Restore purchases link */}
              <TouchableOpacity
                style={styles.restoreButton}
                onPress={handleRestore}
                disabled={isPurchasing || isLoading}
              >
                <Text style={[styles.restoreText, { color: colors.textSecondary }]}>
                  {t('tier.paywall.restore')}
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
});

/**
 * Inline upgrade banner component for embedding in screens
 */
interface UpgradeBannerProps {
  feature?: Feature;
  onPress?: () => void;
  compact?: boolean;
}

export const UpgradeBanner = memo(function UpgradeBanner({
  feature,
  onPress,
  compact = false,
}: UpgradeBannerProps) {
  const { colors, isDark } = useTheme();
  const { canUpgrade } = useTier();
  const { t } = useTranslation();

  const [showModal, setShowModal] = React.useState(false);

  const handlePress = useCallback(() => {
    if (onPress) {
      onPress();
    } else {
      setShowModal(true);
    }
  }, [onPress]);

  if (!canUpgrade) return null;

  const featureInfo = feature ? FEATURE_INFO[feature] : null;
  const bannerText = featureInfo
    ? `Unlock ${featureInfo.name}`
    : t('profile.subscription.cta.upgradeToPro');

  if (compact) {
    return (
      <>
        <TouchableOpacity
          style={[
            styles.compactBanner,
            { backgroundColor: isDark ? 'rgba(255, 215, 0, 0.1)' : 'rgba(255, 215, 0, 0.15)' },
          ]}
          onPress={handlePress}
          activeOpacity={0.7}
        >
          <Crown size={16} color="#FFD700" />
          <Text style={[styles.compactBannerText, { color: '#FFD700' }]}>
            {bannerText}
          </Text>
        </TouchableOpacity>
        <UpgradePrompt
          visible={showModal}
          onClose={() => setShowModal(false)}
          feature={feature}
        />
      </>
    );
  }

  return (
    <>
      <TouchableOpacity
        style={[
          styles.banner,
          {
            backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)',
            borderColor: isDark ? 'rgba(59, 130, 246, 0.3)' : 'rgba(59, 130, 246, 0.2)',
          },
        ]}
        onPress={handlePress}
        activeOpacity={0.7}
      >
        <View style={styles.bannerContent}>
          <View style={styles.bannerIcon}>
            <Crown size={20} color="#FFD700" />
          </View>
          <View style={styles.bannerTextContainer}>
            <Text style={[styles.bannerTitle, { color: colors.text }]}>
              {bannerText}
            </Text>
            <Text style={[styles.bannerSubtitle, { color: colors.textSecondary }]}>
              {featureInfo?.description || t('profile.subscription.cta.unlockFeatures')}
            </Text>
          </View>
        </View>
        <View style={styles.bannerArrow}>
          <Text style={{ color: colors.primary, fontSize: 18 }}>→</Text>
        </View>
      </TouchableOpacity>
      <UpgradePrompt
        visible={showModal}
        onClose={() => setShowModal(false)}
        feature={feature}
      />
    </>
  );
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 20,
  },
  container: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 1,
  },
  crownContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 16,
  },
  currentTierBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 20,
  },
  currentTierText: {
    fontSize: 13,
  },
  featureList: {
    width: '100%',
    gap: 8,
    marginBottom: 24,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    gap: 12,
  },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    flex: 1,
  },
  featureLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  featureDescription: {
    fontSize: 12,
    marginTop: 2,
  },
  packageList: {
    width: '100%',
    gap: 12,
    marginBottom: 16,
  },
  packageOption: {
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    position: 'relative',
  },
  savingsBadge: {
    position: 'absolute',
    top: -10,
    right: 12,
    backgroundColor: '#10B981',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  savingsText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  packageName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  packagePrice: {
    fontSize: 24,
    fontWeight: '800',
  },
  packagePeriod: {
    fontSize: 13,
    marginTop: 2,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  loadingText: {
    fontSize: 14,
  },
  restoreButton: {
    padding: 8,
  },
  restoreText: {
    fontSize: 14,
  },
  // Banner styles
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  bannerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerTextContainer: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  bannerSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  bannerArrow: {
    paddingStart: 8,
  },
  // Compact banner
  compactBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  compactBannerText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
