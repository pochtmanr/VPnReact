import React, { createContext, useContext, useMemo, useCallback, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useRevenueCat } from './RevenueCatContext';

// =============================================================================
// TIER DEFINITIONS
// =============================================================================

export type SubscriptionTier = 'free' | 'pro' | 'premium';

// Feature identifiers - add new features here as the app grows
export type Feature =
  | 'premium_servers'
  | 'ad_blocking'
  | 'parental_controls'
  | 'unlimited_devices'
  | 'priority_support'
  | 'custom_dns'
  | 'split_tunneling'
  | 'kill_switch';

// =============================================================================
// TIER CONFIGURATION
// =============================================================================

// Features available per tier
const TIER_FEATURES: Record<SubscriptionTier, Feature[]> = {
  free: [],
  pro: [
    'premium_servers',
    'ad_blocking',
    'parental_controls',
    'unlimited_devices',
    'priority_support',
  ],
  premium: [
    'premium_servers',
    'ad_blocking',
    'parental_controls',
    'unlimited_devices',
    'priority_support',
    'custom_dns',
    'split_tunneling',
    'kill_switch',
  ],
};

// Tier hierarchy for comparison (higher = more access)
const TIER_HIERARCHY: Record<SubscriptionTier, number> = {
  free: 0,
  pro: 1,
  premium: 2,
};

// Device limits per tier
const DEVICE_LIMITS: Record<SubscriptionTier, number> = {
  free: 1,
  pro: 5,
  premium: 10,
};

// Human-readable tier names
export const TIER_DISPLAY_NAMES: Record<SubscriptionTier, string> = {
  free: 'Free',
  pro: 'Pro',
  premium: 'Premium',
};

// Feature display information for upgrade prompts
export const FEATURE_INFO: Record<Feature, { name: string; description: string }> = {
  premium_servers: {
    name: 'Premium Servers',
    description: 'Access to fast, low-latency servers worldwide',
  },
  ad_blocking: {
    name: 'Ad Blocking',
    description: 'DNS-level ad and tracker blocking',
  },
  parental_controls: {
    name: 'Parental Controls',
    description: 'Block inappropriate content and websites',
  },
  unlimited_devices: {
    name: 'Multiple Devices',
    description: 'Connect up to 5 devices simultaneously',
  },
  priority_support: {
    name: 'Priority Support',
    description: 'Get faster responses from our support team',
  },
  custom_dns: {
    name: 'Custom DNS',
    description: 'Use your own DNS servers',
  },
  split_tunneling: {
    name: 'Split Tunneling',
    description: 'Choose which apps use VPN',
  },
  kill_switch: {
    name: 'Kill Switch',
    description: 'Block internet if VPN disconnects',
  },
};

// =============================================================================
// CONTEXT INTERFACE
// =============================================================================

interface TierContextType {
  // Current user tier
  tier: SubscriptionTier;
  tierDisplayName: string;

  // Loading state
  isLoading: boolean;
  isInitialized: boolean;

  // Tier checks
  isPro: boolean;
  isPremium: boolean;
  isFree: boolean;

  // Feature access
  hasFeature: (feature: Feature) => boolean;
  getAvailableFeatures: () => Feature[];
  getLockedFeatures: () => Feature[];

  // Tier comparison
  meetsMinimumTier: (requiredTier: SubscriptionTier) => boolean;
  getRequiredTierForFeature: (feature: Feature) => SubscriptionTier | null;

  // Device limits
  deviceLimit: number;

  // Upgrade helpers
  canUpgrade: boolean;
  getUpgradePath: () => SubscriptionTier | null;
}

const TierContext = createContext<TierContextType | undefined>(undefined);

// =============================================================================
// PROVIDER
// =============================================================================

interface TierProviderProps {
  children: ReactNode;
}

export function TierProvider({ children }: TierProviderProps) {
  const { account } = useAuth();

  // Try to get tier from RevenueCat (primary source), fallback to database
  let revenueCatTier: SubscriptionTier = 'free';
  let revenueCatLoading = false;
  let revenueCatInitialized = false;
  try {
    const revenueCat = useRevenueCat();
    revenueCatTier = revenueCat.currentTier;
    revenueCatLoading = revenueCat.isLoading;
    revenueCatInitialized = revenueCat.isInitialized;
  } catch {
    // RevenueCatProvider not mounted yet, use database tier
  }

  // Get current tier - RevenueCat takes priority if initialized, otherwise use database
  const tier: SubscriptionTier = useMemo(() => {
    // RevenueCat is the source of truth for subscription status
    if (revenueCatTier !== 'free') {
      return revenueCatTier;
    }
    // Fallback to database tier (for web or when RevenueCat not configured)
    return (account?.subscription_tier as SubscriptionTier) || 'free';
  }, [revenueCatTier, account?.subscription_tier]);

  // Tier display name
  const tierDisplayName = useMemo(() => TIER_DISPLAY_NAMES[tier], [tier]);

  // Quick tier checks
  const isPro = tier === 'pro' || tier === 'premium';
  const isPremium = tier === 'premium';
  const isFree = tier === 'free';

  // Check if user has access to a specific feature
  const hasFeature = useCallback((feature: Feature): boolean => {
    return TIER_FEATURES[tier].includes(feature);
  }, [tier]);

  // Get all features available to the current tier
  const getAvailableFeatures = useCallback((): Feature[] => {
    return TIER_FEATURES[tier];
  }, [tier]);

  // Get features that are locked for the current tier
  const getLockedFeatures = useCallback((): Feature[] => {
    const allFeatures = TIER_FEATURES.premium; // Premium has all features
    return allFeatures.filter(feature => !TIER_FEATURES[tier].includes(feature));
  }, [tier]);

  // Check if user meets minimum tier requirement
  const meetsMinimumTier = useCallback((requiredTier: SubscriptionTier): boolean => {
    return TIER_HIERARCHY[tier] >= TIER_HIERARCHY[requiredTier];
  }, [tier]);

  // Get the minimum tier required for a feature
  const getRequiredTierForFeature = useCallback((feature: Feature): SubscriptionTier | null => {
    if (TIER_FEATURES.free.includes(feature)) return 'free';
    if (TIER_FEATURES.pro.includes(feature)) return 'pro';
    if (TIER_FEATURES.premium.includes(feature)) return 'premium';
    return null;
  }, []);

  // Device limit for current tier
  const deviceLimit = useMemo(() => {
    // Use account's max_devices if set, otherwise use tier default
    return account?.max_devices ?? DEVICE_LIMITS[tier];
  }, [account?.max_devices, tier]);

  // Check if user can upgrade
  const canUpgrade = tier !== 'premium';

  // Get next tier in upgrade path
  const getUpgradePath = useCallback((): SubscriptionTier | null => {
    if (tier === 'free') return 'pro';
    if (tier === 'pro') return 'premium';
    return null; // Already at premium
  }, [tier]);

  const value = useMemo<TierContextType>(() => ({
    tier,
    tierDisplayName,
    isLoading: revenueCatLoading,
    isInitialized: revenueCatInitialized,
    isPro,
    isPremium,
    isFree,
    hasFeature,
    getAvailableFeatures,
    getLockedFeatures,
    meetsMinimumTier,
    getRequiredTierForFeature,
    deviceLimit,
    canUpgrade,
    getUpgradePath,
  }), [
    tier,
    tierDisplayName,
    revenueCatLoading,
    revenueCatInitialized,
    isPro,
    isPremium,
    isFree,
    hasFeature,
    getAvailableFeatures,
    getLockedFeatures,
    meetsMinimumTier,
    getRequiredTierForFeature,
    deviceLimit,
    canUpgrade,
    getUpgradePath,
  ]);

  return (
    <TierContext.Provider value={value}>
      {children}
    </TierContext.Provider>
  );
}

// =============================================================================
// HOOKS
// =============================================================================

/**
 * Main hook for accessing tier information
 */
export function useTier(): TierContextType {
  const context = useContext(TierContext);
  if (!context) {
    throw new Error('useTier must be used within a TierProvider');
  }
  return context;
}

/**
 * Hook for checking if a specific feature is available
 * Returns { hasAccess: boolean, requiredTier: SubscriptionTier | null }
 */
export function useFeatureAccess(feature: Feature) {
  const { hasFeature, getRequiredTierForFeature, tier } = useTier();

  return useMemo(() => ({
    hasAccess: hasFeature(feature),
    requiredTier: getRequiredTierForFeature(feature),
    currentTier: tier,
  }), [hasFeature, getRequiredTierForFeature, feature, tier]);
}

/**
 * Hook for checking if user meets minimum tier requirement
 */
export function useMinimumTier(requiredTier: SubscriptionTier) {
  const { meetsMinimumTier, tier, canUpgrade } = useTier();

  return useMemo(() => ({
    hasAccess: meetsMinimumTier(requiredTier),
    currentTier: tier,
    canUpgrade,
  }), [meetsMinimumTier, requiredTier, tier, canUpgrade]);
}
