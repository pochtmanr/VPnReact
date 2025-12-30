import { SubscriptionPackage, useRevenueCat } from '@/context/RevenueCatContext';
import { useRTL } from '@/i18n/useRTL';
import { IBMPlexSerif_400Regular_Italic, useFonts } from '@expo-google-fonts/ibm-plex-serif';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import { X } from 'lucide-react-native';
import React, { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// URLs for Terms and Privacy
const TERMS_URL = 'https://dopplervpn.com/terms';
const PRIVACY_URL = 'https://dopplervpn.com/privacy';

/**
 * Global paywall modal with welcome-screen-inspired full-screen design.
 * Renders at the root level and listens to RevenueCat context visibility state.
 */
export const GlobalPaywallModal = memo(function GlobalPaywallModal() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { isRTL } = useRTL();
  const {
    isPaywallVisible,
    hidePaywall,
    monthlyPackage,
    sixMonthPackage,
    yearlyPackage,
    purchasePackage,
    restorePurchases,
    isLoading,
    isMockMode,
    isTrialEligible,
    trialDuration,
  } = useRevenueCat();

  const [fontsLoaded] = useFonts({
    IBMPlexSerif_400Regular_Italic,
  });

  const [isPurchasing, setIsPurchasing] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<SubscriptionPackage | null>(null);

  // Default to yearly when modal opens
  const effectiveSelected = selectedPackage || yearlyPackage;

  const handlePurchase = useCallback(async () => {
    if (!effectiveSelected) return;

    if (isMockMode) {
      Alert.alert(
        t('common.status.error'),
        t('tier.paywall.devMode')
      );
      return;
    }

    setIsPurchasing(true);
    try {
      const result = await purchasePackage(effectiveSelected);
      if (result.success) {
        Alert.alert(t('common.status.success'), t('tier.paywall.purchaseSuccess'), [
          { text: 'OK', onPress: hidePaywall },
        ]);
      } else if (result.error && result.error !== 'Purchase cancelled') {
        Alert.alert(t('common.status.error'), result.error);
      }
    } catch (err) {
      Alert.alert(t('common.status.error'), t('tier.paywall.purchaseError'));
    } finally {
      setIsPurchasing(false);
    }
  }, [effectiveSelected, purchasePackage, hidePaywall, isMockMode, t]);

  const handleRestore = useCallback(async () => {
    setIsPurchasing(true);
    try {
      const result = await restorePurchases();
      if (result.success) {
        if (result.restored) {
          Alert.alert(t('common.status.success'), t('tier.paywall.restoreSuccess'), [
            { text: 'OK', onPress: hidePaywall },
          ]);
        } else {
          Alert.alert(t('common.status.error'), t('tier.paywall.noPurchasesFound'));
        }
      } else if (result.error) {
        Alert.alert(t('common.status.error'), result.error);
      }
    } finally {
      setIsPurchasing(false);
    }
  }, [restorePurchases, hidePaywall, t]);

  const isProcessing = isPurchasing || isLoading;

  // Format price per month using the user's locale and product's currency
  // This ensures EU users see € and proper formatting (e.g., "8,33 €/mo" not "$8.33/mo")
  const formatPerMonthPrice = (pkg: SubscriptionPackage) => {
    const price = pkg.product.price;
    const currencyCode = pkg.product.currencyCode;

    let months = 1;
    switch (pkg.packageType) {
      case 'ANNUAL': months = 12; break;
      case 'SIX_MONTH': months = 6; break;
      default: months = 1;
    }

    const perMonth = price / months;
    const monthAbbr = t('tier.paywall.monthAbbr', { defaultValue: 'mo' });

    // Use Intl.NumberFormat with undefined locale to use device's locale
    // This is required by EU law to show prices in local currency format
    try {
      const formatter = new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: currencyCode || 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      return `${formatter.format(perMonth)}/${monthAbbr}`;
    } catch {
      // Fallback: use the currency code directly
      return `${perMonth.toFixed(2)} ${currencyCode || 'USD'}/${monthAbbr}`;
    }
  };

  // Get package display name
  const getPackageName = (pkg: SubscriptionPackage) => {
    switch (pkg.packageType) {
      case 'MONTHLY': return t('tier.paywall.monthly');
      case 'SIX_MONTH': return t('tier.paywall.sixMonths');
      case 'ANNUAL': return t('tier.paywall.yearly');
      default: return pkg.product.title;
    }
  };

  const isSelected = (pkg: SubscriptionPackage) => {
    return effectiveSelected?.identifier === pkg.identifier;
  };

  const openTerms = () => Linking.openURL(TERMS_URL);
  const openPrivacy = () => Linking.openURL(PRIVACY_URL);

  return (
    <Modal
      visible={isPaywallVisible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={hidePaywall}
    >
      <View style={styles.container}>
        {/* Background Image */}
        <Image
          source={require('@/assets/images/welcome.png')}
          style={styles.backgroundImage}
          resizeMode="cover"
        />

        {/* Gradient Overlay */}
        <LinearGradient
          colors={[
            'rgba(0, 0, 0, 0.3)',
            'rgba(0, 0, 0, 0.5)',
            'rgba(0, 0, 0, 0.8)',
            '#000000',
          ]}
          locations={[0, 0.3, 0.6, 1]}
          style={styles.gradientOverlay}
        />

        {/* Content */}
        <View
          style={[
            styles.content,
            {
              paddingTop: insets.top + 16,
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          {/* Close Button */}
          <TouchableOpacity
            style={[styles.closeButton, isRTL && styles.closeButtonRTL]}
            onPress={hidePaywall}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <X size={28} color="rgba(255, 255, 255, 0.7)" />
          </TouchableOpacity>

          {/* Top Section - Logo & Title */}
          <View style={styles.topSection}>
            {/* App Logo */}
            <Image
              source={require('@/assets/images/WhiteLogo.png')}
              style={styles.appLogo}
              resizeMode="contain"
            />

            <Text
              style={[styles.titleLight, isRTL && styles.textRTL]}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {t('tier.paywall.experience')}
            </Text>
            <Text
              style={[
                styles.titleItalic,
                fontsLoaded && { fontFamily: 'IBMPlexSerif_400Regular_Italic' },
                isRTL && styles.textRTL,
              ]}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {t('tier.paywall.truePrivacy')}
            </Text>
            <Text
              style={[styles.subtitle, isRTL && styles.textRTL]}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {t('tier.paywall.unlockPremium')}
            </Text>
          </View>

          {/* Spacer */}
          <View style={styles.spacer} />

          {/* Bottom Section - Pricing */}
          <View style={styles.bottomSection}>
            {/* Free Trial Banner - only show if trial eligible */}
            {isTrialEligible && trialDuration && trialDuration.days > 0 && (
              <View style={styles.trialBanner}>
                <Text
                  style={[styles.trialText, isRTL && styles.textRTL]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {t('tier.paywall.startFreeTrial', { days: trialDuration.days })}
                </Text>
              </View>
            )}

            {/* Package Options */}
            <View style={styles.packagesContainer}>
              {/* Yearly Package - Best Value */}
              {yearlyPackage && (
                <Pressable
                  style={[
                    styles.packageCard,
                    isRTL && styles.packageCardRTL,
                    isSelected(yearlyPackage) && styles.packageSelected,
                  ]}
                  onPress={() => setSelectedPackage(yearlyPackage)}
                  disabled={isProcessing}
                >
                  <View style={[styles.savingsBadge, isRTL && styles.savingsBadgeRTL]}>
                    <Text style={styles.savingsText} numberOfLines={1} adjustsFontSizeToFit>
                      {t('tier.paywall.bestValue')}
                    </Text>
                  </View>
                  <View style={[styles.radioOuter, isSelected(yearlyPackage) && styles.radioOuterSelected]}>
                    {isSelected(yearlyPackage) && <View style={styles.radioInner} />}
                  </View>
                  <View style={[styles.packageInfo, isRTL && styles.packageInfoRTL]}>
                    <Text style={[styles.packageName, isRTL && styles.textRTL]} numberOfLines={1}>
                      {getPackageName(yearlyPackage)}
                    </Text>
                    <Text style={[styles.packagePerMonth, isRTL && styles.textRTL]} numberOfLines={1}>
                      {formatPerMonthPrice(yearlyPackage)}
                    </Text>
                  </View>
                  <Text style={styles.packagePrice}>{yearlyPackage.product.priceString}</Text>
                </Pressable>
              )}

              {/* 6 Month Package */}
              {sixMonthPackage && (
                <Pressable
                  style={[
                    styles.packageCard,
                    isRTL && styles.packageCardRTL,
                    isSelected(sixMonthPackage) && styles.packageSelected,
                  ]}
                  onPress={() => setSelectedPackage(sixMonthPackage)}
                  disabled={isProcessing}
                >
                  <View style={[styles.radioOuter, isSelected(sixMonthPackage) && styles.radioOuterSelected]}>
                    {isSelected(sixMonthPackage) && <View style={styles.radioInner} />}
                  </View>
                  <View style={[styles.packageInfo, isRTL && styles.packageInfoRTL]}>
                    <Text style={[styles.packageName, isRTL && styles.textRTL]} numberOfLines={1}>
                      {getPackageName(sixMonthPackage)}
                    </Text>
                    <Text style={[styles.packagePerMonth, isRTL && styles.textRTL]} numberOfLines={1}>
                      {formatPerMonthPrice(sixMonthPackage)}
                    </Text>
                  </View>
                  <Text style={styles.packagePrice}>{sixMonthPackage.product.priceString}</Text>
                </Pressable>
              )}

              {/* Monthly Package */}
              {monthlyPackage && (
                <Pressable
                  style={[
                    styles.packageCard,
                    isRTL && styles.packageCardRTL,
                    isSelected(monthlyPackage) && styles.packageSelected,
                  ]}
                  onPress={() => setSelectedPackage(monthlyPackage)}
                  disabled={isProcessing}
                >
                  <View style={[styles.radioOuter, isSelected(monthlyPackage) && styles.radioOuterSelected]}>
                    {isSelected(monthlyPackage) && <View style={styles.radioInner} />}
                  </View>
                  <View style={[styles.packageInfo, isRTL && styles.packageInfoRTL]}>
                    <Text style={[styles.packageName, isRTL && styles.textRTL]} numberOfLines={1}>
                      {getPackageName(monthlyPackage)}
                    </Text>
                  </View>
                  <Text style={styles.packagePrice}>{monthlyPackage.product.priceString}</Text>
                </Pressable>
              )}
            </View>

            {/* Continue Button */}
            <Pressable
              style={({ pressed }) => [
                styles.continueButton,
                pressed && { opacity: 0.9 },
                isProcessing && { opacity: 0.7 },
              ]}
              onPress={handlePurchase}
              disabled={isProcessing}
            >
              <LinearGradient
                colors={['#3B82F6', '#2563EB']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.continueGradient}
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text
                    style={[styles.continueText, isRTL && styles.textRTL]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                  >
                    {t('tier.paywall.startTrial')}
                  </Text>
                )}
              </LinearGradient>
            </Pressable>

            {/* Legal Links - Two-row layout for long translations */}
            <View style={styles.legalContainer}>
              {/* First Row: Restore | Terms */}
              <View style={[styles.legalRow, isRTL && styles.legalRowRTL]}>
                <TouchableOpacity
                  onPress={handleRestore}
                  disabled={isProcessing}
                  style={styles.legalLinkTouchable}
                >
                  <Text style={[styles.legalLink, isRTL && styles.textRTL]} numberOfLines={1}>
                    {t('tier.paywall.restore')}
                  </Text>
                </TouchableOpacity>
                <Text style={styles.legalSeparator}>|</Text>
                <TouchableOpacity onPress={openTerms} style={styles.legalLinkTouchable}>
                  <Text style={[styles.legalLink, isRTL && styles.textRTL]} numberOfLines={1}>
                    {t('tier.paywall.terms')}
                  </Text>
                </TouchableOpacity>
              </View>
              {/* Second Row: Privacy */}
              <View style={[styles.legalRow, isRTL && styles.legalRowRTL]}>
                <TouchableOpacity onPress={openPrivacy} style={styles.legalLinkTouchable}>
                  <Text style={[styles.legalLink, isRTL && styles.textRTL]} numberOfLines={1}>
                    {t('tier.paywall.privacy')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Auto-renew notice */}
            <Text style={[styles.autoRenewText, isRTL && styles.textRTL]} numberOfLines={2}>
              {t('tier.paywall.cancelAnytime')}
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  closeButton: {
    position: 'absolute',
    top: 56,
    right: 20,
    left: undefined,
    zIndex: 10,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonRTL: {
    right: undefined,
    left: 20,
  },

  // Top Section
  topSection: {
    alignItems: 'center',
    paddingTop: 80,
  },
  appLogo: {
    width: 64,
    height: 64,
    marginBottom: 32,
  },
  titleLight: {
    fontSize: 32,
    fontWeight: '300',
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  titleItalic: {
    fontSize: 32,
    fontStyle: 'italic',
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
    letterSpacing: -0.2,
  },

  // Spacer
  spacer: {
    flex: 1,
  },

  // Bottom Section
  bottomSection: {
    gap: 14,
    paddingBottom: 8,
  },

  // Trial Banner
  trialBanner: {
    alignItems: 'center',
    marginBottom: 4,
  },
  trialText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#10B981',
    letterSpacing: -0.2,
  },

  packagesContainer: {
    gap: 10,
  },
  packageCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },
  packageCardRTL: {
    flexDirection: 'row-reverse',
  },
  packageSelected: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderColor: '#3B82F6',
  },
  savingsBadge: {
    position: 'absolute',
    top: -9,
    right: 14,
    left: undefined,
    backgroundColor: '#10B981',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    maxWidth: 100,
  },
  savingsBadgeRTL: {
    right: undefined,
    left: 14,
  },
  savingsText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginEnd: 12,
  },
  radioOuterSelected: {
    borderColor: '#3B82F6',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#3B82F6',
  },
  packageInfo: {
    flex: 1,
  },
  packageInfoRTL: {
    alignItems: 'flex-end',
  },
  packageName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  packagePerMonth: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.45)',
    marginTop: 1,
  },
  packagePrice: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  textRTL: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  // Continue Button
  continueButton: {
    borderRadius: 9999,
    overflow: 'hidden',
    marginTop: 6,
  },
  continueGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },

  // Legal Links Container - ensures max 2 rows
  legalContainer: {
    alignItems: 'center',
    gap: 2,
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  legalRowRTL: {
    flexDirection: 'row-reverse',
  },
  legalLinkTouchable: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    minHeight: 32,
    justifyContent: 'center',
  },
  legalLink: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.4)',
  },
  legalSeparator: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.2)',
  },
  autoRenewText: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.25)',
    textAlign: 'center',
  },
});
