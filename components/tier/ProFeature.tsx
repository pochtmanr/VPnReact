import React, { memo, useCallback, useState, ReactNode } from 'react';
import { View, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { useTier, Feature } from '@/context/TierContext';
import { UpgradePrompt } from './UpgradePrompt';

interface ProFeatureProps {
  /** The feature being gated */
  feature: Feature;
  /** Content to render when user has access */
  children: ReactNode;
  /** Optional fallback to render when locked (defaults to disabled overlay) */
  fallback?: ReactNode;
  /** If true, show children but disabled/grayed out instead of locked overlay */
  showDisabled?: boolean;
  /** Additional styles for the container */
  style?: ViewStyle;
  /** If true, tapping locked content shows upgrade prompt */
  showUpgradeOnTap?: boolean;
}

/**
 * Wrapper component that gates content based on user's subscription tier.
 *
 * Usage:
 * ```tsx
 * <ProFeature feature="ad_blocking">
 *   <AdBlockSettings />
 * </ProFeature>
 * ```
 */
export const ProFeature = memo(function ProFeature({
  feature,
  children,
  fallback,
  showDisabled = false,
  style,
  showUpgradeOnTap = true,
}: ProFeatureProps) {
  const { hasFeature } = useTier();
  const [showUpgrade, setShowUpgrade] = useState(false);

  const hasAccess = hasFeature(feature);

  const handleLockedPress = useCallback(() => {
    if (showUpgradeOnTap) {
      setShowUpgrade(true);
    }
  }, [showUpgradeOnTap]);

  const handleCloseUpgrade = useCallback(() => {
    setShowUpgrade(false);
  }, []);

  // User has access - render children normally
  if (hasAccess) {
    return <View style={style}>{children}</View>;
  }

  // Custom fallback provided
  if (fallback) {
    return <View style={style}>{fallback}</View>;
  }

  // Show disabled version with tap to upgrade
  if (showDisabled) {
    return (
      <View style={style}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleLockedPress}
          style={styles.disabledContainer}
        >
          <View style={styles.disabledOverlay} pointerEvents="none">
            {children}
          </View>
        </TouchableOpacity>
        <UpgradePrompt
          visible={showUpgrade}
          onClose={handleCloseUpgrade}
          feature={feature}
        />
      </View>
    );
  }

  // Default: locked overlay with tap to upgrade
  return (
    <View style={style}>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={handleLockedPress}
        style={styles.lockedContainer}
      >
        <View style={styles.lockedContent} pointerEvents="none">
          {children}
        </View>
        <View style={styles.lockOverlay} />
      </TouchableOpacity>
      <UpgradePrompt
        visible={showUpgrade}
        onClose={handleCloseUpgrade}
        feature={feature}
      />
    </View>
  );
});

interface RequiresProProps {
  /** Minimum tier required ('pro' or 'premium') */
  tier?: 'pro' | 'premium';
  /** Content to render when user has access */
  children: ReactNode;
  /** Optional fallback to render when locked */
  fallback?: ReactNode;
  /** Additional styles for the container */
  style?: ViewStyle;
}

/**
 * Simple tier-based gate (not feature-based).
 * Use when you want to gate based on tier level rather than specific feature.
 *
 * Usage:
 * ```tsx
 * <RequiresPro tier="pro">
 *   <PremiumContent />
 * </RequiresPro>
 * ```
 */
export const RequiresPro = memo(function RequiresPro({
  tier: requiredTier = 'pro',
  children,
  fallback,
  style,
}: RequiresProProps) {
  const { meetsMinimumTier } = useTier();
  const [showUpgrade, setShowUpgrade] = useState(false);

  const hasAccess = meetsMinimumTier(requiredTier);

  const handleLockedPress = useCallback(() => {
    setShowUpgrade(true);
  }, []);

  const handleCloseUpgrade = useCallback(() => {
    setShowUpgrade(false);
  }, []);

  if (hasAccess) {
    return <View style={style}>{children}</View>;
  }

  if (fallback) {
    return <View style={style}>{fallback}</View>;
  }

  return (
    <View style={style}>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={handleLockedPress}
        style={styles.lockedContainer}
      >
        <View style={styles.lockedContent} pointerEvents="none">
          {children}
        </View>
        <View style={styles.lockOverlay} />
      </TouchableOpacity>
      <UpgradePrompt
        visible={showUpgrade}
        onClose={handleCloseUpgrade}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  disabledContainer: {
    opacity: 0.5,
  },
  disabledOverlay: {
    pointerEvents: 'none',
  },
  lockedContainer: {
    position: 'relative',
  },
  lockedContent: {
    opacity: 0.4,
  },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
});
