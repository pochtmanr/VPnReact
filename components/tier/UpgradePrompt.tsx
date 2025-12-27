import React, { memo, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Linking,
  Alert,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Crown,
  X,
  Check,
  Zap,
  Shield,
  Globe,
  Smartphone,
} from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';
import {
  useTier,
  Feature,
  FEATURE_INFO,
  TIER_DISPLAY_NAMES,
} from '@/context/TierContext';

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

// Pro tier features to display in the modal
const PRO_FEATURES = [
  { icon: Globe, label: 'Premium Servers', description: 'Fast, worldwide servers' },
  { icon: Shield, label: 'Ad Blocking', description: 'DNS-level protection' },
  { icon: Smartphone, label: '5 Devices', description: 'Connect multiple devices' },
  { icon: Zap, label: 'Parental Controls', description: 'Keep your family safe' },
];

/**
 * Modal component that prompts users to upgrade to Pro.
 * Shows feature benefits and handles subscription flow.
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

  // Determine what tier is needed
  const requiredTier = feature
    ? getRequiredTierForFeature(feature)
    : getUpgradePath();

  const upgradeTierName = requiredTier ? TIER_DISPLAY_NAMES[requiredTier] : 'Pro';

  // Get feature-specific messaging
  const featureInfo = feature ? FEATURE_INFO[feature] : null;

  const displayTitle = title || (featureInfo
    ? `Unlock ${featureInfo.name}`
    : `Upgrade to ${upgradeTierName}`);

  const displaySubtitle = subtitle || (featureInfo
    ? featureInfo.description
    : 'Get access to all premium features');

  // Handle upgrade button press
  const handleUpgrade = useCallback(async () => {
    // TODO: Integrate with your payment provider (RevenueCat, Stripe, etc.)
    // For now, show a placeholder alert
    Alert.alert(
      'Upgrade to Pro',
      'Subscription flow will be implemented with your payment provider.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Learn More',
          onPress: () => {
            // Open pricing page or app store
            // Linking.openURL('https://yourapp.com/pricing');
          },
        },
      ]
    );
    onClose();
  }, [onClose]);

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
                  Current plan: <Text style={{ color: colors.text, fontWeight: '600' }}>
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
                        {item.label}
                      </Text>
                      <Text style={[styles.featureDescription, { color: colors.textSecondary }]}>
                        {item.description}
                      </Text>
                    </View>
                    <Check size={18} color={colors.success} />
                  </View>
                ))}
              </View>

              {/* Upgrade button */}
              <TouchableOpacity
                style={styles.upgradeButton}
                onPress={handleUpgrade}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#3B82F6', '#2563EB']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.upgradeButtonGradient}
                >
                  <Crown size={20} color="#FFFFFF" />
                  <Text style={styles.upgradeButtonText}>
                    Upgrade to {upgradeTierName}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>

              {/* Restore purchases link */}
              <TouchableOpacity
                style={styles.restoreButton}
                onPress={() => {
                  // TODO: Implement restore purchases
                  Alert.alert('Restore Purchases', 'Checking for previous purchases...');
                }}
              >
                <Text style={[styles.restoreText, { color: colors.textSecondary }]}>
                  Restore Purchases
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
    : 'Upgrade to Pro';

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
              {featureInfo?.description || 'Access all premium features'}
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
  upgradeButton: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
  },
  upgradeButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  upgradeButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  restoreButton: {
    marginTop: 16,
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
    paddingLeft: 8,
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
