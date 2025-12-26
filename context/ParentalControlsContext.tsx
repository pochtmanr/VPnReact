import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';

// Storage keys
const STORAGE_KEYS = {
  PARENTAL_PIN: '@parental/pin',
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
  isPinSet: boolean;
  isPinVerified: boolean;
  blockedCategories: ContentCategory[];
  customBlockedDomains: string[];
  screenTimeLimit: number | null; // minutes per day, null = unlimited
  scheduledAccess: ScheduledAccess | null;
  blockingStats: BlockingStats | null;
  loading: boolean;

  // PIN Management
  setPin: (pin: string) => Promise<boolean>;
  verifyPin: (pin: string) => Promise<boolean>;
  removePin: () => Promise<void>;
  lockControls: () => void;

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
}

const ParentalControlsContext = createContext<ParentalControlsContextType | undefined>(undefined);

// AdGuard Home API configuration
const ADGUARD_API = {
  baseUrl: 'http://72.61.87.54:3000',
  username: 'admin',
  password: 'VpnAdmin123',
};

export function ParentalControlsProvider({ children }: { children: React.ReactNode }) {
  const { account } = useAuth();

  // State
  const [isEnabled, setIsEnabled] = useState(false);
  const [isPinSet, setIsPinSet] = useState(false);
  const [isPinVerified, setIsPinVerified] = useState(false);
  const [blockedCategories, setBlockedCategoriesState] = useState<ContentCategory[]>([]);
  const [customBlockedDomains, setCustomBlockedDomainsState] = useState<string[]>([]);
  const [screenTimeLimit, setScreenTimeLimitState] = useState<number | null>(null);
  const [scheduledAccess, setScheduledAccessState] = useState<ScheduledAccess | null>(null);
  const [blockingStats, setBlockingStats] = useState<BlockingStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const [
        pin,
        enabled,
        categories,
        domains,
        timeLimit,
        schedule,
      ] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.PARENTAL_PIN),
        AsyncStorage.getItem(STORAGE_KEYS.PARENTAL_ENABLED),
        AsyncStorage.getItem(STORAGE_KEYS.BLOCKED_CATEGORIES),
        AsyncStorage.getItem(STORAGE_KEYS.CUSTOM_BLOCKED_DOMAINS),
        AsyncStorage.getItem(STORAGE_KEYS.SCREEN_TIME_LIMIT),
        AsyncStorage.getItem(STORAGE_KEYS.SCHEDULED_ACCESS),
      ]);

      setIsPinSet(!!pin);
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

  // PIN Management
  const setPin = useCallback(async (pin: string): Promise<boolean> => {
    try {
      // Simple hash for storage (in production, use proper encryption)
      const hashedPin = btoa(pin);
      await AsyncStorage.setItem(STORAGE_KEYS.PARENTAL_PIN, hashedPin);
      setIsPinSet(true);
      setIsPinVerified(true);
      return true;
    } catch (error) {
      console.error('Error setting PIN:', error);
      return false;
    }
  }, []);

  const verifyPin = useCallback(async (pin: string): Promise<boolean> => {
    try {
      const storedPin = await AsyncStorage.getItem(STORAGE_KEYS.PARENTAL_PIN);
      const hashedInput = btoa(pin);
      const isValid = storedPin === hashedInput;
      if (isValid) {
        setIsPinVerified(true);
      }
      return isValid;
    } catch (error) {
      console.error('Error verifying PIN:', error);
      return false;
    }
  }, []);

  const removePin = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.PARENTAL_PIN);
      setIsPinSet(false);
      setIsPinVerified(false);
    } catch (error) {
      console.error('Error removing PIN:', error);
    }
  }, []);

  const lockControls = useCallback(() => {
    setIsPinVerified(false);
  }, []);

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
    setIsEnabled(enabled);
    await AsyncStorage.setItem(STORAGE_KEYS.PARENTAL_ENABLED, String(enabled));

    if (enabled) {
      await syncWithAdGuard(blockedCategories, customBlockedDomains);
    }
  }, [blockedCategories, customBlockedDomains]);

  // Sync blocking rules with AdGuard Home
  const syncWithAdGuard = async (categories: ContentCategory[], domains: string[]) => {
    try {
      const auth = btoa(`${ADGUARD_API.username}:${ADGUARD_API.password}`);

      // Build filtering rules based on categories
      const rules: string[] = [];

      // Add category-based blocking (AdGuard uses special syntax)
      if (categories.includes('adult')) {
        // AdGuard has built-in safe browsing for adult content
        await fetch(`${ADGUARD_API.baseUrl}/control/safebrowsing/enable`, {
          method: 'POST',
          headers: { 'Authorization': `Basic ${auth}` },
        });
        await fetch(`${ADGUARD_API.baseUrl}/control/parental/enable`, {
          method: 'POST',
          headers: { 'Authorization': `Basic ${auth}` },
        });
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
      const response = await fetch(`${ADGUARD_API.baseUrl}/control/filtering/set_rules`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rules }),
      });

      if (!response.ok) {
        console.error('AdGuard API error:', response.status, await response.text());
      }

      console.log('AdGuard sync completed:', { categories, domains, rulesCount: rules.length, rules });
    } catch (error) {
      console.error('Error syncing with AdGuard:', error);
    }
  };

  // Refresh blocking stats from AdGuard
  const refreshStats = useCallback(async () => {
    try {
      const auth = btoa(`${ADGUARD_API.username}:${ADGUARD_API.password}`);

      const response = await fetch(`${ADGUARD_API.baseUrl}/control/stats`, {
        headers: { 'Authorization': `Basic ${auth}` },
      });

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

  return (
    <ParentalControlsContext.Provider
      value={{
        isEnabled,
        isPinSet,
        isPinVerified,
        blockedCategories,
        customBlockedDomains,
        screenTimeLimit,
        scheduledAccess,
        blockingStats,
        loading,
        setPin,
        verifyPin,
        removePin,
        lockControls,
        toggleCategory,
        setBlockedCategories,
        addBlockedDomain,
        removeBlockedDomain,
        setScreenTimeLimit,
        setScheduledAccess,
        toggleParentalControls,
        refreshStats,
      }}
    >
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
