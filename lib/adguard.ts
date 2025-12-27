// AdGuard Home API Service
// Connects to the AdGuard Home DNS server running on the VPN server

// Use internal VPN IP when connected, public IP otherwise
const ADGUARD_API = {
  baseUrls: ['http://10.0.0.1:3000', 'http://72.61.87.54:3000'],
  username: 'admin',
  password: 'VpnAdmin123',
};

interface AdGuardStats {
  num_dns_queries: number;
  num_blocked_filtering: number;
  num_replaced_safebrowsing: number;
  num_replaced_parental: number;
  avg_processing_time: number;
  top_blocked_domains: Array<Record<string, number>>;
  blocked_filtering: number[];
  dns_queries: number[];
}

interface AdGuardStatus {
  protection_enabled: boolean;
  running: boolean;
  version: string;
}

interface AdGuardFilteringStatus {
  enabled: boolean;
  filters: Array<{
    id: number;
    name: string;
    rules_count: number;
    enabled: boolean;
  }>;
}

interface FeatureStatus {
  enabled: boolean;
}

export interface AdBlockStats {
  totalBlocked: number;
  totalQueries: number;
  blockRate: number;
  isEnabled: boolean;
  safeBrowsingEnabled: boolean;
  parentalEnabled: boolean;
  filterRulesCount: number;
}

// Helper to make API request with fallback URLs and timeout
async function adguardFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const auth = btoa(`${ADGUARD_API.username}:${ADGUARD_API.password}`);
  const headers = {
    'Authorization': `Basic ${auth}`,
    'Content-Type': 'application/json',
    ...options.headers,
  };

  let lastError: Error | null = null;

  for (const baseUrl of ADGUARD_API.baseUrls) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

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
    } catch (error) {
      console.log(`AdGuard API request to ${baseUrl} failed:`, error);
      lastError = error as Error;
      // Try next URL
    }
  }

  throw lastError || new Error('All AdGuard API endpoints failed');
}

async function fetchAdGuard<T>(endpoint: string): Promise<T | null> {
  try {
    const response = await adguardFetch(endpoint);

    if (!response.ok) {
      console.warn(`AdGuard API error: ${response.status}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.warn('AdGuard API fetch error:', error);
    return null;
  }
}

async function postAdGuard(endpoint: string, body?: object): Promise<boolean> {
  try {
    const response = await adguardFetch(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });

    return response.ok;
  } catch (error) {
    console.warn('AdGuard API post error:', error);
    return false;
  }
}

export async function getAdBlockStats(): Promise<AdBlockStats> {
  const [stats, filtering, safebrowsing, parental] = await Promise.all([
    fetchAdGuard<AdGuardStats>('/control/stats'),
    fetchAdGuard<AdGuardFilteringStatus>('/control/filtering/status'),
    fetchAdGuard<FeatureStatus>('/control/safebrowsing/status'),
    fetchAdGuard<FeatureStatus>('/control/parental/status'),
  ]);

  const totalBlocked = stats?.num_blocked_filtering ?? 0;
  const totalQueries = stats?.num_dns_queries ?? 0;
  const blockRate = totalQueries > 0 ? (totalBlocked / totalQueries) * 100 : 0;

  const filterRulesCount = filtering?.filters?.reduce(
    (sum, f) => sum + (f.enabled ? f.rules_count : 0),
    0
  ) ?? 0;

  return {
    totalBlocked,
    totalQueries,
    blockRate: Math.round(blockRate * 10) / 10,
    isEnabled: filtering?.enabled ?? false,
    safeBrowsingEnabled: safebrowsing?.enabled ?? false,
    parentalEnabled: parental?.enabled ?? false,
    filterRulesCount,
  };
}

export async function setFilteringEnabled(enabled: boolean): Promise<boolean> {
  return postAdGuard('/control/filtering/config', {
    enabled,
    interval: 24,
  });
}

export async function setSafeBrowsingEnabled(enabled: boolean): Promise<boolean> {
  const endpoint = enabled ? '/control/safebrowsing/enable' : '/control/safebrowsing/disable';
  return postAdGuard(endpoint);
}

export async function setParentalEnabled(enabled: boolean): Promise<boolean> {
  const endpoint = enabled ? '/control/parental/enable' : '/control/parental/disable';
  return postAdGuard(endpoint);
}
