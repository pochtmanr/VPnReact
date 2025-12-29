import { useCallback } from 'react';
import { Alert } from 'react-native';
import { Feature, useTier } from '@/context/TierContext';
import { useRevenueCat } from '@/context/RevenueCatContext';

/**
 * Options for the feature gate hook
 */
interface UseFeatureGateOptions {
  /** Whether this feature requires VPN connection */
  requiresVPN?: boolean;
  /** Current VPN connection status */
  isVPNConnected?: boolean;
  /** Custom message when VPN is required but not connected */
  vpnRequiredMessage?: string;
}

/**
 * Return type for the useFeatureGate hook
 */
interface UseFeatureGateReturn {
  /** Whether the user has access to this feature */
  hasAccess: boolean;
  /** Request access to the feature - shows paywall if needed */
  requestAccess: () => boolean;
  /** Whether the paywall is currently being presented */
  isGating: boolean;
  /** Whether RevenueCat is still loading */
  isLoading: boolean;
  /** Whether the feature is currently disabled (gating or VPN required) */
  isDisabled: boolean;
  /** Get the appropriate subtitle message based on current state */
  getDisabledReason: () => string | null;
}

/**
 * Hook that combines feature access checking with automatic paywall presentation.
 *
 * This is the primary hook for gating premium features. It handles:
 * - Checking if user has entitlement for the feature
 * - Showing custom paywall modal when access is requested without entitlement
 * - VPN connection requirements (optional)
 *
 * @example
 * ```tsx
 * const { hasAccess, requestAccess, isDisabled, getDisabledReason } = useFeatureGate('ad_blocking', {
 *   requiresVPN: true,
 *   isVPNConnected: connectionStatus === 'connected',
 * });
 *
 * const handleToggle = () => {
 *   if (!enabled) {
 *     const granted = requestAccess();
 *     if (!granted) return;
 *   }
 *   setEnabled(!enabled);
 * };
 * ```
 */
export function useFeatureGate(
  feature: Feature,
  options: UseFeatureGateOptions = {}
): UseFeatureGateReturn {
  const {
    requiresVPN = false,
    isVPNConnected = true,
    vpnRequiredMessage = 'Connect to VPN first to enable this feature.',
  } = options;

  const { hasFeature } = useTier();
  const { showPaywall, isLoading: isRevenueCatLoading, isPaywallVisible } = useRevenueCat();

  const hasAccess = hasFeature(feature);

  /**
   * Request access to the feature.
   * If user doesn't have access, shows the paywall modal.
   * Returns true if access was already granted.
   */
  const requestAccess = useCallback((): boolean => {
    // Check VPN requirement first
    if (requiresVPN && !isVPNConnected) {
      Alert.alert('VPN Required', vpnRequiredMessage);
      return false;
    }

    // If already has access, return true immediately
    if (hasAccess) {
      return true;
    }

    // Show paywall modal
    showPaywall();
    return false;
  }, [hasAccess, requiresVPN, isVPNConnected, vpnRequiredMessage, showPaywall]);

  /**
   * Get the reason why the feature is disabled, for display purposes.
   * Returns null if the feature is not disabled.
   */
  const getDisabledReason = useCallback((): string | null => {
    if (isPaywallVisible) {
      return 'Processing...';
    }
    if (requiresVPN && !isVPNConnected) {
      return 'Connect VPN first to enable';
    }
    if (!hasAccess) {
      return 'Upgrade to Pro to enable';
    }
    return null;
  }, [isPaywallVisible, requiresVPN, isVPNConnected, hasAccess]);

  const isDisabled = isPaywallVisible || (requiresVPN && !isVPNConnected);

  return {
    hasAccess,
    requestAccess,
    isGating: isPaywallVisible,
    isLoading: isRevenueCatLoading,
    isDisabled,
    getDisabledReason,
  };
}

/**
 * Simplified hook for checking feature access without paywall functionality.
 * Use this when you only need to check access, not trigger paywalls.
 */
export function useHasFeature(feature: Feature): boolean {
  const { hasFeature } = useTier();
  return hasFeature(feature);
}
