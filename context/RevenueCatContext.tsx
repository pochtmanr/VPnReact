import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import { Platform, AppState, AppStateStatus } from 'react-native';
import { useAuth } from './AuthContext';
import { SubscriptionTier } from './TierContext';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

// =============================================================================
// DYNAMIC IMPORT FOR REVENUECAT
// =============================================================================
// RevenueCat requires native modules that aren't available in Expo Go.
// We dynamically check if the module is available to prevent crashes.

type CustomerInfo = import('react-native-purchases').CustomerInfo;
type PurchasesOfferings = import('react-native-purchases').PurchasesOfferings;
type PurchasesPackage = import('react-native-purchases').PurchasesPackage;
type PurchasesError = import('react-native-purchases').PurchasesError;

// Track if RevenueCat native module is available
let isRevenueCatAvailable = false;
let Purchases: typeof import('react-native-purchases').default | null = null;
let LOG_LEVEL: typeof import('react-native-purchases').LOG_LEVEL | null = null;
let PURCHASES_ERROR_CODE: typeof import('react-native-purchases').PURCHASES_ERROR_CODE | null = null;
let sdkLoadError: string | null = null;

// NOTE: We do NOT load RevenueCatUI (react-native-purchases-ui) because it's
// incompatible with React Native's New Architecture. Instead, we use the core
// SDK and implement a custom paywall UI.

function loadRevenueCatSDK() {
  try {
    console.log('[RevenueCat] Attempting to load SDK...');

    // Check if the native module exists before importing
    const { NativeModules } = require('react-native');
    console.log('[RevenueCat] NativeModules available:', !!NativeModules);
    console.log('[RevenueCat] RNPurchases module exists:', !!NativeModules?.RNPurchases);

    if (NativeModules.RNPurchases) {
      const RNPurchases = require('react-native-purchases');
      console.log('[RevenueCat] RNPurchases imported:', !!RNPurchases);
      console.log('[RevenueCat] RNPurchases.default:', !!RNPurchases?.default);

      Purchases = RNPurchases.default;
      LOG_LEVEL = RNPurchases.LOG_LEVEL;
      PURCHASES_ERROR_CODE = RNPurchases.PURCHASES_ERROR_CODE;
      isRevenueCatAvailable = true;
      console.log('[RevenueCat] Core SDK loaded successfully');
    } else {
      sdkLoadError = 'Native module RNPurchases not found';
      console.warn('[RevenueCat] Native module not found - running in mock mode (Expo Go?)');
    }
  } catch (e: any) {
    sdkLoadError = e?.message || 'Unknown SDK load error';
    console.error('[RevenueCat] Failed to load native module:', e);
    console.error('[RevenueCat] Error stack:', e?.stack);
  }
}

// Load SDK immediately but safely
loadRevenueCatSDK();

// =============================================================================
// CONFIGURATION
// =============================================================================

// RevenueCat API keys — loaded from environment
import { REVENUECAT_IOS_KEY, REVENUECAT_ANDROID_KEY } from '@/constants/env';
const REVENUECAT_API_KEY_IOS = REVENUECAT_IOS_KEY;
const REVENUECAT_API_KEY_ANDROID = REVENUECAT_ANDROID_KEY;

// Entitlement identifiers from RevenueCat dashboard
// IMPORTANT: These must match EXACTLY what's configured in RevenueCat Dashboard
export const ENTITLEMENTS = {
  PRO: 'VPN Simnetiq Pro', // Maps to Pro tier - matches RevenueCat entitlement identifier
  PREMIUM: 'premium', // Maps to Premium tier (optional future use)
} as const;

// Product identifiers (configured in App Store Connect / Play Console)
export const PRODUCTS = {
  MONTHLY: 'vpn_premium_monthly',
  SIX_MONTH: 'vpn_premium_6m',
  YEARLY: 'vpn_premium_yearly',
} as const;

// =============================================================================
// TYPES
// =============================================================================

export interface SubscriptionPackage {
  identifier: string;
  product: {
    identifier: string;
    title: string;
    description: string;
    priceString: string;
    price: number;
    currencyCode: string;
    // Intro pricing from RevenueCat (for free trials)
    introPrice: {
      priceString: string;
      price: number;
      periodNumberOfUnits: number;
      periodUnit: string; // 'DAY', 'WEEK', 'MONTH', 'YEAR'
    } | null;
  };
  packageType: 'MONTHLY' | 'SIX_MONTH' | 'ANNUAL' | 'LIFETIME' | 'WEEKLY' | 'UNKNOWN';
  offeringIdentifier: string;
  rcPackage: PurchasesPackage | null; // Keep reference for purchase (null in mock mode)
}

interface RevenueCatContextType {
  // Initialization state
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  isMockMode: boolean; // True when native module isn't available

  // Customer state
  customerInfo: CustomerInfo | null;

  // Derived subscription state (single source of truth)
  isPro: boolean;
  isPremium: boolean;
  currentTier: SubscriptionTier;

  // Active subscription info
  activeSubscription: {
    productIdentifier: string | null;
    expirationDate: Date | null;
    willRenew: boolean;
    isInTrial: boolean;
    isInGracePeriod: boolean;
  } | null;

  // Trial eligibility - whether user can start a free trial
  isTrialEligible: boolean;
  trialDuration: { days: number; unit: string } | null;

  // Offerings
  offerings: PurchasesOfferings | null;
  packages: SubscriptionPackage[];
  monthlyPackage: SubscriptionPackage | null;
  sixMonthPackage: SubscriptionPackage | null;
  yearlyPackage: SubscriptionPackage | null;

  // Paywall visibility (for custom paywall modal)
  isPaywallVisible: boolean;
  showPaywall: () => void;
  hidePaywall: () => void;

  // Actions
  purchasePackage: (pkg: SubscriptionPackage) => Promise<{ success: boolean; error?: string }>;
  restorePurchases: () => Promise<{ success: boolean; restored: boolean; error?: string }>;
  refreshCustomerInfo: () => Promise<void>;
  refreshOfferings: () => Promise<void>;
  checkTrialEligibility: (pkg: SubscriptionPackage) => Promise<boolean>;

  // Helpers
  getPackageByProductId: (productId: string) => SubscriptionPackage | null;
  formatPrice: (pkg: SubscriptionPackage) => string;
  getSavingsPercentage: () => number | null;
}

const RevenueCatContext = createContext<RevenueCatContextType | undefined>(undefined);

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getApiKey(): string {
  return Platform.select({
    ios: REVENUECAT_API_KEY_IOS,
    android: REVENUECAT_API_KEY_ANDROID,
    default: REVENUECAT_API_KEY_IOS,
  }) || '';
}

function mapPackageType(type: string): SubscriptionPackage['packageType'] {
  switch (type) {
    case '$rc_monthly': return 'MONTHLY';
    case '$rc_six_month': return 'SIX_MONTH';
    case '$rc_annual': return 'ANNUAL';
    case '$rc_lifetime': return 'LIFETIME';
    case '$rc_weekly': return 'WEEKLY';
    default: return 'UNKNOWN';
  }
}

function convertPackage(pkg: PurchasesPackage): SubscriptionPackage {
  // Extract intro pricing if available (for free trials)
  const introPrice = pkg.product.introPrice ? {
    priceString: pkg.product.introPrice.priceString,
    price: pkg.product.introPrice.price,
    periodNumberOfUnits: pkg.product.introPrice.periodNumberOfUnits,
    periodUnit: pkg.product.introPrice.periodUnit,
  } : null;

  return {
    identifier: pkg.identifier,
    product: {
      identifier: pkg.product.identifier,
      title: pkg.product.title,
      description: pkg.product.description,
      priceString: pkg.product.priceString,
      price: pkg.product.price,
      currencyCode: pkg.product.currencyCode,
      introPrice,
    },
    packageType: mapPackageType(pkg.identifier),
    offeringIdentifier: pkg.offeringIdentifier,
    rcPackage: pkg,
  };
}

function determineTierFromEntitlements(customerInfo: CustomerInfo | null): SubscriptionTier {
  if (!customerInfo) return 'free';

  const entitlements = customerInfo.entitlements.active;

  // Check Premium first (higher tier)
  if (entitlements[ENTITLEMENTS.PREMIUM]?.isActive) {
    return 'premium';
  }

  // Check Pro
  if (entitlements[ENTITLEMENTS.PRO]?.isActive) {
    return 'pro';
  }

  return 'free';
}

// Mock packages for development/Expo Go
function getMockPackages(): SubscriptionPackage[] {
  return [
    {
      identifier: '$rc_monthly',
      product: {
        identifier: PRODUCTS.MONTHLY,
        title: 'Premium Monthly',
        description: 'Monthly subscription to Doppler VPN Premium',
        priceString: '$9.99',
        price: 9.99,
        currencyCode: 'USD',
        introPrice: {
          priceString: '$0.00',
          price: 0,
          periodNumberOfUnits: 7,
          periodUnit: 'DAY',
        },
      },
      packageType: 'MONTHLY',
      offeringIdentifier: 'default',
      rcPackage: null,
    },
    {
      identifier: '$rc_six_month',
      product: {
        identifier: PRODUCTS.SIX_MONTH,
        title: 'Premium 6 Months',
        description: '6-month subscription to Doppler VPN Premium',
        priceString: '$49.99',
        price: 49.99,
        currencyCode: 'USD',
        introPrice: {
          priceString: '$0.00',
          price: 0,
          periodNumberOfUnits: 7,
          periodUnit: 'DAY',
        },
      },
      packageType: 'SIX_MONTH',
      offeringIdentifier: 'default',
      rcPackage: null,
    },
    {
      identifier: '$rc_annual',
      product: {
        identifier: PRODUCTS.YEARLY,
        title: 'Premium Yearly',
        description: 'Annual subscription to Doppler VPN Premium - Best Value!',
        priceString: '$79.99',
        price: 79.99,
        currencyCode: 'USD',
        introPrice: {
          priceString: '$0.00',
          price: 0,
          periodNumberOfUnits: 7,
          periodUnit: 'DAY',
        },
      },
      packageType: 'ANNUAL',
      offeringIdentifier: 'default',
      rcPackage: null,
    },
  ];
}

// =============================================================================
// PROVIDER
// =============================================================================

interface RevenueCatProviderProps {
  children: ReactNode;
}

export function RevenueCatProvider({ children }: RevenueCatProviderProps) {
  const { account } = useAuth();

  // State
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [offerings, setOfferings] = useState<PurchasesOfferings | null>(null);
  const [isMockMode, setIsMockMode] = useState(!isRevenueCatAvailable);
  const [isPaywallVisible, setIsPaywallVisible] = useState(false);
  const [isTrialEligible, setIsTrialEligible] = useState(true); // Default true for new users

  // Paywall visibility methods
  const showPaywall = useCallback(() => {
    console.log('[RevenueCat] showPaywall called');
    setIsPaywallVisible(true);
  }, []);

  const hidePaywall = useCallback(() => {
    console.log('[RevenueCat] hidePaywall called');
    setIsPaywallVisible(false);
  }, []);

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  useEffect(() => {
    initializeRevenueCat();
  }, []);

  // Sync RevenueCat App User ID with our account system
  //
  // IMPORTANT: Following RevenueCat best practices for "custom App User IDs only" apps:
  // - We NEVER call Purchases.logOut() as this creates unnecessary anonymous users
  // - When user logs in, we call logIn(accountId) which handles identity switching
  // - When user logs out from the app, we just clear local customerInfo state
  // - The next logIn() call will properly switch to the new user's identity
  //
  // See: https://www.revenuecat.com/docs/customers/identifying-customers
  useEffect(() => {
    if (!isInitialized || isMockMode) return;

    if (account?.account_id) {
      // User logged in - sync their ID to RevenueCat
      syncAppUserId(account.account_id);
    } else {
      // User logged out from app - just clear local state
      // DO NOT call Purchases.logOut() - this would:
      // 1. Create a new anonymous user (wasteful)
      // 2. Potentially cause cache file errors
      // 3. Risk subscription aliasing issues
      // The next logIn() call will properly switch identity
      handleAppLogout();
    }
  }, [isInitialized, account?.account_id, isMockMode]);

  // Handle app-level logout (NOT RevenueCat logout)
  // Just clears local state - RevenueCat identity is preserved until next logIn()
  function handleAppLogout() {
    console.log('[RevenueCat] App logout - clearing local customer info');
    setCustomerInfo(null);
    // Note: We intentionally do NOT call Purchases.logOut() here
    // The customerInfo listener will still fire but we ignore updates until next login
  }

  // Listen for app state changes to refresh customer info
  useEffect(() => {
    if (isMockMode) return;

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [isInitialized, isMockMode]);

  async function handleAppStateChange(nextAppState: AppStateStatus) {
    if (nextAppState === 'active' && isInitialized && !isMockMode) {
      // Refresh customer info when app becomes active
      await refreshCustomerInfo();
    }
  }

  async function initializeRevenueCat() {
    console.log('[RevenueCat] === INITIALIZATION START ===');
    console.log('[RevenueCat] Platform:', Platform.OS);
    console.log('[RevenueCat] isRevenueCatAvailable:', isRevenueCatAvailable);
    console.log('[RevenueCat] Purchases object exists:', !!Purchases);
    console.log('[RevenueCat] SDK load error:', sdkLoadError);

    // If native module isn't available, run in mock mode
    if (!isRevenueCatAvailable || !Purchases) {
      // CRITICAL: This should NOT happen in production App Store builds
      console.error('[RevenueCat] CRITICAL: SDK not available - this indicates a build configuration issue');
      console.error('[RevenueCat] isRevenueCatAvailable:', isRevenueCatAvailable);
      console.error('[RevenueCat] Purchases exists:', !!Purchases);
      console.error('[RevenueCat] SDK load error:', sdkLoadError);
      setError(sdkLoadError || 'RevenueCat SDK not available');
      setIsMockMode(true);
      setIsInitialized(true);
      setIsLoading(false);
      return;
    }

    try {
      const apiKey = getApiKey();
      console.log('[RevenueCat] Initializing with API key prefix:', apiKey?.substring(0, 10) + '...');

      if (!apiKey || apiKey.includes('YOUR_')) {
        console.warn('[RevenueCat] API key not configured - running in mock mode');
        setIsMockMode(true);
        setIsInitialized(true);
        setIsLoading(false);
        return;
      }

      // Configure RevenueCat - enable debug logging in all environments for diagnostics
      if (LOG_LEVEL) {
        Purchases.setLogLevel(LOG_LEVEL.DEBUG);
      }

      console.log('[RevenueCat] Calling Purchases.configure()...');
      await Purchases.configure({ apiKey });
      console.log('[RevenueCat] Configure succeeded');

      // Listen for customer info updates
      Purchases.addCustomerInfoUpdateListener((info) => {
        console.log('[RevenueCat] Customer info updated:', info?.entitlements?.active ? Object.keys(info.entitlements.active) : 'none');
        setCustomerInfo(info);
      });

      // Fetch initial data
      console.log('[RevenueCat] Fetching initial data...');
      const [customerInfoResult, offeringsResult] = await Promise.allSettled([
        fetchCustomerInfo(),
        fetchOfferings(),
      ]);

      // Log results for debugging
      if (customerInfoResult.status === 'rejected') {
        console.error('[RevenueCat] Failed to fetch customer info:', customerInfoResult.reason);
      }
      if (offeringsResult.status === 'rejected') {
        console.error('[RevenueCat] Failed to fetch offerings:', offeringsResult.reason);
        // Set a specific error for offerings failure - this helps diagnose App Store review issues
        setError('Failed to load subscription products. Please check your internet connection.');
      }

      // Check if offerings were fetched successfully
      const offs = offeringsResult.status === 'fulfilled' ? offeringsResult.value : null;
      console.log('[RevenueCat] Offerings fetched:', {
        hasOfferings: !!offs,
        currentOffering: offs?.current?.identifier || 'none',
        availablePackages: offs?.current?.availablePackages?.length || 0,
        packageIds: offs?.current?.availablePackages?.map(p => p.identifier) || [],
      });

      // CRITICAL: Log warning if offerings are empty - this will cause purchase failures
      if (!offs?.current?.availablePackages?.length) {
        console.error('[RevenueCat] WARNING: No packages available in current offering!');
        console.error('[RevenueCat] This will cause "Start Free Trial" to fail during App Store review');
        console.error('[RevenueCat] Check: 1) RevenueCat dashboard offerings config, 2) App Store Connect product status, 3) Paid Apps Agreement');
      }

      setIsInitialized(true);
      if (offs?.current?.availablePackages?.length) {
        setError(null);
      }
      console.log('[RevenueCat] Initialization complete - mock mode:', false);
    } catch (err: any) {
      console.error('[RevenueCat] Initialization error:', err);
      console.error('[RevenueCat] Error message:', err?.message);
      console.error('[RevenueCat] Error code:', err?.code);
      console.error('[RevenueCat] Error userInfo:', err?.userInfo);
      setError('Failed to initialize subscriptions');
      setIsMockMode(true); // Fall back to mock mode on error
    } finally {
      setIsLoading(false);
    }
  }

  // Sync RevenueCat identity with Supabase account
  // This is the ONLY place we should call Purchases.logIn()
  async function syncAppUserId(accountId: string) {
    if (!Purchases) return;

    try {
      const currentUserId = await Purchases.getAppUserID();
      console.log('[RevenueCat] Current user ID:', currentUserId, '| Target:', accountId);

      // Only login if the user ID differs
      if (currentUserId !== accountId) {
        console.log('[RevenueCat] Switching identity from', currentUserId, 'to', accountId);

        // logIn() handles all identity transitions:
        // - Anonymous → Identified: Creates new customer or aliases existing
        // - Identified (A) → Identified (B): Switches to B's customer record
        // This is the correct way to switch users per RevenueCat docs
        const { customerInfo: newInfo, created } = await Purchases.logIn(accountId);

        console.log('[RevenueCat] Login result:', {
          newUserId: accountId,
          created, // true if this is a brand new customer in RevenueCat
          hasActiveEntitlements: Object.keys(newInfo.entitlements.active).length > 0,
        });

        setCustomerInfo(newInfo);

        // Sync subscription to Supabase after identity switch
        await syncSubscriptionToSupabase(newInfo);
      } else {
        // Already the correct user - just refresh customer info
        console.log('[RevenueCat] Already logged in as', accountId);
        const info = await Purchases.getCustomerInfo();
        setCustomerInfo(info);
        await syncSubscriptionToSupabase(info);
      }
    } catch (err: any) {
      console.error('[RevenueCat] Error syncing user ID:', err);
      console.error('[RevenueCat] Error details:', {
        code: err?.code,
        message: err?.message,
        underlyingError: err?.underlyingErrorMessage,
      });
      // Don't throw - subscription features should degrade gracefully
    }
  }

  // ==========================================================================
  // SUBSCRIPTION SYNC TO SUPABASE (WITH OWNERSHIP PROTECTION)
  // ==========================================================================

  // Track last synced values to prevent duplicate syncs
  const lastSyncRef = React.useRef<{
    tier: string | null;
    expiresAt: string | null;
    transactionId: string | null;
    timestamp: number;
  }>({ tier: null, expiresAt: null, transactionId: null, timestamp: 0 });

  // Generate a stable unique transaction identifier from entitlement data
  // This is used to track subscription ownership and prevent duplication
  function generateTransactionId(entitlement: {
    productIdentifier: string;
    originalPurchaseDate: string | null;
  }): string | null {
    if (!entitlement.originalPurchaseDate) return null;

    // Create a stable ID from product + original purchase timestamp
    // This will be the same regardless of which account restores it
    const timestamp = new Date(entitlement.originalPurchaseDate).getTime();
    return `${entitlement.productIdentifier}_${timestamp}`;
  }

  // Sync subscription status to Supabase with ownership enforcement
  // Uses claim_subscription() RPC which:
  // 1. Claims new subscriptions for the current account
  // 2. Updates existing subscriptions owned by current account
  // 3. Transfers subscriptions from other accounts (revokes old, grants new)
  async function syncSubscriptionToSupabase(info: CustomerInfo | null) {
    if (!isSupabaseConfigured || !account?.account_id) return;

    const tier = determineTierFromEntitlements(info);

    // Extract subscription details from active entitlement
    let expiresAt: string | null = null;
    let originalTransactionId: string | null = null;
    let productId: string | null = null;

    if (info) {
      const proEntitlement = info.entitlements.active[ENTITLEMENTS.PRO];
      const premiumEntitlement = info.entitlements.active[ENTITLEMENTS.PREMIUM];
      const entitlement = premiumEntitlement || proEntitlement;

      if (entitlement) {
        expiresAt = entitlement.expirationDate || null;
        productId = entitlement.productIdentifier;

        // Generate stable transaction ID for ownership tracking
        originalTransactionId = generateTransactionId({
          productIdentifier: entitlement.productIdentifier,
          originalPurchaseDate: entitlement.originalPurchaseDate,
        });
      }
    }

    // Skip if nothing changed (deduplication)
    const lastSync = lastSyncRef.current;
    if (
      lastSync.tier === tier &&
      lastSync.expiresAt === expiresAt &&
      lastSync.transactionId === originalTransactionId
    ) {
      return;
    }

    // Throttle: don't sync more than once per 30 seconds
    const now = Date.now();
    if (now - lastSync.timestamp < 30000) {
      return;
    }

    try {
      // Use claim_subscription for ownership-aware sync
      // This prevents subscription duplication across accounts
      const { data, error } = await supabase.rpc('claim_subscription', {
        p_account_id: account.account_id,
        p_tier: tier,
        p_expires_at: expiresAt,
        p_original_transaction_id: originalTransactionId,
        p_store: Platform.OS === 'ios' ? 'app_store' : 'play_store',
        p_product_id: productId,
      });

      if (error) {
        console.warn('[RevenueCat] Failed to claim subscription:', error);
        return;
      }

      // Update last sync state
      lastSyncRef.current = { tier, expiresAt, transactionId: originalTransactionId, timestamp: now };

      // Log the action taken
      const result = data as { success: boolean; action?: string; previous_owner?: string };
      if (result.success) {
        if (result.action === 'transferred') {
          console.log('[RevenueCat] Subscription transferred from:', result.previous_owner);
          // The subscription was moved from another account to this one
          // The previous account was automatically downgraded to free
        } else if (result.action === 'claimed') {
          console.log('[RevenueCat] New subscription claimed for account');
        } else {
          console.log('[RevenueCat] Subscription updated:', { tier, expiresAt });
        }
      }
    } catch (err) {
      // Non-critical - log but don't throw
      console.warn('[RevenueCat] Failed to sync subscription to Supabase:', err);
    }
  }

  // ==========================================================================
  // DATA FETCHING
  // ==========================================================================

  async function fetchCustomerInfo() {
    if (!Purchases) return null;

    try {
      const info = await Purchases.getCustomerInfo();
      setCustomerInfo(info);

      // Sync to Supabase after fetching
      await syncSubscriptionToSupabase(info);

      return info;
    } catch (err) {
      console.error('[RevenueCat] Error fetching customer info:', err);
      throw err;
    }
  }

  async function fetchOfferings() {
    if (!Purchases) return null;

    try {
      const offs = await Purchases.getOfferings();
      setOfferings(offs);
      return offs;
    } catch (err) {
      console.error('[RevenueCat] Error fetching offerings:', err);
      throw err;
    }
  }

  // Track last refresh time to prevent excessive API calls
  const lastRefreshRef = React.useRef<number>(0);

  const refreshCustomerInfo = useCallback(async () => {
    if (!isInitialized || isMockMode) return;

    // Throttle: don't refresh more than once per 10 seconds
    const now = Date.now();
    if (now - lastRefreshRef.current < 10000) {
      return;
    }
    lastRefreshRef.current = now;

    try {
      await fetchCustomerInfo();
    } catch (err) {
      console.error('[RevenueCat] Error refreshing customer info:', err);
    }
  }, [isInitialized, isMockMode]);

  // Track last offerings refresh time
  const lastOfferingsRefreshRef = React.useRef<number>(0);

  const refreshOfferings = useCallback(async () => {
    if (!isInitialized || isMockMode || !Purchases) {
      console.log('[RevenueCat] Cannot refresh offerings:', { isInitialized, isMockMode, hasPurchases: !!Purchases });
      return;
    }

    // Throttle: don't refresh more than once per 10 seconds
    const now = Date.now();
    if (now - lastOfferingsRefreshRef.current < 10000) {
      console.log('[RevenueCat] Offerings refresh throttled');
      return;
    }
    lastOfferingsRefreshRef.current = now;

    try {
      console.log('[RevenueCat] Refreshing offerings...');
      const offs = await fetchOfferings();
      console.log('[RevenueCat] Offerings refreshed:', {
        hasOfferings: !!offs,
        currentOffering: offs?.current?.identifier || 'none',
        availablePackages: offs?.current?.availablePackages?.length || 0,
      });
      if (offs?.current?.availablePackages?.length) {
        setError(null);
      }
    } catch (err) {
      console.error('[RevenueCat] Error refreshing offerings:', err);
    }
  }, [isInitialized, isMockMode]);

  // ==========================================================================
  // PURCHASE ACTIONS
  // ==========================================================================

  const purchasePackage = useCallback(async (
    pkg: SubscriptionPackage
  ): Promise<{ success: boolean; error?: string }> => {
    if (isMockMode) {
      return { success: false, error: 'Purchases not available in development mode. Please build and run on a device.' };
    }

    if (!isInitialized || !Purchases) {
      console.error('[RevenueCat] Purchase failed: SDK not initialized', {
        isInitialized,
        hasPurchases: !!Purchases,
      });
      return { success: false, error: 'Subscriptions not initialized. Please restart the app.' };
    }

    // Validate package before attempting purchase
    if (!pkg) {
      console.error('[RevenueCat] Purchase failed: No package provided');
      return { success: false, error: 'No subscription package selected' };
    }

    if (!pkg.rcPackage) {
      console.error('[RevenueCat] Purchase failed: Invalid package (no rcPackage)', {
        packageId: pkg.identifier,
        productId: pkg.product?.identifier,
      });
      return { success: false, error: 'Invalid package. Please try refreshing the app.' };
    }

    // Verify offerings are loaded and product exists
    if (!offerings?.current) {
      console.error('[RevenueCat] Purchase failed: No offerings available');
      return { success: false, error: 'Subscription products not loaded. Please check your connection and try again.' };
    }

    console.log('[RevenueCat] Starting purchase', {
      packageId: pkg.identifier,
      productId: pkg.product.identifier,
      price: pkg.product.priceString,
    });

    setIsLoading(true);

    try {
      const { customerInfo: newInfo } = await Purchases.purchasePackage(pkg.rcPackage);
      setCustomerInfo(newInfo);

      // Check if entitlement is now active
      const tier = determineTierFromEntitlements(newInfo);
      if (tier !== 'free') {
        console.log('[RevenueCat] Purchase successful', { tier });
        return { success: true };
      }

      console.warn('[RevenueCat] Purchase completed but entitlement not active', {
        activeEntitlements: Object.keys(newInfo.entitlements.active),
        expectedEntitlements: [ENTITLEMENTS.PRO, ENTITLEMENTS.PREMIUM],
      });
      return { success: false, error: 'Purchase completed but subscription not activated. Please contact support.' };
    } catch (err) {
      const purchaseError = err as PurchasesError;

      // Log detailed error info for debugging (especially for iPad App Store review)
      console.error('[RevenueCat] Purchase error details:', {
        code: purchaseError.code,
        message: purchaseError.message,
        underlyingErrorMessage: (purchaseError as any).underlyingErrorMessage,
        userInfo: (purchaseError as any).userInfo,
        productId: pkg.product.identifier,
        platform: Platform.OS,
        isIPad: Platform.OS === 'ios' && Platform.isPad,
        platformVersion: Platform.Version,
      });

      // Handle specific StoreKit error codes
      if (PURCHASES_ERROR_CODE) {
        switch (purchaseError.code) {
          case PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR:
            console.log('[RevenueCat] User cancelled purchase');
            return { success: false, error: 'Purchase cancelled' };

          case PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR:
            console.log('[RevenueCat] Product already purchased, refreshing...');
            await refreshCustomerInfo();
            return { success: true };

          case PURCHASES_ERROR_CODE.STORE_PROBLEM_ERROR:
            return { success: false, error: 'App Store is temporarily unavailable. Please try again later.' };

          case PURCHASES_ERROR_CODE.PURCHASE_NOT_ALLOWED_ERROR:
            return { success: false, error: 'Purchases are not allowed on this device. Please check your device restrictions.' };

          case PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR:
            return { success: false, error: 'Payment is pending. You will be notified when it completes.' };

          case PURCHASES_ERROR_CODE.PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR:
            return { success: false, error: 'This product is not available for purchase in your region.' };

          case PURCHASES_ERROR_CODE.NETWORK_ERROR:
            return { success: false, error: 'Network error. Please check your connection and try again.' };

          case PURCHASES_ERROR_CODE.INVALID_CREDENTIALS_ERROR:
            return { success: false, error: 'Invalid App Store credentials. Please sign out and sign back into the App Store.' };

          case PURCHASES_ERROR_CODE.RECEIPT_IN_USE_BY_OTHER_SUBSCRIBER_ERROR:
            return { success: false, error: 'This subscription is already linked to another account.' };

          case PURCHASES_ERROR_CODE.UNKNOWN_ERROR:
          default:
            // For unknown errors, include more context
            const errorMsg = purchaseError.message || 'An unexpected error occurred';
            return { success: false, error: `Purchase failed: ${errorMsg}` };
        }
      }

      // Fallback for when error codes aren't available
      return { success: false, error: purchaseError.message || 'Purchase failed. Please try again.' };
    } finally {
      setIsLoading(false);
    }
  }, [isInitialized, isMockMode, refreshCustomerInfo, offerings]);

  const restorePurchases = useCallback(async (): Promise<{
    success: boolean;
    restored: boolean;
    error?: string;
  }> => {
    if (isMockMode) {
      return { success: false, restored: false, error: 'Restore not available in development mode' };
    }

    if (!isInitialized || !Purchases) {
      return { success: false, restored: false, error: 'Subscriptions not initialized' };
    }

    setIsLoading(true);

    try {
      const newInfo = await Purchases.restorePurchases();
      setCustomerInfo(newInfo);

      const tier = determineTierFromEntitlements(newInfo);
      const restored = tier !== 'free';

      return { success: true, restored };
    } catch (err) {
      const purchaseError = err as PurchasesError;
      console.error('[RevenueCat] Restore error:', purchaseError);
      return {
        success: false,
        restored: false,
        error: purchaseError.message || 'Failed to restore purchases',
      };
    } finally {
      setIsLoading(false);
    }
  }, [isInitialized, isMockMode]);

  // ==========================================================================
  // DERIVED STATE
  // ==========================================================================

  const currentTier = useMemo(() => {
    return determineTierFromEntitlements(customerInfo);
  }, [customerInfo]);

  const isPro = currentTier === 'pro' || currentTier === 'premium';
  const isPremium = currentTier === 'premium';

  const activeSubscription = useMemo(() => {
    if (!customerInfo) return null;

    const proEntitlement = customerInfo.entitlements.active[ENTITLEMENTS.PRO];
    const premiumEntitlement = customerInfo.entitlements.active[ENTITLEMENTS.PREMIUM];
    const entitlement = premiumEntitlement || proEntitlement;

    if (!entitlement) return null;

    return {
      productIdentifier: entitlement.productIdentifier,
      expirationDate: entitlement.expirationDate ? new Date(entitlement.expirationDate) : null,
      willRenew: entitlement.willRenew,
      isInTrial: entitlement.periodType === 'TRIAL',
      isInGracePeriod: entitlement.billingIssueDetectedAt != null,
    };
  }, [customerInfo]);

  // Convert offerings to packages
  // IMPORTANT: Only use mock packages in actual mock mode (development/Expo Go).
  // In production, return empty array if offerings haven't loaded — this prevents
  // showing fake packages with null rcPackage that cause "Invalid package" errors
  // when the user taps "Start Free Trial".
  const packages = useMemo((): SubscriptionPackage[] => {
    if (isMockMode) {
      return getMockPackages();
    }

    const current = offerings?.current;
    if (!current) return [];

    return current.availablePackages.map(convertPackage);
  }, [offerings, isMockMode]);

  const monthlyPackage = useMemo(() => {
    return packages.find(p => p.packageType === 'MONTHLY') || null;
  }, [packages]);

  const sixMonthPackage = useMemo(() => {
    return packages.find(p => p.packageType === 'SIX_MONTH') || null;
  }, [packages]);

  const yearlyPackage = useMemo(() => {
    return packages.find(p => p.packageType === 'ANNUAL') || null;
  }, [packages]);

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  const getPackageByProductId = useCallback((productId: string): SubscriptionPackage | null => {
    return packages.find(p => p.product.identifier === productId) || null;
  }, [packages]);

  const formatPrice = useCallback((pkg: SubscriptionPackage): string => {
    return pkg.product.priceString;
  }, []);

  const getSavingsPercentage = useCallback((): number | null => {
    if (!monthlyPackage || !yearlyPackage) return null;

    const monthlyAnnualized = monthlyPackage.product.price * 12;
    const yearlyPrice = yearlyPackage.product.price;

    if (monthlyAnnualized <= 0) return null;

    const savings = ((monthlyAnnualized - yearlyPrice) / monthlyAnnualized) * 100;
    return Math.round(savings);
  }, [monthlyPackage, yearlyPackage]);

  // Check trial eligibility for a specific package
  // Uses RevenueCat's checkTrialOrIntroDiscountEligibility API
  const checkTrialEligibility = useCallback(async (pkg: SubscriptionPackage): Promise<boolean> => {
    if (isMockMode) {
      // In mock mode, assume trial eligible for new users
      return true;
    }

    if (!Purchases || !pkg.rcPackage) {
      return true; // Default to eligible if we can't check
    }

    try {
      // RevenueCat provides intro eligibility checking
      const eligibility = await Purchases.checkTrialOrIntroductoryPriceEligibility([pkg.product.identifier]);
      const productEligibility = eligibility[pkg.product.identifier];

      // INTRO_ELIGIBILITY_STATUS: UNKNOWN = 0, INELIGIBLE = 1, ELIGIBLE = 2
      const isEligible = productEligibility?.status === 2;
      setIsTrialEligible(isEligible);
      return isEligible;
    } catch (err) {
      console.warn('[RevenueCat] Error checking trial eligibility:', err);
      return true; // Default to eligible on error
    }
  }, [isMockMode]);

  // Auto-check trial eligibility when offerings change
  // This ensures the paywall shows the correct CTA ("Start Free Trial" vs "Subscribe")
  useEffect(() => {
    if (isMockMode || !Purchases || !offerings?.current?.availablePackages?.length) return;

    const productIds = offerings.current.availablePackages.map(
      (p: PurchasesPackage) => p.product.identifier
    );

    Purchases.checkTrialOrIntroductoryPriceEligibility(productIds)
      .then((eligibility: Record<string, { status: number }>) => {
        // INTRO_ELIGIBILITY_STATUS: UNKNOWN = 0, INELIGIBLE = 1, ELIGIBLE = 2
        const anyEligible = Object.values(eligibility).some(e => e.status === 2);
        setIsTrialEligible(anyEligible);
        console.log('[RevenueCat] Trial eligibility auto-checked:', {
          anyEligible,
          products: Object.entries(eligibility).map(([id, e]) => `${id}: ${e.status}`),
        });
      })
      .catch((err: any) => {
        console.warn('[RevenueCat] Error auto-checking trial eligibility:', err);
        // Keep default (true) on error — StoreKit will show the correct terms at purchase
      });
  }, [offerings, isMockMode]);

  // Derive trial duration from yearly package (or first package with intro)
  const trialDuration = useMemo(() => {
    const pkgWithTrial = yearlyPackage || sixMonthPackage || monthlyPackage;
    if (!pkgWithTrial?.product.introPrice) return null;

    const intro = pkgWithTrial.product.introPrice;
    if (intro.price > 0) return null; // Not a free trial

    return {
      days: intro.periodUnit === 'DAY' ? intro.periodNumberOfUnits :
            intro.periodUnit === 'WEEK' ? intro.periodNumberOfUnits * 7 :
            intro.periodUnit === 'MONTH' ? intro.periodNumberOfUnits * 30 : 0,
      unit: intro.periodUnit,
    };
  }, [yearlyPackage, sixMonthPackage, monthlyPackage]);

  // ==========================================================================
  // CONTEXT VALUE
  // ==========================================================================

  const value = useMemo<RevenueCatContextType>(() => ({
    // State
    isInitialized,
    isLoading,
    error,
    isMockMode,
    customerInfo,

    // Derived subscription state
    isPro,
    isPremium,
    currentTier,
    activeSubscription,

    // Trial eligibility
    isTrialEligible,
    trialDuration,

    // Offerings
    offerings,
    packages,
    monthlyPackage,
    sixMonthPackage,
    yearlyPackage,

    // Paywall visibility
    isPaywallVisible,
    showPaywall,
    hidePaywall,

    // Actions
    purchasePackage,
    restorePurchases,
    refreshCustomerInfo,
    refreshOfferings,
    checkTrialEligibility,

    // Helpers
    getPackageByProductId,
    formatPrice,
    getSavingsPercentage,
  }), [
    isInitialized,
    isLoading,
    error,
    isMockMode,
    customerInfo,
    isPro,
    isPremium,
    currentTier,
    activeSubscription,
    isTrialEligible,
    trialDuration,
    offerings,
    packages,
    monthlyPackage,
    sixMonthPackage,
    yearlyPackage,
    isPaywallVisible,
    showPaywall,
    hidePaywall,
    purchasePackage,
    restorePurchases,
    refreshCustomerInfo,
    refreshOfferings,
    checkTrialEligibility,
    getPackageByProductId,
    formatPrice,
    getSavingsPercentage,
  ]);

  return (
    <RevenueCatContext.Provider value={value}>
      {children}
    </RevenueCatContext.Provider>
  );
}

// =============================================================================
// HOOKS
// =============================================================================

export function useRevenueCat(): RevenueCatContextType {
  const context = useContext(RevenueCatContext);
  if (!context) {
    throw new Error('useRevenueCat must be used within a RevenueCatProvider');
  }
  return context;
}

/**
 * Hook to check subscription status with loading state
 */
export function useSubscriptionStatus() {
  const { isPro, isPremium, currentTier, activeSubscription, isLoading, error, isMockMode } = useRevenueCat();

  return {
    isPro,
    isPremium,
    currentTier,
    activeSubscription,
    isLoading,
    error,
    isMockMode,
  };
}

/**
 * Hook for paywall - returns showPaywall function and packages
 */
export function usePaywall() {
  const {
    isPaywallVisible,
    showPaywall,
    hidePaywall,
    packages,
    monthlyPackage,
    sixMonthPackage,
    yearlyPackage,
    purchasePackage,
    restorePurchases,
    isLoading,
    getSavingsPercentage,
    isMockMode,
  } = useRevenueCat();

  return {
    isPaywallVisible,
    showPaywall,
    hidePaywall,
    packages,
    monthlyPackage,
    sixMonthPackage,
    yearlyPackage,
    purchasePackage,
    restorePurchases,
    isLoading,
    savingsPercentage: getSavingsPercentage(),
    isMockMode,
  };
}
