import { SubscriptionPackage, useRevenueCat } from '@/context/RevenueCatContext';
import { IBMPlexSerif_400Regular_Italic, useFonts } from '@expo-google-fonts/ibm-plex-serif';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import { X } from 'lucide-react-native';
import React, { memo, useCallback, useState } from 'react';
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
        'Development Mode',
        'Purchases are not available in development. Please build and run on a device.'
      );
      return;
    }

    setIsPurchasing(true);
    try {
      const result = await purchasePackage(effectiveSelected);
      if (result.success) {
        Alert.alert('Success', 'Thank you for subscribing!', [
          { text: 'OK', onPress: hidePaywall },
        ]);
      } else if (result.error && result.error !== 'Purchase cancelled') {
        Alert.alert('Error', result.error);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to complete purchase. Please try again.');
    } finally {
      setIsPurchasing(false);
    }
  }, [effectiveSelected, purchasePackage, hidePaywall, isMockMode]);

  const handleRestore = useCallback(async () => {
    setIsPurchasing(true);
    try {
      const result = await restorePurchases();
      if (result.success) {
        if (result.restored) {
          Alert.alert('Success', 'Your purchases have been restored!', [
            { text: 'OK', onPress: hidePaywall },
          ]);
        } else {
          Alert.alert('No Purchases Found', 'No previous purchases were found for this account.');
        }
      } else if (result.error) {
        Alert.alert('Error', result.error);
      }
    } finally {
      setIsPurchasing(false);
    }
  }, [restorePurchases, hidePaywall]);

  const isProcessing = isPurchasing || isLoading;

  // Format price per month using the product's currency formatting
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

    // Use Intl.NumberFormat for proper currency formatting
    try {
      const formatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currencyCode || 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      return `${formatter.format(perMonth)}/mo`;
    } catch {
      // Fallback if currency code is invalid
      return `$${perMonth.toFixed(2)}/mo`;
    }
  };

  // Get package display name
  const getPackageName = (pkg: SubscriptionPackage) => {
    switch (pkg.packageType) {
      case 'MONTHLY': return 'Monthly';
      case 'SIX_MONTH': return '6 Months';
      case 'ANNUAL': return 'Yearly';
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
            style={styles.closeButton}
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

            <Text style={styles.titleLight}>Experience</Text>
            <Text style={[styles.titleItalic, fontsLoaded && { fontFamily: 'IBMPlexSerif_400Regular_Italic' }]}>
              true privacy.
            </Text>
            <Text style={styles.subtitle}>
              Unlock all premium features
            </Text>
          </View>

          {/* Spacer */}
          <View style={styles.spacer} />

          {/* Bottom Section - Pricing */}
          <View style={styles.bottomSection}>
            {/* Free Trial Banner */}
            <View style={styles.trialBanner}>
              <Text style={styles.trialText}>Start with a 7-day free trial</Text>
            </View>

            {/* Package Options */}
            <View style={styles.packagesContainer}>
              {/* Yearly Package - Best Value */}
              {yearlyPackage && (
                <Pressable
                  style={[
                    styles.packageCard,
                    isSelected(yearlyPackage) && styles.packageSelected,
                  ]}
                  onPress={() => setSelectedPackage(yearlyPackage)}
                  disabled={isProcessing}
                >
                  <View style={styles.savingsBadge}>
                    <Text style={styles.savingsText}>Best Value</Text>
                  </View>
                  <View style={[styles.radioOuter, isSelected(yearlyPackage) && styles.radioOuterSelected]}>
                    {isSelected(yearlyPackage) && <View style={styles.radioInner} />}
                  </View>
                  <View style={styles.packageInfo}>
                    <Text style={styles.packageName}>{getPackageName(yearlyPackage)}</Text>
                    <Text style={styles.packagePerMonth}>{formatPerMonthPrice(yearlyPackage)}</Text>
                  </View>
                  <Text style={styles.packagePrice}>{yearlyPackage.product.priceString}</Text>
                </Pressable>
              )}

              {/* 6 Month Package */}
              {sixMonthPackage && (
                <Pressable
                  style={[
                    styles.packageCard,
                    isSelected(sixMonthPackage) && styles.packageSelected,
                  ]}
                  onPress={() => setSelectedPackage(sixMonthPackage)}
                  disabled={isProcessing}
                >
                  <View style={[styles.radioOuter, isSelected(sixMonthPackage) && styles.radioOuterSelected]}>
                    {isSelected(sixMonthPackage) && <View style={styles.radioInner} />}
                  </View>
                  <View style={styles.packageInfo}>
                    <Text style={styles.packageName}>{getPackageName(sixMonthPackage)}</Text>
                    <Text style={styles.packagePerMonth}>{formatPerMonthPrice(sixMonthPackage)}</Text>
                  </View>
                  <Text style={styles.packagePrice}>{sixMonthPackage.product.priceString}</Text>
                </Pressable>
              )}

              {/* Monthly Package */}
              {monthlyPackage && (
                <Pressable
                  style={[
                    styles.packageCard,
                    isSelected(monthlyPackage) && styles.packageSelected,
                  ]}
                  onPress={() => setSelectedPackage(monthlyPackage)}
                  disabled={isProcessing}
                >
                  <View style={[styles.radioOuter, isSelected(monthlyPackage) && styles.radioOuterSelected]}>
                    {isSelected(monthlyPackage) && <View style={styles.radioInner} />}
                  </View>
                  <View style={styles.packageInfo}>
                    <Text style={styles.packageName}>{getPackageName(monthlyPackage)}</Text>
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
                  <Text style={styles.continueText}>Start Free Trial</Text>
                )}
              </LinearGradient>
            </Pressable>

            {/* Legal Row - Restore | Terms | Privacy */}
            <View style={styles.legalRow}>
              <TouchableOpacity onPress={handleRestore} disabled={isProcessing}>
                <Text style={styles.legalLink}>Restore</Text>
              </TouchableOpacity>
              <Text style={styles.legalSeparator}>|</Text>
              <TouchableOpacity onPress={openTerms}>
                <Text style={styles.legalLink}>Terms</Text>
              </TouchableOpacity>
              <Text style={styles.legalSeparator}>|</Text>
              <TouchableOpacity onPress={openPrivacy}>
                <Text style={styles.legalLink}>Privacy</Text>
              </TouchableOpacity>
            </View>

            {/* Auto-renew notice */}
            <Text style={styles.autoRenewText}>
              Cancel anytime. Subscription auto-renews.
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
    zIndex: 10,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
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
  packageSelected: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderColor: '#3B82F6',
  },
  savingsBadge: {
    position: 'absolute',
    top: -9,
    right: 14,
    backgroundColor: '#10B981',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
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
    marginRight: 12,
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

  // Legal Row
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 4,
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
