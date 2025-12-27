import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';

// Storage keys
const STORAGE_KEYS = {
  PARENTAL_ENABLED: '@parental/enabled',
  BLOCKED_CATEGORIES: '@parental/blocked_categories',
  CUSTOM_BLOCKED_DOMAINS: '@parental/custom_blocked_domains',
  SCREEN_TIME_LIMIT: '@parental/screen_time_limit',
  SCHEDULED_ACCESS: '@parental/scheduled_access',
};

// Content categories that can be blocked via AdGuard DNS filtering
export type ContentCategory =
  | 'adult'
  | 'gambling'
  | 'social_media'
  | 'gaming'
  | 'streaming'
  | 'malware'
  | 'ads_trackers';

export interface CategoryInfo {
  id: ContentCategory;
  name: string;
  description: string;
  icon: string;
  color: string;
}

export const CONTENT_CATEGORIES: CategoryInfo[] = [
  {
    id: 'adult',
    name: 'Adult Content',
    description: 'Block explicit and mature content',
    icon: 'shield-off',
    color: '#EF4444',
  },
  {
    id: 'gambling',
    name: 'Gambling',
    description: 'Block betting and gambling sites',
    icon: 'dice',
    color: '#F59E0B',
  },
  {
    id: 'social_media',
    name: 'Social Media',
    description: 'Block social networking platforms',
    icon: 'users',
    color: '#3B82F6',
  },
  {
    id: 'gaming',
    name: 'Gaming',
    description: 'Block online games and gaming sites',
    icon: 'gamepad-2',
    color: '#8B5CF6',
  },
  {
    id: 'streaming',
    name: 'Streaming',
    description: 'Block video streaming platforms',
    icon: 'play-circle',
    color: '#EC4899',
  },
  {
    id: 'malware',
    name: 'Malware & Phishing',
    description: 'Block dangerous websites',
    icon: 'bug',
    color: '#DC2626',
  },
  {
    id: 'ads_trackers',
    name: 'Ads & Trackers',
    description: 'Block advertisements and trackers',
    icon: 'eye-off',
    color: '#6B7280',
  },
];

export interface ScheduledAccess {
  enabled: boolean;
  startTime: string; // HH:MM format
  endTime: string;   // HH:MM format
  daysOfWeek: number[]; // 0-6, Sunday-Saturday
}

export interface BlockingStats {
  totalBlocked: number;
  blockedToday: number;
  topBlockedDomains: { domain: string; count: number }[];
  categoryBreakdown: { category: string; count: number }[];
}

interface ParentalControlsContextType {
  // State
  isEnabled: boolean;
  blockedCategories: ContentCategory[];
  customBlockedDomains: string[];
  screenTimeLimit: number | null; // minutes per day, null = unlimited
  scheduledAccess: ScheduledAccess | null;
  blockingStats: BlockingStats | null;
  loading: boolean;
  isToggling: boolean; // Track if a toggle operation is in progress
  error: string | null; // Last error message for user feedback

  // Category Management
  toggleCategory: (category: ContentCategory) => Promise<void>;
  setBlockedCategories: (categories: ContentCategory[]) => Promise<void>;

  // Custom Domain Management
  addBlockedDomain: (domain: string) => Promise<void>;
  removeBlockedDomain: (domain: string) => Promise<void>;

  // Screen Time
  setScreenTimeLimit: (minutes: number | null) => Promise<void>;

  // Scheduled Access
  setScheduledAccess: (schedule: ScheduledAccess | null) => Promise<void>;

  // Enable/Disable
  toggleParentalControls: (enabled: boolean) => Promise<void>;

  // Stats
  refreshStats: () => Promise<void>;

  // Error handling
  clearError: () => void;
}

const ParentalControlsContext = createContext<ParentalControlsContextType | undefined>(undefined);

// AdGuard Home API configuration
// Use internal VPN IP when connected, public IP otherwise
const ADGUARD_API = {
  // Try internal VPN IP first (works when VPN connected), fallback to public IP
  baseUrls: ['http://10.0.0.1:3000', 'http://72.61.87.54:3000'],
  username: 'admin',
  password: 'VpnAdmin123',
};

// Helper to make API request with fallback URLs and proper abort support
async function adguardFetch(
  path: string,
  options: RequestInit = {},
  externalSignal?: AbortSignal
): Promise<Response> {
  const auth = btoa(`${ADGUARD_API.username}:${ADGUARD_API.password}`);
  const headers = {
    'Authorization': `Basic ${auth}`,
    ...options.headers,
  };

  let lastError: Error | null = null;

  for (const baseUrl of ADGUARD_API.baseUrls) {
    // Check if externally aborted before trying
    if (externalSignal?.aborted) {
      throw new DOMException('Request aborted', 'AbortError');
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      // Link external signal to our controller
      const abortHandler = () => controller.abort();
      externalSignal?.addEventListener('abort', abortHandler);

      try {
        const response = await fetch(`${baseUrl}${path}`, {
          ...options,
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok || response.status === 401) {
          // Success or auth issue (not network issue)
          return response;
        }
      } finally {
        clearTimeout(timeoutId);
        externalSignal?.removeEventListener('abort', abortHandler);
      }
    } catch (error) {
      // Don't log abort errors as they're intentional
      if ((error as Error).name !== 'AbortError') {
        console.log(`AdGuard API request to ${baseUrl} failed:`, error);
      }
      lastError = error as Error;
      // Try next URL unless aborted
      if ((error as Error).name === 'AbortError') {
        throw error;
      }
    }
  }

  throw lastError || new Error('All AdGuard API endpoints failed');
}

export function ParentalControlsProvider({ children }: { children: React.ReactNode }) {
  const { account } = useAuth();

  // State
  const [isEnabled, setIsEnabled] = useState(false);
  const [blockedCategories, setBlockedCategoriesState] = useState<ContentCategory[]>([]);
  const [customBlockedDomains, setCustomBlockedDomainsState] = useState<string[]>([]);
  const [screenTimeLimit, setScreenTimeLimitState] = useState<number | null>(null);
  const [scheduledAccess, setScheduledAccessState] = useState<ScheduledAccess | null>(null);
  const [blockingStats, setBlockingStats] = useState<BlockingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AbortController ref for cleanup on unmount
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Clear error helper
  const clearError = useCallback(() => setError(null), []);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const [
        enabled,
        categories,
        domains,
        timeLimit,
        schedule,
      ] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.PARENTAL_ENABLED),
        AsyncStorage.getItem(STORAGE_KEYS.BLOCKED_CATEGORIES),
        AsyncStorage.getItem(STORAGE_KEYS.CUSTOM_BLOCKED_DOMAINS),
        AsyncStorage.getItem(STORAGE_KEYS.SCREEN_TIME_LIMIT),
        AsyncStorage.getItem(STORAGE_KEYS.SCHEDULED_ACCESS),
      ]);

      setIsEnabled(enabled === 'true');
      setBlockedCategoriesState(categories ? JSON.parse(categories) : []);
      setCustomBlockedDomainsState(domains ? JSON.parse(domains) : []);
      setScreenTimeLimitState(timeLimit ? parseInt(timeLimit) : null);
      setScheduledAccessState(schedule ? JSON.parse(schedule) : null);

      console.log('Parental controls settings loaded');
    } catch (error) {
      console.error('Error loading parental controls settings:', error);
    } finally {
      setLoading(false);
    }
  };

  // Category Management
  const toggleCategory = useCallback(async (category: ContentCategory) => {
    const newCategories = blockedCategories.includes(category)
      ? blockedCategories.filter(c => c !== category)
      : [...blockedCategories, category];

    setBlockedCategoriesState(newCategories);
    await AsyncStorage.setItem(STORAGE_KEYS.BLOCKED_CATEGORIES, JSON.stringify(newCategories));

    // Sync with AdGuard if enabled
    if (isEnabled) {
      await syncWithAdGuard(newCategories, customBlockedDomains);
    }
  }, [blockedCategories, customBlockedDomains, isEnabled]);

  const setBlockedCategories = useCallback(async (categories: ContentCategory[]) => {
    setBlockedCategoriesState(categories);
    await AsyncStorage.setItem(STORAGE_KEYS.BLOCKED_CATEGORIES, JSON.stringify(categories));

    if (isEnabled) {
      await syncWithAdGuard(categories, customBlockedDomains);
    }
  }, [customBlockedDomains, isEnabled]);

  // Custom Domain Management
  const addBlockedDomain = useCallback(async (domain: string) => {
    const normalizedDomain = domain.toLowerCase().trim().replace(/^(https?:\/\/)?(www\.)?/, '');
    if (!normalizedDomain || customBlockedDomains.includes(normalizedDomain)) return;

    const newDomains = [...customBlockedDomains, normalizedDomain];
    setCustomBlockedDomainsState(newDomains);
    await AsyncStorage.setItem(STORAGE_KEYS.CUSTOM_BLOCKED_DOMAINS, JSON.stringify(newDomains));

    if (isEnabled) {
      await syncWithAdGuard(blockedCategories, newDomains);
    }
  }, [customBlockedDomains, blockedCategories, isEnabled]);

  const removeBlockedDomain = useCallback(async (domain: string) => {
    const newDomains = customBlockedDomains.filter(d => d !== domain);
    setCustomBlockedDomainsState(newDomains);
    await AsyncStorage.setItem(STORAGE_KEYS.CUSTOM_BLOCKED_DOMAINS, JSON.stringify(newDomains));

    if (isEnabled) {
      await syncWithAdGuard(blockedCategories, newDomains);
    }
  }, [customBlockedDomains, blockedCategories, isEnabled]);

  // Screen Time
  const setScreenTimeLimit = useCallback(async (minutes: number | null) => {
    setScreenTimeLimitState(minutes);
    if (minutes !== null) {
      await AsyncStorage.setItem(STORAGE_KEYS.SCREEN_TIME_LIMIT, String(minutes));
    } else {
      await AsyncStorage.removeItem(STORAGE_KEYS.SCREEN_TIME_LIMIT);
    }
  }, []);

  // Scheduled Access
  const setScheduledAccess = useCallback(async (schedule: ScheduledAccess | null) => {
    setScheduledAccessState(schedule);
    if (schedule) {
      await AsyncStorage.setItem(STORAGE_KEYS.SCHEDULED_ACCESS, JSON.stringify(schedule));
    } else {
      await AsyncStorage.removeItem(STORAGE_KEYS.SCHEDULED_ACCESS);
    }
  }, []);

  // Enable/Disable Parental Controls
  const toggleParentalControls = useCallback(async (enabled: boolean) => {
    // Prevent double toggling
    if (isToggling) {
      console.log('Toggle already in progress, ignoring');
      return;
    }

    // Cancel any pending request
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setIsToggling(true);
    setError(null); // Clear previous errors
    const previousEnabled = isEnabled;

    try {
      // Optimistically update UI state
      setIsEnabled(enabled);

      // Try to sync with AdGuard
      if (enabled) {
        await syncWithAdGuard(blockedCategories, customBlockedDomains, signal);
      } else {
        await clearAdGuardRules(signal);
      }

      // Only persist if API call succeeded
      await AsyncStorage.setItem(STORAGE_KEYS.PARENTAL_ENABLED, String(enabled));
      console.log(`Parental controls ${enabled ? 'enabled' : 'disabled'} successfully`);
    } catch (err) {
      // Don't revert or show error if aborted (user cancelled)
      if ((err as Error).name === 'AbortError') {
        console.log('Toggle operation was cancelled');
        return;
      }

      // Revert state on failure
      console.error('Error toggling parental controls:', err);
      setIsEnabled(previousEnabled);

      // Set user-friendly error message
      const message = err instanceof Error ? err.message : 'Failed to update parental controls';
      setError(message);

      throw err; // Re-throw so UI can handle it
    } finally {
      setIsToggling(false);
    }
  }, [blockedCategories, customBlockedDomains, isEnabled, isToggling]);

  // Clear all AdGuard rules when parental controls are disabled
  const clearAdGuardRules = async (signal?: AbortSignal) => {
    // Clear all custom filtering rules
    const response = await adguardFetch(
      '/control/filtering/set_rules',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules: [] }),
      },
      signal
    );

    // Disable safe browsing and parental features (parallel for speed)
    await Promise.all([
      adguardFetch('/control/safebrowsing/disable', { method: 'POST' }, signal),
      adguardFetch('/control/parental/disable', { method: 'POST' }, signal),
    ]);

    if (!response.ok) {
      throw new Error(`Failed to clear rules: ${response.status}`);
    }

    console.log('AdGuard rules cleared');
  };

  // Sync blocking rules with AdGuard Home
  const syncWithAdGuard = async (
    categories: ContentCategory[],
    domains: string[],
    signal?: AbortSignal
  ) => {
    // Build filtering rules based on categories
    const rules: string[] = [];

    // Add category-based blocking (AdGuard uses special syntax)
    if (categories.includes('adult')) {
      // AdGuard has built-in safe browsing for adult content (parallel for speed)
      await Promise.all([
        adguardFetch('/control/safebrowsing/enable', { method: 'POST' }, signal),
        adguardFetch('/control/parental/enable', { method: 'POST' }, signal),
      ]);
    }

    // Add custom blocked domains
    for (const domain of domains) {
      rules.push(`||${domain}^`);
    }

    // Category-specific domain patterns
    if (categories.includes('social_media')) {
      rules.push('||facebook.com^', '||instagram.com^', '||twitter.com^', '||tiktok.com^', '||snapchat.com^');
    }
    if (categories.includes('gaming')) {
      rules.push('||steam.com^', '||epicgames.com^', '||roblox.com^', '||minecraft.net^');
    }
    if (categories.includes('streaming')) {
      rules.push('||netflix.com^', '||youtube.com^', '||twitch.tv^', '||hulu.com^', '||disneyplus.com^');
    }
    if (categories.includes('gambling')) {
      rules.push('||bet365.com^', '||draftkings.com^', '||fanduel.com^', '||pokerstars.com^');
    }

    // Apply custom filtering rules
    const response = await adguardFetch(
      '/control/filtering/set_rules',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules }),
      },
      signal
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to sync rules: ${response.status} - ${errorText}`);
    }

    console.log('AdGuard sync completed:', { categories, domains, rulesCount: rules.length });
  };

  // Refresh blocking stats from AdGuard
  const refreshStats = useCallback(async () => {
    try {
      const response = await adguardFetch('/control/stats');

      if (response.ok) {
        const data = await response.json();

        // Parse AdGuard stats format
        const stats: BlockingStats = {
          totalBlocked: data.num_blocked_filtering || 0,
          blockedToday: data.num_blocked_filtering || 0,
          topBlockedDomains: (data.top_blocked_domains || []).slice(0, 10).map((item: any) => ({
            domain: Object.keys(item)[0] || 'unknown',
            count: Object.values(item)[0] || 0,
          })),
          categoryBreakdown: [],
        };

        setBlockingStats(stats);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  }, []);

  // Memoize context value to prevent unnecessary re-renders
  // This is a React best practice for context providers
  const contextValue = useMemo<ParentalControlsContextType>(
    () => ({
      isEnabled,
      blockedCategories,
      customBlockedDomains,
      screenTimeLimit,
      scheduledAccess,
      blockingStats,
      loading,
      isToggling,
      error,
      toggleCategory,
      setBlockedCategories,
      addBlockedDomain,
      removeBlockedDomain,
      setScreenTimeLimit,
      setScheduledAccess,
      toggleParentalControls,
      refreshStats,
      clearError,
    }),
    [
      isEnabled,
      blockedCategories,
      customBlockedDomains,
      screenTimeLimit,
      scheduledAccess,
      blockingStats,
      loading,
      isToggling,
      error,
      toggleCategory,
      setBlockedCategories,
      addBlockedDomain,
      removeBlockedDomain,
      setScreenTimeLimit,
      setScheduledAccess,
      toggleParentalControls,
      refreshStats,
      clearError,
    ]
  );

  return (
    <ParentalControlsContext.Provider value={contextValue}>
      {children}
    </ParentalControlsContext.Provider>
  );
}

export function useParentalControls() {
  const context = useContext(ParentalControlsContext);
  if (context === undefined) {
    throw new Error('useParentalControls must be used within a ParentalControlsProvider');
  }
  return context;
}
